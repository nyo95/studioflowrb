import { randomUUID } from "node:crypto";

import type { AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey } from "@platform/core/storage";

import { fullBlockers, todoBlockers } from "../domain/blockers";
import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import {
  availablePhaseCommands,
  canActivatePhase,
  isLegacySupervisionDefinition,
  isPhaseModifiable,
  nextRevision,
  revisionLabel,
  waitingDays,
  type PhaseSeat,
  type PhaseSnapshot,
  type PhaseStatus,
} from "../domain/phase";
import {
  P,
  conflict,
  hasPermission,
  invalid,
  loadWritablePhase,
  loadWritableProject,
  notFound,
  nowOf,
  requireCommand,
  requirePermission,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";
import { readBlockerCounts } from "./blocker-query";

type PhaseRow = Awaited<ReturnType<TxClient["sfPhase"]["findUniqueOrThrow"]>>;
type ProjectRow = Awaited<ReturnType<TxClient["sfProject"]["findUniqueOrThrow"]>>;

function invalidState(message = "This action is not available in the phase's current state."): AppError {
  return conflict("PHASE_INVALID_STATE", message);
}

function lockedError(): AppError {
  return conflict("PHASE_LOCKED", "This project is approved and locked. Reopen it first.");
}

function resolvePhaseName(phase: { name_snapshot: string }): string {
  return phase.name_snapshot;
}

export function createPhaseService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  async function loadPhase(tx: TxClient, projectId: string, phaseId: string): Promise<{ phase: PhaseRow; project: ProjectRow }> {
    const phase = await tx.sfPhase.findUnique({ where: { id: phaseId }, include: { project: true } });
    if (!phase || phase.project_id !== projectId) throw notFound("phase");
    if (phase.project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
    const { project, ...rest } = phase;
    return { phase: rest, project };
  }

  async function activeRevision(tx: TxClient | Db, phaseId: string) {
    return tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: "ACTIVE" } });
  }

  async function latestRevision(tx: TxClient, phaseId: string) {
    return tx.sfRevision.findFirst({ where: { phase_id: phaseId }, orderBy: [{ major: "desc" }, { minor: "desc" }] });
  }

  async function closeRevision(tx: TxClient, revisionId: string) {
    await tx.sfRevision.update({ where: { id: revisionId }, data: { status: "COMPLETED", closed_at: nowOf(ports) } });
  }

  async function setPhase(tx: TxClient, phase: PhaseRow, data: { status: PhaseStatus; is_locked?: boolean }) {
    await tx.sfPhase.update({ where: { id: phase.id }, data: { ...data, status_changed_at: nowOf(ports) } });
  }

  async function nextPhaseExists(tx: TxClient, phase: PhaseRow): Promise<boolean> {
    return (await tx.sfPhase.count({ where: { project_id: phase.project_id, order_index: phase.order_index + 1 } })) > 0;
  }

  async function completeProjectIfLast(tx: TxClient, phase: PhaseRow, project: ProjectRow, actor: AuditActor): Promise<boolean> {
    if (await nextPhaseExists(tx, phase)) return false;
    if (project.status !== "COMPLETED") {
      await tx.sfProject.update({ where: { id: project.id }, data: { status: "COMPLETED" } });
      await writeAudit(ports, tx, { action: "studioflow.project.status-changed", entityType: "project", entityId: project.id, actor, changes: { status: { from: project.status, to: "COMPLETED" } }, metadata: { projectId: project.id, reason: "last-phase-finished" } });
    }
    return true;
  }

  async function assertFullyUnblocked(tx: TxClient, phaseId: string) {
    const blockers = fullBlockers(await readBlockerCounts(tx, phaseId));
    if (blockers.total > 0) {
      throw new AppError("CONFLICT", "PHASE_APPROVAL_BLOCKED", `Cannot proceed: ${blockers.reasons.join(", ")}.`, { details: { reasons: blockers.reasons } });
    }
  }

  async function audit(tx: TxClient, actor: AuditActor, action: string, phase: PhaseRow, from: PhaseStatus, to: PhaseStatus, metadata: Record<string, unknown> = {}) {
    await writeAudit(ports, tx, {
      action: `studioflow.phase.${action}`,
      entityType: "phase",
      entityId: phase.id,
      actor,
      changes: from === to ? undefined : { status: { from, to } },
      metadata: { projectId: phase.project_id, phaseName: phase.name_snapshot, definitionId: phase.definition_id, ...metadata },
    });
  }

  type PhaseCommandInput = CommandContext & { projectId: string; phaseId: string };

  const commands = {
    async activatePhase(input: PhaseCommandInput) {
      requireCommand(input, P.phaseWork);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.status !== "PENDING") throw invalidState("Only a phase that has not started can be started.");
        if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active to start a phase.");
        const previous = await tx.sfPhase.findFirst({ where: { project_id: project.id, order_index: phase.order_index - 1 } });
        if (!canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null)) {
          throw conflict("PHASE_SEQUENTIAL", `${resolvePhaseName(phase)} starts after ${resolvePhaseName(previous!)} is approved.`);
        }
        const latest = await latestRevision(tx, phase.id);
        const number = latest ? nextRevision(latest, "CLIENT") : { major: 1, minor: 0 };
        await setPhase(tx, phase, { status: "IN_PROGRESS", is_locked: false });
        const revision = await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, ...number } });
        await audit(tx, input.actor, "activated", phase, "PENDING", "IN_PROGRESS", { revisionId: revision.id, revision: revisionLabel(number, phase.prefix_snapshot) });
        return { phaseId: phase.id };
      });
    },

    async bypassPhase(input: PhaseCommandInput & { reason: string }) {
      requireCommand(input, P.phaseReview);
      const reason = requiredText(input.reason, "BYPASS_REASON_REQUIRED", "A reason", 500);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.status !== "PENDING") throw invalidState("Only a phase that has not started can be skipped.");
        if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active to skip a phase.");
        const hasNext = await nextPhaseExists(tx, phase);
        const target: PhaseStatus = hasNext ? "READY_FOR_NEXT" : "COMPLETED";
        await setPhase(tx, phase, { status: target, is_locked: true });
        const latest = await latestRevision(tx, phase.id);
        if (!latest) await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, major: 1, minor: 0, status: "COMPLETED", closed_at: nowOf(ports) } });
        await audit(tx, input.actor, "bypassed", phase, "PENDING", target, { reason });
        if (!hasNext) await completeProjectIfLast(tx, phase, project, input.actor);
        return { phaseId: phase.id };
      });
    },

    async submitForInternalReview(input: PhaseCommandInput) {
      requireCommand(input, P.phaseWork);
      return runTransaction(async (tx) => {
        const { phase } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.is_locked) throw lockedError();
        if (phase.status !== "IN_PROGRESS") throw invalidState("Only a phase in progress can be sent for internal review.");
        if (!(await activeRevision(tx, phase.id))) throw invalidState("Start the phase first.");
        const blockers = todoBlockers(await readBlockerCounts(tx, phase.id));
        if (blockers.total > 0) throw new AppError("CONFLICT", "PHASE_OPEN_TODOS", `Finish ${blockers.reasons.join(", ")} first.`);
        await setPhase(tx, phase, { status: "ON_REVIEW_INTERNAL" });
        await audit(tx, input.actor, "submitted-internal", phase, "IN_PROGRESS", "ON_REVIEW_INTERNAL");
        return { phaseId: phase.id };
      });
    },

    async approveInternal(input: PhaseCommandInput) {
      requireCommand(input, P.phaseReview);
      return runTransaction(async (tx) => {
        const { phase } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.is_locked) throw lockedError();
        if (phase.status !== "ON_REVIEW_INTERNAL") throw invalidState("Only a phase in internal review can be approved internally.");
        await assertFullyUnblocked(tx, phase.id);
        await setPhase(tx, phase, { status: "APPROVED_INTERNAL" });
        await audit(tx, input.actor, "approved-internal", phase, "ON_REVIEW_INTERNAL", "APPROVED_INTERNAL");
        return { phaseId: phase.id };
      });
    },

    async submitForClientReview(input: PhaseCommandInput) {
      requireCommand(input, P.phaseReview);
      return runTransaction(async (tx) => {
        const { phase } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.is_locked) throw lockedError();
        const from = phase.status as PhaseStatus;
        if (!["IN_PROGRESS", "ON_REVIEW_INTERNAL", "APPROVED_INTERNAL"].includes(from)) throw invalidState("This phase cannot be sent to the client now.");
        if (!(await activeRevision(tx, phase.id))) throw invalidState("Start the phase first.");
        await assertFullyUnblocked(tx, phase.id);
        await setPhase(tx, phase, { status: "ON_REVIEW_CLIENT" });
        await audit(tx, input.actor, "submitted-client", phase, from, "ON_REVIEW_CLIENT");
        return { phaseId: phase.id };
      });
    },

    /** V2-D1: new revision; open FEEDBACK activities become SfChecklistItem todos (not SfActivity TODO). */
    async rejectPhase(input: PhaseCommandInput & { type: "INTERNAL" | "CLIENT" }) {
      requireCommand(input, P.phaseReview);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.is_locked) throw lockedError();
        const from = phase.status as PhaseStatus;
        if (input.type === "INTERNAL" && from !== "ON_REVIEW_INTERNAL") throw invalidState("Only a phase in internal review can be sent back for internal changes.");
        if (input.type === "CLIENT" && from !== "ON_REVIEW_CLIENT") throw invalidState("Only a phase with the client can record client changes.");
        const current = await activeRevision(tx, phase.id);
        if (!current) throw invalidState("This phase has no active revision.");
        await closeRevision(tx, current.id);
        const number = nextRevision(current, input.type);
        const revision = await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, ...number } });
        const feedback = await tx.sfActivity.findMany({ where: { revision_id: current.id, mode: "FEEDBACK", status: "OPEN" }, orderBy: { created_at: "asc" } });
        const fallbackAssignee = phaseSnapshot(phase).seatSnapshot === "drafter" ? project.pic_drafter_id : project.pic_designer_id;
        const converted: string[] = [];
        for (const item of feedback) {
          // V2-D1: Feedback converts to SfChecklistItem (Todo SSOT) instead of a new SfActivity(TODO).
          const id = randomUUID();
          await tx.sfChecklistItem.create({
            data: {
              id,
              project_id: project.id,
              phase_id: phase.id,
              label: item.content,
              is_checked: false,
              assigned_to_id: item.assigned_to_id ?? fallbackAssignee,
              due_at: item.due_at,
              created_by_id: item.created_by_id,
            },
          });
          converted.push(id);
        }
        // Mark the original feedback activities as completed so they no longer count as open work.
        if (feedback.length > 0) {
          await tx.sfActivity.updateMany({ where: { id: { in: feedback.map((item) => item.id) } }, data: { status: "COMPLETED", completed_at: nowOf(ports) } });
        }
        await setPhase(tx, phase, { status: "IN_PROGRESS" });
        await audit(tx, input.actor, input.type === "CLIENT" ? "rejected-client" : "rejected-internal", phase, from, "IN_PROGRESS", {
          previousRevision: revisionLabel(current, phase.prefix_snapshot),
          revision: revisionLabel(number, phase.prefix_snapshot),
          revisionId: revision.id,
          feedbackConverted: converted.length,
        });
        return { phaseId: phase.id, revision: revisionLabel(number, phase.prefix_snapshot), converted: converted.length };
      });
    },

    async approveClient(input: PhaseCommandInput) {
      requireCommand(input, P.phaseReview);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.is_locked) throw lockedError();
        if (phase.status !== "ON_REVIEW_CLIENT") throw invalidState("Only a phase with the client can be approved.");
        await assertFullyUnblocked(tx, phase.id);
        await setPhase(tx, phase, { status: "READY_FOR_NEXT", is_locked: true });
        const current = await activeRevision(tx, phase.id);
        if (current) await closeRevision(tx, current.id);
        await audit(tx, input.actor, "approved-client", phase, "ON_REVIEW_CLIENT", "READY_FOR_NEXT", { revision: current ? revisionLabel(current, phase.prefix_snapshot) : null });
        const projectCompleted = await completeProjectIfLast(tx, phase, project, input.actor);
        return { phaseId: phase.id, projectCompleted };
      });
    },

    async reopenPhase(input: PhaseCommandInput & { intent: "INTERNAL" | "CLIENT"; reason: string }) {
      requireCommand(input, P.phaseReview);
      const reason = requiredText(input.reason, "REOPEN_REASON_REQUIRED", "A reason", 500);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        const from = phase.status as PhaseStatus;
        if (!phase.is_locked && from !== "PENDING") throw invalidState("Only an approved, finished, or not-started phase can be reopened.");
        if (from === "PENDING") {
          // A not-started phase follows the same start rules as "Start phase".
          if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active to reopen a phase.");
          const previous = await tx.sfPhase.findFirst({ where: { project_id: project.id, order_index: phase.order_index - 1 } });
          if (!canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null)) {
            throw conflict("PHASE_SEQUENTIAL", `${resolvePhaseName(phase)} starts after ${resolvePhaseName(previous!)} is approved.`);
          }
        }
        const current = await activeRevision(tx, phase.id);
        if (current) await closeRevision(tx, current.id);
        const base = current ?? (await latestRevision(tx, phase.id));
        const number = nextRevision(base, input.intent);
        const revision = await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, ...number } });
        await setPhase(tx, phase, { status: "IN_PROGRESS", is_locked: false });
        await audit(tx, input.actor, "reopened", phase, from, "IN_PROGRESS", { reason, intent: input.intent, revision: revisionLabel(number, phase.prefix_snapshot), revisionId: revision.id });
        return { phaseId: phase.id, revision: revisionLabel(number, phase.prefix_snapshot) };
      });
    },

    async completeSupervision(input: PhaseCommandInput) {
      requireCommand(input, P.phaseReview);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        if (!isLegacySupervisionDefinition(phase.definition_id) || phase.status !== "IN_PROGRESS" || phase.is_locked) throw invalidState("Only Supervision in progress can be finished.");
        await setPhase(tx, phase, { status: "COMPLETED", is_locked: true });
        const current = await activeRevision(tx, phase.id);
        if (current) await closeRevision(tx, current.id);
        await audit(tx, input.actor, "supervision-completed", phase, "IN_PROGRESS", "COMPLETED");
        await completeProjectIfLast(tx, phase, project, input.actor);
        return { phaseId: phase.id };
      });
    },

    /** Legacy admin hard reset; the full history snapshot goes into the audit event. */
    async overrideRevision(input: PhaseCommandInput & { mode: "HARD_RESET_ACTIVE" | "HARD_RESET_PENDING"; major?: number; minor?: number; note: string }) {
      requireCommand(input, P.phaseOverride);
      const note = requiredText(input.note, "OVERRIDE_NOTE_REQUIRED", "A note", 1000);
      if (input.mode === "HARD_RESET_ACTIVE") {
        if (!Number.isInteger(input.major) || !Number.isInteger(input.minor) || input.major! < 1 || input.minor! < 0) {
          throw invalid("OVERRIDE_VERSION_INVALID", "Enter a revision like 1.0 (major 1 or higher, minor 0 or higher).");
        }
      }
      return runTransaction(async (tx) => {
        const { phase } = await loadPhase(tx, input.projectId, input.phaseId);
        const revisions = await tx.sfRevision.findMany({
          where: { phase_id: phase.id },
          orderBy: [{ major: "asc" }, { minor: "asc" }],
          select: { id: true, major: true, minor: true, status: true, created_at: true, activities: { select: { content: true, mode: true, status: true } } },
        });
        // Snapshot deliverable provenance before revision destruction
        const deliverables = await tx.sfDeliverable.findMany({ where: { phase_id: phase.id }, select: { id: true, name: true, revision_id: true, storage_key: true, created_at: true } });
        const deliverableSnapshot = deliverables.map((d) => ({
          id: d.id, name: d.name, revisionId: d.revision_id, storageKey: d.storage_key, createdAt: d.created_at.toISOString(),
        }));
        const history = revisions.map((rev) => ({ version: revisionLabel(rev, phase.prefix_snapshot), status: rev.status, createdAt: rev.created_at.toISOString(), activities: rev.activities }));
        if (input.mode === "HARD_RESET_ACTIVE" && revisions.length > 0) {
          const latest = revisions[revisions.length - 1]!;
          const isForward = input.major! > latest.major || (input.major! === latest.major && input.minor! > latest.minor);
          if (!isForward) throw invalid("OVERRIDE_VERSION_BACKWARD", `v${input.major}.${input.minor} must be higher than the latest v${latest.major}.${latest.minor}.`);
        }
        // Detach deliverables from their revisions (set revision_id to null) before deleting revisions
        await tx.sfDeliverable.updateMany({ where: { phase_id: phase.id, revision_id: { not: null } }, data: { revision_id: null } });
        await tx.sfRevision.deleteMany({ where: { phase_id: phase.id } });
        const from = phase.status as PhaseStatus;
        let target: PhaseStatus = "PENDING";
        let revisionId: string | null = null;
        if (input.mode === "HARD_RESET_ACTIVE") {
          target = "IN_PROGRESS";
          revisionId = randomUUID();
          await tx.sfRevision.create({ data: { id: revisionId, phase_id: phase.id, major: input.major!, minor: input.minor! } });
        }
        await setPhase(tx, phase, { status: target, is_locked: false });
        await audit(tx, input.actor, "revision-overridden", phase, from, target, {
          mode: input.mode,
          note,
          targetRevision: input.mode === "HARD_RESET_ACTIVE" ? `v${input.major}.${input.minor}` : null,
          history,
          deliverableSnapshot,
        });
        return { phaseId: phase.id, revisionId };
      });
    },
  };

  // ── Activities ──────────────────────────────────────────────────────────

  async function loadActivity(tx: TxClient, projectId: string, activityId: string) {
    const activity = await tx.sfActivity.findUnique({ where: { id: activityId }, include: { project: true, phase: true, revision: true } });
    if (!activity || activity.project_id !== projectId) throw notFound("item");
    if (activity.project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
    if (activity.phase && !isPhaseModifiable({ status: activity.phase.status as PhaseStatus, isLocked: activity.phase.is_locked })) throw lockedError();
    return activity;
  }

  async function assertAssignee(assigneeId: string | null | undefined) {
    if (!assigneeId) return;
    const holders = await ports.people.listHolders(P.phaseWork);
    if (!holders.some((person) => person.id === assigneeId)) throw invalid("ASSIGNEE_NOT_ELIGIBLE", "The selected person cannot be assigned work.");
  }

  function parseDue(value: string | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    try { return dateOnlyToDate(value); } catch { throw invalid("DUE_DATE_INVALID", "Due date must be a valid date."); }
  }

  const activities = {
    /**
     * V2-D1: SfActivity is FEEDBACK-only. TODO items use SfChecklistItem instead.
     * phaseId is required for FEEDBACK (feedback must belong to a phase+revision).
     */
    async addActivity(input: CommandContext & { projectId: string; phaseId: string; content: string; mode: "FEEDBACK"; dueDate?: string | null; assignedToId?: string | null }) {
      const userId = requireCommand(input, P.phaseWork);
      if (input.mode !== "FEEDBACK") throw invalid("ACTIVITY_TODO_DEPRECATED", "Use a checklist item for to-dos. SfActivity is feedback-only.");
      if (!input.phaseId) throw invalid("FEEDBACK_PHASE_REQUIRED", "Client feedback must belong to a phase.");
      const content = requiredText(input.content, "ACTIVITY_CONTENT_REQUIRED", "Text", 2000);
      const due = parseDue(input.dueDate) ?? null;
      await assertAssignee(input.assignedToId);
      return runTransaction(async (tx) => {
        let phaseId: string | null = null;
        let revisionId: string | null = null;
        if (input.phaseId) {
          const { phase } = await loadPhase(tx, input.projectId, input.phaseId);
          if (!isPhaseModifiable({ status: phase.status as PhaseStatus, isLocked: phase.is_locked })) throw lockedError();
          const revision = await activeRevision(tx, phase.id);
          if (!revision) throw invalidState("Start this phase before recording feedback.");
          phaseId = phase.id;
          revisionId = revision.id;
        } else {
          // This branch is unreachable after the guard above but kept for type safety.
          throw invalid("FEEDBACK_PHASE_REQUIRED", "Client feedback must belong to a phase.");
        }
        const id = randomUUID();
        await tx.sfActivity.create({ data: { id, project_id: input.projectId, phase_id: phaseId, revision_id: revisionId, content, mode: input.mode, due_at: due, assigned_to_id: input.assignedToId ?? null, created_by_id: userId } });
        await writeAudit(ports, tx, { action: "studioflow.activity.created", entityType: "activity", entityId: id, actor: input.actor, metadata: { projectId: input.projectId, phaseId, revisionId, mode: input.mode } });
        return { activityId: id };
      });
    },

    async updateActivity(input: CommandContext & { projectId: string; activityId: string; content?: string; dueDate?: string | null; assignedToId?: string | null }) {
      requireCommand(input, P.phaseWork);
      const due = parseDue(input.dueDate);
      return runTransaction(async (tx) => {
        const activity = await loadActivity(tx, input.projectId, input.activityId);
        // Only a changed assignee is validated, so items kept on a former member stay editable.
        if (input.assignedToId !== undefined && (input.assignedToId ?? null) !== activity.assigned_to_id) await assertAssignee(input.assignedToId);
        const data: { content?: string; due_at?: Date | null; assigned_to_id?: string | null } = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (input.content !== undefined) {
          const content = requiredText(input.content, "ACTIVITY_CONTENT_REQUIRED", "Text", 2000);
          if (content !== activity.content) { data.content = content; changes.content = { from: activity.content, to: content }; }
        }
        if (due !== undefined && dateToDateOnly(due) !== dateToDateOnly(activity.due_at)) { data.due_at = due; changes.dueDate = { from: dateToDateOnly(activity.due_at), to: dateToDateOnly(due) }; }
        if (input.assignedToId !== undefined && (input.assignedToId ?? null) !== activity.assigned_to_id) { data.assigned_to_id = input.assignedToId ?? null; changes.assignedToId = { from: activity.assigned_to_id, to: input.assignedToId ?? null }; }
        if (Object.keys(changes).length === 0) return { activityId: activity.id };
        await tx.sfActivity.update({ where: { id: activity.id }, data });
        await writeAudit(ports, tx, { action: "studioflow.activity.updated", entityType: "activity", entityId: activity.id, actor: input.actor, changes, metadata: { projectId: activity.project_id, phaseId: activity.phase_id } });
        return { activityId: activity.id };
      });
    },

    async setActivityDone(input: CommandContext & { projectId: string; activityId: string; done: boolean }) {
      requireCommand(input, P.phaseWork);
      return runTransaction(async (tx) => {
        const activity = await loadActivity(tx, input.projectId, input.activityId);
        const next = input.done ? "COMPLETED" : "OPEN";
        if (activity.status === next) return { activityId: activity.id };
        await tx.sfActivity.update({ where: { id: activity.id }, data: { status: next, completed_at: input.done ? nowOf(ports) : null } });
        await writeAudit(ports, tx, { action: input.done ? "studioflow.activity.completed" : "studioflow.activity.reopened", entityType: "activity", entityId: activity.id, actor: input.actor, changes: { status: { from: activity.status, to: next } }, metadata: { projectId: activity.project_id, phaseId: activity.phase_id } });
        return { activityId: activity.id };
      });
    },

    async deleteActivity(input: CommandContext & { projectId: string; activityId: string }) {
      requireCommand(input, P.phaseWork);
      return runTransaction(async (tx) => {
        const activity = await loadActivity(tx, input.projectId, input.activityId);
        await tx.sfActivity.delete({ where: { id: activity.id } });
        await writeAudit(ports, tx, { action: "studioflow.activity.deleted", entityType: "activity", entityId: activity.id, actor: input.actor, metadata: { projectId: activity.project_id, phaseId: activity.phase_id, content: activity.content, mode: activity.mode } });
        return { activityId: activity.id };
      });
    },

  };

  // ── Reads ───────────────────────────────────────────────────────────────

  function activityView(row: { id: string; content: string; mode: string; status: string; assigned_to_id: string | null; due_at: Date | null; deferred_from_version: string | null; revision_id: string | null; phase_id: string | null; created_at: Date }) {
    return {
      id: row.id,
      content: row.content,
      // V2-D1: SfActivity is FEEDBACK-only
      mode: "FEEDBACK" as const,
      done: row.status === "COMPLETED",
      assigneeId: row.assigned_to_id,
      dueDate: dateToDateOnly(row.due_at),
      deferredFrom: row.deferred_from_version,
      revisionId: row.revision_id,
      phaseId: row.phase_id,
      createdAt: row.created_at,
    };
  }

  function phaseSnapshot(phase: { name_snapshot: string; prefix_snapshot: string; seat_snapshot: string }): PhaseSnapshot {
    return { nameSnapshot: phase.name_snapshot, prefixSnapshot: phase.prefix_snapshot, seatSnapshot: phase.seat_snapshot as PhaseSeat };
  }

  const reads = {
    /** Phase strip + rail data for one project. */
    async listProjectPhases(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const now = nowOf(ports);
      const phases = await db.sfPhase.findMany({
        where: { project_id: input.projectId },
        orderBy: { order_index: "asc" },
        select: {
          id: true, project_id: true, definition_id: true, order_index: true, status: true, is_locked: true,
          allow_parallel: true, name_snapshot: true, prefix_snapshot: true, seat_snapshot: true,
          status_changed_at: true,
          revisions: { where: { status: "ACTIVE" }, take: 1, select: { major: true, minor: true } },
        },
      });
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { status: true, archived_at: true } });
      const results = [];
      for (const phase of phases) {
        const counts = await readBlockerCounts(db, phase.id);
        const status = phase.status as PhaseStatus;
        const previous = phases.find((p) => p.order_index === phase.order_index - 1) ?? null;
        const canStart = canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null);
        const archived = project?.archived_at != null;
        const commands = archived ? [] : availablePhaseCommands({ status, isLocked: phase.is_locked, legacySupervision: isLegacySupervisionDefinition(phase.definition_id) }).filter((command) => {
          if (command === "activate") return canStart && project?.status === "ACTIVE";
          if (command === "bypass") return project?.status === "ACTIVE";
          if (command === "reopen" && status === "PENDING") return canStart && project?.status === "ACTIVE" && phase.revisions.length > 0;
          return true;
        });
        const snap = phaseSnapshot(phase);
        results.push({
          id: phase.id,
          definitionId: phase.definition_id,
          label: snap.nameSnapshot,
          orderIndex: phase.order_index,
          status,
          isLocked: phase.is_locked,
          allowParallel: phase.allow_parallel,
          seat: snap.seatSnapshot,
          waitingDays: status === "PENDING" || status === "COMPLETED" || status === "READY_FOR_NEXT" ? null : waitingDays(phase.status_changed_at, now),
          statusChangedAt: phase.status_changed_at,
          activeRevision: phase.revisions[0] ? revisionLabel(phase.revisions[0], snap.prefixSnapshot) : null,
          openRootChecklist: counts.openRootChecklistItems,
          blockers: fullBlockers(counts),
          todoBlockers: todoBlockers(counts),
          commands,
          startBlockedReason: status === "PENDING" && !canStart && previous ? `Starts after ${phaseSnapshot(previous).nameSnapshot} is approved.` : null,
        });
      }
      return results;
    },

    async getPhaseDetail(input: ReadContext & { projectId: string; phaseId: string }) {
      requireRead(input.grants);
      const phase = await db.sfPhase.findUnique({
        where: { id: input.phaseId },
        select: {
          id: true, project_id: true, definition_id: true, order_index: true, status: true, is_locked: true,
          allow_parallel: true, name_snapshot: true, prefix_snapshot: true, seat_snapshot: true,
          status_changed_at: true,
          project: { select: { id: true, name: true, archived_at: true, status: true, pic_designer_id: true, pic_drafter_id: true } },
          revisions: {
            orderBy: [{ major: "desc" }, { minor: "desc" }],
            select: {
              id: true, major: true, minor: true, status: true, created_at: true, closed_at: true,
              activities: { orderBy: { created_at: "asc" }, select: { id: true, content: true, mode: true, status: true, assigned_to_id: true, due_at: true, deferred_from_version: true, revision_id: true, phase_id: true, created_at: true } },
            },
          },
        },
      });
      if (!phase || phase.project_id !== input.projectId) throw notFound("phase");
      const status = phase.status as PhaseStatus;
      const counts = await readBlockerCounts(db, phase.id);
      const previous = await db.sfPhase.findFirst({ where: { project_id: phase.project_id, order_index: phase.order_index - 1 }, select: { name_snapshot: true, prefix_snapshot: true, seat_snapshot: true, status: true, order_index: true } });
      const canStart = canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null);
      const active = phase.revisions.find((rev) => rev.status === "ACTIVE") ?? null;
      const archived = phase.project.archived_at !== null;
      const commands = archived ? [] : availablePhaseCommands({ status, isLocked: phase.is_locked, legacySupervision: isLegacySupervisionDefinition(phase.definition_id) }).filter((command) => {
        if (command === "activate") return canStart && phase.project.status === "ACTIVE";
        if (command === "bypass") return phase.project.status === "ACTIVE";
        if (command === "reopen" && status === "PENDING") return canStart && phase.project.status === "ACTIVE" && phase.revisions.length > 0;
        return true;
      });
      const snap = phaseSnapshot(phase);
      const seatUserId = snap.seatSnapshot === "drafter" ? phase.project.pic_drafter_id : phase.project.pic_designer_id;
      // R2.4E: Warning projection — non-blocking indicators for UI.
      // Warning-only checklist items (the merged requirements) count here, never in blockers.
      const [optionalOpen, deliverables, refRevisionId] = await Promise.all([
        db.sfChecklistItem.count({ where: { phase_id: phase.id, parent_id: null, is_checked: false, is_blocking: false } }),
        db.sfDeliverable.findMany({ where: { phase_id: phase.id }, select: { revision_id: true } }),
        referenceRevisionId(db, phase.id),
      ]);
      return {
        id: phase.id,
        definitionId: phase.definition_id,
        label: snap.nameSnapshot,
        orderIndex: phase.order_index,
        status,
        isLocked: phase.is_locked,
        allowParallel: phase.allow_parallel,
        seat: snap.seatSnapshot,
        seatUserId,
        statusChangedAt: phase.status_changed_at,
        waitingDays: (status === "PENDING" || status === "COMPLETED" || status === "READY_FOR_NEXT") ? null : waitingDays(phase.status_changed_at, nowOf(ports)),
        modifiable: !archived && isPhaseModifiable({ status, isLocked: phase.is_locked }),
        startBlockedReason: status === "PENDING" && !canStart && previous ? `Starts after ${resolvePhaseName(previous)} is approved.` : phase.project.status !== "ACTIVE" && status === "PENDING" ? "The project is not active." : null,
        commands,
        blockers: fullBlockers(counts),
        todoBlockers: todoBlockers(counts),
        warnings: { optionalOpen, deliverableStatus: computeDeliverableStatus(deliverables, refRevisionId) },
        activeRevision: active ? { id: active.id, label: revisionLabel(active, snap.prefixSnapshot), createdAt: active.created_at, activities: active.activities.map(activityView) } : null,
        history: phase.revisions.filter((rev) => rev.status !== "ACTIVE").map((rev) => ({
          id: rev.id,
          label: revisionLabel(rev, snap.prefixSnapshot),
          createdAt: rev.created_at,
          closedAt: rev.closed_at,
          activities: rev.activities.map(activityView),
        })),
      };
    },

    capabilities(grants: ReadContext["grants"]) {
      return {
        work: hasPermission(grants, P.phaseWork),
        review: hasPermission(grants, P.phaseReview),
        override: hasPermission(grants, P.phaseOverride),
      };
    },
  };

  const phaseTemplates = {
    async listPhaseTemplates(input: ReadContext) {
      requireRead(input.grants);
      const rows = await db.sfPhaseTemplate.findMany({
        include: { definitions: { orderBy: { order_index: "asc" } } },
        orderBy: { name: "asc" },
      });
      return rows.map(toTemplateView);
    },

    async createPhaseTemplate(input: CommandContext & { name: string; isDefault?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const name = requiredText(input.name, "TEMPLATE_NAME_REQUIRED", "Template name", 200);
      const isDefault = input.isDefault ?? false;
      return runTransaction(async (tx) => {
        if (isDefault) {
          await tx.sfPhaseTemplate.updateMany({ where: { is_default: true }, data: { is_default: false } });
        }
        const template = await tx.sfPhaseTemplate.create({ data: { name, is_default: isDefault } });
        await writeAudit(ports, tx, { action: "studioflow.phase-template.created", entityType: "phase-template", entityId: template.id, actor: input.actor, metadata: { name, isDefault } });
        return { templateId: template.id };
      });
    },

    async updatePhaseTemplate(input: CommandContext & { templateId: string; name?: string; isActive?: boolean; isDefault?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");

        if (input.isActive === false && template.is_default) {
          throw conflict("CANNOT_DEACTIVATE_DEFAULT", "Cannot deactivate the default template. Set another template as default first.");
        }

        if (input.isDefault === false && template.is_default) {
          const otherActive = await tx.sfPhaseTemplate.findFirst({ where: { id: { not: input.templateId }, is_active: true } });
          if (!otherActive) throw conflict("NEED_DEFAULT_TEMPLATE", "At least one template must be the default.");
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const data: Record<string, unknown> = {};
        if (input.name !== undefined) {
          const name = requiredText(input.name, "TEMPLATE_NAME_REQUIRED", "Template name", 200);
          if (name !== template.name) { changes.name = { from: template.name, to: name }; data.name = name; }
        }
        if (input.isActive !== undefined && input.isActive !== template.is_active) {
          changes.isActive = { from: template.is_active, to: input.isActive };
          data.is_active = input.isActive;
        }
        if (input.isDefault !== undefined && input.isDefault !== template.is_default) {
          changes.isDefault = { from: template.is_default, to: input.isDefault };
          data.is_default = input.isDefault;
        }

        if (input.isDefault === true) {
          const willBeActive = input.isActive !== undefined ? input.isActive : template.is_active;
          if (!willBeActive) throw conflict("CANNOT_DEFAULT_INACTIVE", "Cannot set an inactive template as the default.");
          await tx.sfPhaseTemplate.updateMany({ where: { is_default: true, id: { not: input.templateId } }, data: { is_default: false } });
        }

        if (Object.keys(data).length === 0) return { templateId: input.templateId };
        await tx.sfPhaseTemplate.update({ where: { id: input.templateId }, data });
        await writeAudit(ports, tx, { action: "studioflow.phase-template.updated", entityType: "phase-template", entityId: input.templateId, actor: input.actor, changes, metadata: { name: template.name } });
        return { templateId: input.templateId };
      });
    },

    async deletePhaseTemplate(input: CommandContext & { templateId: string }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");
        if (template.is_default) throw conflict("CANNOT_DELETE_DEFAULT", "Cannot delete the default template. Set another template as default first.");
        const usedBy = await tx.sfProject.count({ where: { phases: { some: { definition: { template_id: input.templateId } } } } });
        if (usedBy > 0) throw conflict("PHASE_TEMPLATE_IN_USE", `${usedBy} project${usedBy === 1 ? "" : "s"} ${usedBy === 1 ? "was" : "were"} created from this template. Deactivate it instead of deleting it.`);
        await tx.sfPhaseDefinition.deleteMany({ where: { template_id: input.templateId } });
        await tx.sfPhaseTemplate.delete({ where: { id: input.templateId } });
        await writeAudit(ports, tx, { action: "studioflow.phase-template.deleted", entityType: "phase-template", entityId: input.templateId, actor: input.actor, metadata: { name: template.name } });
        return { templateId: input.templateId };
      });
    },

    async createPhaseDefinition(input: CommandContext & { templateId: string; name: string; prefix: string; seat?: string; allowParallel?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const name = requiredText(input.name, "PHASE_DEF_NAME_REQUIRED", "Phase name", 200);
      const prefix = requiredText(input.prefix.toUpperCase(), "PREFIX_REQUIRED", "Prefix", 4);
      if (prefix.length < 1 || prefix.length > 4) throw invalid("PREFIX_LENGTH", "Prefix must be 1-4 characters.");
      const seat = input.seat ?? "designer";
      if (seat !== "designer" && seat !== "drafter") throw invalid("INVALID_SEAT", "Seat must be 'designer' or 'drafter'.");
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");
        const existingDef = await tx.sfPhaseDefinition.findFirst({ where: { template_id: input.templateId, prefix } });
        if (existingDef) throw conflict("PREFIX_DUPLICATE", `Prefix "${prefix}" is already used in this template.`);
        const lastDef = await tx.sfPhaseDefinition.findFirst({ where: { template_id: input.templateId }, orderBy: { order_index: "desc" } });
        const orderIndex = (lastDef?.order_index ?? -1) + 1;
        const def = await tx.sfPhaseDefinition.create({
          data: { template_id: input.templateId, name, prefix, order_index: orderIndex, seat, allow_parallel: input.allowParallel ?? false },
        });
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.created", entityType: "phase-definition", entityId: def.id, actor: input.actor, metadata: { templateId: input.templateId, name, prefix, seat } });
        return { definitionId: def.id };
      });
    },

    async updatePhaseDefinition(input: CommandContext & { definitionId: string; name?: string; prefix?: string; seat?: string; allowParallel?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const def = await tx.sfPhaseDefinition.findUnique({ where: { id: input.definitionId } });
        if (!def) throw notFound("phase definition");

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const data: Record<string, unknown> = {};
        if (input.name !== undefined) {
          const name = requiredText(input.name, "PHASE_DEF_NAME_REQUIRED", "Phase name", 200);
          if (name !== def.name) { changes.name = { from: def.name, to: name }; data.name = name; }
        }
        if (input.prefix !== undefined) {
          const prefix = input.prefix.toUpperCase();
          if (prefix.length < 1 || prefix.length > 4) throw invalid("PREFIX_LENGTH", "Prefix must be 1-4 characters.");
          const existing = await tx.sfPhaseDefinition.findFirst({ where: { template_id: def.template_id, prefix, id: { not: input.definitionId } } });
          if (existing) throw conflict("PREFIX_DUPLICATE", `Prefix "${prefix}" is already used in this template.`);
          if (prefix !== def.prefix) { changes.prefix = { from: def.prefix, to: prefix }; data.prefix = prefix; }
        }
        if (input.seat !== undefined) {
          if (input.seat !== "designer" && input.seat !== "drafter") throw invalid("INVALID_SEAT", "Seat must be 'designer' or 'drafter'.");
          if (input.seat !== def.seat) { changes.seat = { from: def.seat, to: input.seat }; data.seat = input.seat; }
        }
        if (input.allowParallel !== undefined) {
          if (input.allowParallel !== def.allow_parallel) { changes.allowParallel = { from: def.allow_parallel, to: input.allowParallel }; data.allow_parallel = input.allowParallel; }
        }

        if (Object.keys(data).length === 0) return { definitionId: input.definitionId };
        await tx.sfPhaseDefinition.update({ where: { id: input.definitionId }, data });
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.updated", entityType: "phase-definition", entityId: input.definitionId, actor: input.actor, changes, metadata: { templateId: def.template_id } });
        return { definitionId: input.definitionId };
      });
    },

    async deletePhaseDefinition(input: CommandContext & { definitionId: string }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const def = await tx.sfPhaseDefinition.findUnique({ where: { id: input.definitionId } });
        if (!def) throw notFound("phase definition");
        // R2.3B: Prevent deleting the final definition from the default template.
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: def.template_id } });
        if (template?.is_default) {
          const count = await tx.sfPhaseDefinition.count({ where: { template_id: def.template_id } });
          if (count <= 1) throw conflict("DEFAULT_TEMPLATE_REQUIRES_PHASE", "Cannot delete the last phase from the default template. Add another phase first, or set a different default.");
        }
        const usedBy = await tx.sfPhase.count({ where: { definition_id: input.definitionId } });
        if (usedBy > 0) throw conflict("PHASE_DEFINITION_IN_USE", `${usedBy} project phase${usedBy === 1 ? "" : "s"} ${usedBy === 1 ? "was" : "were"} created from this phase, so it cannot be deleted.`);
        const checklistTemplates = await tx.sfChecklistTemplate.count({ where: { definition_id: input.definitionId } });
        if (checklistTemplates > 0) throw conflict("PHASE_DEFINITION_HAS_CHECKLIST_TEMPLATES", `${checklistTemplates} checklist template${checklistTemplates === 1 ? "" : "s"} still reference this phase. Remove or reassign ${checklistTemplates === 1 ? "it" : "them"} first.`);
        await tx.sfPhaseDefinition.delete({ where: { id: input.definitionId } });
        const siblings = await tx.sfPhaseDefinition.findMany({ where: { template_id: def.template_id, order_index: { gt: def.order_index } }, orderBy: { order_index: "asc" } });
        for (const sib of siblings) {
          await tx.sfPhaseDefinition.update({ where: { id: sib.id }, data: { order_index: sib.order_index - 1 } });
        }
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.deleted", entityType: "phase-definition", entityId: input.definitionId, actor: input.actor, metadata: { templateId: def.template_id, name: def.name, prefix: def.prefix } });
        return { definitionId: input.definitionId };
      });
    },

    async reorderPhaseDefinitions(input: CommandContext & { templateId: string; orderedIds: string[] }) {
      requirePermission(input.grants, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfPhaseTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("phase template");

        const defs = await tx.sfPhaseDefinition.findMany({ where: { template_id: input.templateId } });
        const defIds = new Set(defs.map((d) => d.id));
        if (input.orderedIds.length !== defs.length) throw invalid("REORDER_MISMATCH", "Ordered IDs must include all template definitions exactly once.");
        for (const id of input.orderedIds) {
          if (!defIds.has(id)) throw invalid("REORDER_INVALID_ID", "Ordered IDs contain unknown definition IDs.");
        }

        // R2.3C: Two-pass reorder to avoid unique constraint violations.
        // Pass 1: move all to temporary high offsets.
        const TEMP_BASE = 10_000;
        for (let i = 0; i < input.orderedIds.length; i++) {
          await tx.sfPhaseDefinition.update({ where: { id: input.orderedIds[i] }, data: { order_index: TEMP_BASE + i } });
        }
        // Pass 2: assign final offsets.
        for (let i = 0; i < input.orderedIds.length; i++) {
          await tx.sfPhaseDefinition.update({ where: { id: input.orderedIds[i] }, data: { order_index: i } });
        }
        await writeAudit(ports, tx, { action: "studioflow.phase-definition.reordered", entityType: "phase-definition", entityId: input.templateId, actor: input.actor, metadata: { orderedIds: input.orderedIds } });
        return { templateId: input.templateId };
      });
    },
  };

  function toTemplateView(row: { id: string; name: string; is_default: boolean; is_active: boolean; definitions: Array<{ id: string; name: string; prefix: string; order_index: number; allow_parallel: boolean; seat: string }> }) {
    return {
      id: row.id,
      name: row.name,
      isDefault: row.is_default,
      isActive: row.is_active,
      definitions: row.definitions.map((d) => ({
        id: d.id,
        name: d.name,
        prefix: d.prefix,
        orderIndex: d.order_index,
        allowParallel: d.allow_parallel,
        seat: d.seat as "designer" | "drafter",
      })),
    };
  }

  // ── Deliverables ─────────────────────────────────────────────────────────

  const DELIVERABLE_SIGNED_URL_SECONDS = 3600;
  const DELIVERABLE_ALLOWED_TYPES: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/zip": "zip",
  };
  const DELIVERABLE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

  /** R2.4C: Reference revision = active revision, or latest completed if no active. */
  async function referenceRevisionId(tx: TxClient, phaseId: string): Promise<string | null> {
    const active = await tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: "ACTIVE" }, select: { id: true } });
    if (active) return active.id;
    const latest = await tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: "COMPLETED" }, orderBy: [{ major: "desc" }, { minor: "desc" }], select: { id: true } });
    return latest?.id ?? null;
  }

  /** R2.4D: Deliverable status computed in service, not UI. */
  function computeDeliverableStatus(deliverables: { revision_id: string | null }[], refRevisionId: string | null): "MISSING" | "CURRENT" | "OUTDATED" {
    if (deliverables.length === 0 || !refRevisionId) return "MISSING";
    const hasCurrent = deliverables.some((d) => d.revision_id === refRevisionId);
    return hasCurrent ? "CURRENT" : "OUTDATED";
  }

  const deliverables = {
    async listDeliverables(input: ReadContext & { projectId: string; phaseId: string }) {
      requireRead(input.grants);
      const rows = await db.sfDeliverable.findMany({
        where: { project_id: input.projectId, phase_id: input.phaseId },
        orderBy: { created_at: "asc" },
      });
      const refId = await referenceRevisionId(db, input.phaseId);
      const status = computeDeliverableStatus(rows, refId);
      const items = await Promise.all(
        rows.map(async (d) => ({
          id: d.id,
          name: d.name,
          contentType: d.content_type,
          fileSizeBytes: d.file_size_bytes,
          revisionId: d.revision_id,
          createdAt: d.created_at,
          url: await ports.storage.createSignedReadUrl(d.storage_key, DELIVERABLE_SIGNED_URL_SECONDS),
        })),
      );
      return { items, status, referenceRevisionId: refId };
    },

    async uploadDeliverable(input: CommandContext & { projectId: string; phaseId: string; name: string; file: { body: Uint8Array; contentType: string } }) {
      requireCommand(input, P.phaseWork);
      const name = requiredText(input.name, "DELIVERABLE_NAME_REQUIRED", "File name", 200);
      const ext = DELIVERABLE_ALLOWED_TYPES[input.file.contentType];
      if (!ext) throw invalid("DELIVERABLE_TYPE", "Unsupported file type.");
      const bytes = input.file.body.byteLength;
      if (bytes === 0 || bytes > DELIVERABLE_MAX_BYTES) throw invalid("DELIVERABLE_SIZE", "File must be smaller than 25 MB.");

      const key = createPrivateObjectKey(`studioflow/deliverables/${input.projectId}`, ext);
      await ports.storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body });
      try {
        await runTransaction(async (tx) => {
          const phase = await loadWritablePhase(tx, input.projectId, input.phaseId);
          const revision = await activeRevision(tx, phase.id);
          if (!revision) throw invalid("ACTIVE_REVISION_REQUIRED", "Start this phase before uploading deliverables.");
          await tx.sfDeliverable.create({ data: { project_id: input.projectId, phase_id: input.phaseId, revision_id: revision.id, name, storage_key: key, file_size_bytes: bytes, content_type: input.file.contentType, created_by_id: input.actor.userId } });
        });
      } catch (error) {
        await ports.storage.remove(key).catch(() => undefined);
        throw error;
      }
      return { phaseId: input.phaseId };
    },

    async deleteDeliverable(input: CommandContext & { projectId: string; deliverableId: string }) {
      requireCommand(input, P.projectManage);
      const key = await runTransaction(async (tx) => {
        const d = await tx.sfDeliverable.findUnique({ where: { id: input.deliverableId }, select: { id: true, project_id: true, storage_key: true } });
        if (!d || d.project_id !== input.projectId) throw notFound("deliverable");
        await loadWritableProject(tx, input.projectId);
        await tx.sfDeliverable.delete({ where: { id: d.id } });
        return d.storage_key;
      });
      await ports.storage.remove(key).catch(() => undefined);
      return { deliverableId: input.deliverableId };
    },
  };

  return { ...commands, ...activities, ...reads, ...phaseTemplates, ...deliverables };
}