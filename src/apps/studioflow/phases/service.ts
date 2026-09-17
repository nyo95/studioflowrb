import { randomUUID } from "node:crypto";

import type { AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";

import { fullBlockers, todoBlockers } from "../domain/blockers";
import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import {
  PHASE_BLUEPRINT,
  availablePhaseCommands,
  canActivatePhase,
  isPhaseModifiable,
  nextRevision,
  phaseLabel,
  phaseOwnerSeat,
  revisionLabel,
  waitingDays,
  type PhaseKey,
  type PhaseStatus,
} from "../domain/phase";
import {
  P,
  conflict,
  hasPermission,
  invalid,
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
  return conflict("PHASE_LOCKED", "This phase is approved and locked. Reopen it first.");
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
      metadata: { projectId: phase.project_id, phaseKey: phase.key, ...metadata },
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
          throw conflict("PHASE_SEQUENTIAL", `${phaseLabel(phase.key as PhaseKey)} starts after ${phaseLabel(previous!.key as PhaseKey)} is approved.`);
        }
        const latest = await latestRevision(tx, phase.id);
        const number = latest ? nextRevision(latest, "CLIENT") : { major: 1, minor: 0 };
        await setPhase(tx, phase, { status: "IN_PROGRESS", is_locked: false });
        const revision = await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, ...number } });
        await audit(tx, input.actor, "activated", phase, "PENDING", "IN_PROGRESS", { revisionId: revision.id, revision: revisionLabel(number) });
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
        const fallbackAssignee = phaseOwnerSeat(phase.key as PhaseKey) === "drafter" ? project.pic_drafter_id : project.pic_designer_id;
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
          previousRevision: revisionLabel(current),
          revision: revisionLabel(number),
          revisionId: revision.id,
          feedbackConverted: converted.length,
        });
        return { phaseId: phase.id, revision: revisionLabel(number), converted: converted.length };
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
        await audit(tx, input.actor, "approved-client", phase, "ON_REVIEW_CLIENT", "READY_FOR_NEXT", { revision: current ? revisionLabel(current) : null });
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
            throw conflict("PHASE_SEQUENTIAL", `${phaseLabel(phase.key as PhaseKey)} starts after ${phaseLabel(previous!.key as PhaseKey)} is approved.`);
          }
        }
        const current = await activeRevision(tx, phase.id);
        if (current) await closeRevision(tx, current.id);
        const base = current ?? (await latestRevision(tx, phase.id));
        const number = nextRevision(base, input.intent);
        const revision = await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, ...number } });
        await setPhase(tx, phase, { status: "IN_PROGRESS", is_locked: false });
        await audit(tx, input.actor, "reopened", phase, from, "IN_PROGRESS", { reason, intent: input.intent, revision: revisionLabel(number), revisionId: revision.id });
        return { phaseId: phase.id, revision: revisionLabel(number) };
      });
    },

    async completeSupervision(input: PhaseCommandInput) {
      requireCommand(input, P.phaseReview);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId);
        if (phase.key !== "SUPERVISION" || phase.status !== "IN_PROGRESS" || phase.is_locked) throw invalidState("Only Supervision in progress can be finished.");
        await setPhase(tx, phase, { status: "COMPLETED", is_locked: true });
        const current = await activeRevision(tx, phase.id);
        if (current) await closeRevision(tx, current.id);
        await audit(tx, input.actor, "supervision-completed", phase, "IN_PROGRESS", "COMPLETED");
        if (project.status !== "COMPLETED") {
          await tx.sfProject.update({ where: { id: project.id }, data: { status: "COMPLETED" } });
          await writeAudit(ports, tx, { action: "studioflow.project.status-changed", entityType: "project", entityId: project.id, actor: input.actor, changes: { status: { from: project.status, to: "COMPLETED" } }, metadata: { projectId: project.id, reason: "supervision-completed" } });
        }
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
          include: { activities: { select: { content: true, mode: true, status: true } } },
        });
        const history = revisions.map((rev) => ({ version: revisionLabel(rev), status: rev.status, createdAt: rev.created_at.toISOString(), activities: rev.activities }));
        // V2-D6: override is forward-only — target version must exceed the latest existing revision.
        if (input.mode === "HARD_RESET_ACTIVE" && revisions.length > 0) {
          const latest = revisions[revisions.length - 1]!;
          const isForward = input.major! > latest.major || (input.major! === latest.major && input.minor! > latest.minor);
          if (!isForward) throw invalid("OVERRIDE_VERSION_BACKWARD", `v${input.major}.${input.minor} must be higher than the latest v${latest.major}.${latest.minor}.`);
        }
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

    /** Legacy `executeDeferActivity`: TODO leaves the revision but keeps blocking the phase. */
    async deferActivity(input: CommandContext & { projectId: string; activityId: string }) {
      requireCommand(input, P.phaseWork);
      return runTransaction(async (tx) => {
        const activity = await loadActivity(tx, input.projectId, input.activityId);
        if (activity.mode === "FEEDBACK") throw invalid("DEFER_FEEDBACK_BLOCKED", "Client feedback must be handled in this revision and cannot be deferred.");
        if (!activity.revision) throw conflict("ALREADY_DEFERRED", "This item is not tied to a revision.");
        const version = revisionLabel(activity.revision);
        await tx.sfActivity.update({ where: { id: activity.id }, data: { revision_id: null, deferred_from_version: version } });
        await writeAudit(ports, tx, { action: "studioflow.activity.deferred", entityType: "activity", entityId: activity.id, actor: input.actor, metadata: { projectId: activity.project_id, phaseId: activity.phase_id, fromRevision: version } });
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

  const reads = {
    /** Phase strip + rail data for one project. */
    async listProjectPhases(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const now = nowOf(ports);
      const phases = await db.sfPhase.findMany({
        where: { project_id: input.projectId },
        orderBy: { order_index: "asc" },
        include: { revisions: { where: { status: "ACTIVE" }, take: 1 } },
      });
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { status: true, archived_at: true } });
      const results = [];
      for (const phase of phases) {
        const counts = await readBlockerCounts(db, phase.id);
        const status = phase.status as PhaseStatus;
        const previous = phases.find((p) => p.order_index === phase.order_index - 1) ?? null;
        const canStart = canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null);
        // Compute available commands for inline Overview actions (V2-D9).
        const archived = project?.archived_at != null;
        const commands = archived ? [] : availablePhaseCommands({ key: phase.key as PhaseKey, status, isLocked: phase.is_locked }).filter((command) => {
          if (command === "activate") return canStart && project?.status === "ACTIVE";
          if (command === "bypass") return project?.status === "ACTIVE";
          if (command === "reopen" && status === "PENDING") return canStart && project?.status === "ACTIVE" && phase.revisions.length > 0;
          return true;
        });
        results.push({
          id: phase.id,
          key: phase.key as PhaseKey,
          label: phaseLabel(phase.key as PhaseKey),
          orderIndex: phase.order_index,
          status,
          isLocked: phase.is_locked,
          allowParallel: phase.allow_parallel,
          seat: phaseOwnerSeat(phase.key as PhaseKey),
          waitingDays: status === "PENDING" || status === "COMPLETED" || status === "READY_FOR_NEXT" ? null : waitingDays(phase.status_changed_at, now),
          statusChangedAt: phase.status_changed_at,
          activeRevision: phase.revisions[0] ? revisionLabel(phase.revisions[0]) : null,
          openRootChecklist: counts.openRootChecklistItems,
          blockers: fullBlockers(counts),
          todoBlockers: todoBlockers(counts),
          commands,
          startBlockedReason: status === "PENDING" && !canStart && previous ? `Starts after ${phaseLabel(previous.key as PhaseKey)} is approved.` : null,
        });
      }
      return results;
    },

    async getPhaseDetail(input: ReadContext & { projectId: string; phaseId: string }) {
      requireRead(input.grants);
      const phase = await db.sfPhase.findUnique({
        where: { id: input.phaseId },
        include: {
          project: { select: { id: true, name: true, archived_at: true, status: true, pic_designer_id: true, pic_drafter_id: true } },
          revisions: { orderBy: [{ major: "desc" }, { minor: "desc" }], include: { activities: { orderBy: { created_at: "asc" } } } },
        },
      });
      if (!phase || phase.project_id !== input.projectId) throw notFound("phase");
      const status = phase.status as PhaseStatus;
      const counts = await readBlockerCounts(db, phase.id);
      // Only open deferred items still block approval; finished ones are history.
      const deferred = await db.sfActivity.findMany({ where: { phase_id: phase.id, revision_id: null, status: "OPEN" }, orderBy: { created_at: "asc" } });
      const previous = await db.sfPhase.findFirst({ where: { project_id: phase.project_id, order_index: phase.order_index - 1 } });
      const canStart = canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null);
      const active = phase.revisions.find((rev) => rev.status === "ACTIVE") ?? null;
      const archived = phase.project.archived_at !== null;
      const commands = archived ? [] : availablePhaseCommands({ key: phase.key as PhaseKey, status, isLocked: phase.is_locked }).filter((command) => {
        if (command === "activate") return canStart && phase.project.status === "ACTIVE";
        if (command === "bypass") return phase.project.status === "ACTIVE";
        // Reopening a not-started phase only makes sense after earlier revisions, under the start rules.
        if (command === "reopen" && status === "PENDING") return canStart && phase.project.status === "ACTIVE" && phase.revisions.length > 0;
        return true;
      });
      return {
        id: phase.id,
        key: phase.key as PhaseKey,
        label: phaseLabel(phase.key as PhaseKey),
        orderIndex: phase.order_index,
        status,
        isLocked: phase.is_locked,
        allowParallel: phase.allow_parallel,
        seat: phaseOwnerSeat(phase.key as PhaseKey),
        seatUserId: phaseOwnerSeat(phase.key as PhaseKey) === "drafter" ? phase.project.pic_drafter_id : phase.project.pic_designer_id,
        statusChangedAt: phase.status_changed_at,
        waitingDays: waitingDays(phase.status_changed_at, nowOf(ports)),
        modifiable: !archived && isPhaseModifiable({ status, isLocked: phase.is_locked }),
        startBlockedReason: status === "PENDING" && !canStart && previous ? `Starts after ${phaseLabel(previous.key as PhaseKey)} is approved.` : phase.project.status !== "ACTIVE" && status === "PENDING" ? "The project is not active." : null,
        commands,
        blockers: fullBlockers(counts),
        todoBlockers: todoBlockers(counts),
        activeRevision: active ? { id: active.id, label: revisionLabel(active), createdAt: active.created_at, activities: active.activities.map(activityView) } : null,
        deferred: deferred.map(activityView),
        history: phase.revisions.filter((rev) => rev.status !== "ACTIVE").map((rev) => ({
          id: rev.id,
          label: revisionLabel(rev),
          createdAt: rev.created_at,
          closedAt: rev.closed_at,
          activities: rev.activities.map(activityView),
        })),
      };
    },

    async listGeneralActivities(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const rows = await db.sfActivity.findMany({ where: { project_id: input.projectId, phase_id: null }, orderBy: [{ status: "asc" }, { created_at: "asc" }] });
      return rows.map(activityView);
    },

    capabilities(grants: ReadContext["grants"]) {
      return {
        work: hasPermission(grants, P.phaseWork),
        review: hasPermission(grants, P.phaseReview),
        override: hasPermission(grants, P.phaseOverride),
      };
    },

    blueprint: PHASE_BLUEPRINT,
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
      await db.sfPhaseTemplate.create({ data: { name, is_default: isDefault } });
    },

    async updatePhaseTemplate(input: CommandContext & { templateId: string; name?: string; isActive?: boolean; isDefault?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = requiredText(input.name, "TEMPLATE_NAME_REQUIRED", "Template name", 200);
      if (input.isActive !== undefined) data.is_active = input.isActive;
      if (input.isDefault !== undefined) data.is_default = input.isDefault;
      if (Object.keys(data).length === 0) return;
      await db.sfPhaseTemplate.update({ where: { id: input.templateId }, data });
    },

    async deletePhaseTemplate(input: CommandContext & { templateId: string }) {
      requirePermission(input.grants, P.settingsManage);
      await db.sfPhaseTemplate.delete({ where: { id: input.templateId } });
    },

    async createPhaseDefinition(input: CommandContext & { templateId: string; name: string; prefix: string; seat?: string; allowParallel?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const name = requiredText(input.name, "PHASE_DEF_NAME_REQUIRED", "Phase name", 200);
      const prefix = requiredText(input.prefix, "PREFIX_REQUIRED", "Prefix", 4);
      const lastDef = await db.sfPhaseDefinition.findFirst({ where: { template_id: input.templateId }, orderBy: { order_index: "desc" } });
      const orderIndex = (lastDef?.order_index ?? -1) + 1;
      await db.sfPhaseDefinition.create({
        data: { template_id: input.templateId, name, prefix, order_index: orderIndex, seat: input.seat ?? "designer", allow_parallel: input.allowParallel ?? false },
      });
    },

    async updatePhaseDefinition(input: CommandContext & { definitionId: string; name?: string; prefix?: string; seat?: string; allowParallel?: boolean }) {
      requirePermission(input.grants, P.settingsManage);
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = requiredText(input.name, "PHASE_DEF_NAME_REQUIRED", "Phase name", 200);
      if (input.prefix !== undefined) data.prefix = requiredText(input.prefix, "PREFIX_REQUIRED", "Prefix", 4);
      if (input.seat !== undefined) data.seat = input.seat;
      if (input.allowParallel !== undefined) data.allow_parallel = input.allowParallel;
      if (Object.keys(data).length === 0) return;
      await db.sfPhaseDefinition.update({ where: { id: input.definitionId }, data });
    },

    async deletePhaseDefinition(input: CommandContext & { definitionId: string }) {
      requirePermission(input.grants, P.settingsManage);
      const def = await db.sfPhaseDefinition.findUniqueOrThrow({ where: { id: input.definitionId } });
      await db.sfPhaseDefinition.delete({ where: { id: input.definitionId } });
      // Close gap in order_index for remaining defs
      const siblings = await db.sfPhaseDefinition.findMany({ where: { template_id: def.template_id, order_index: { gt: def.order_index } }, orderBy: { order_index: "asc" } });
      for (const sib of siblings) {
        await db.sfPhaseDefinition.update({ where: { id: sib.id }, data: { order_index: sib.order_index - 1 } });
      }
    },

    async reorderPhaseDefinitions(input: CommandContext & { templateId: string; orderedIds: string[] }) {
      requirePermission(input.grants, P.settingsManage);
      for (let i = 0; i < input.orderedIds.length; i++) {
        await db.sfPhaseDefinition.update({ where: { id: input.orderedIds[i], template_id: input.templateId }, data: { order_index: i } });
      }
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

  return { ...commands, ...activities, ...reads, ...phaseTemplates };
}
