import { randomUUID } from "node:crypto";

import type { AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey } from "@platform/core/storage";

import { fullBlockers, todoBlockers } from "../domain/blockers";
import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import { ITERATION_IMAGE_BYTES, ITERATION_IMAGE_LIMIT, STUDIOFLOW_IMAGE_TYPES, sniffImage } from "../domain/images";
import { isCdMall, iterationChoices, iterationKinds } from "../domain/iteration-kinds";
import { phaseSkipReason } from "../domain/phase-display";
import {
  canActivatePhase,
  isLegacySupervisionDefinition,
  isPhaseModifiable,
  revisionLabel,
  waitingDays,
  type PhaseSeat,
  type PhaseSnapshot,
  type PhaseStatus,
} from "../domain/phase";
import {
  P,
  assertProjectWritable,
  canChangeCompletion,
  conflict,
  getProjectAccess,
  hasPermission,
  invalid,
  loadWritablePhase,
  loadWritableProject,
  notFound,
  nowOf,
  requireCommand,
  requireProjectAccess,
  requirePermission,
  requireRead,
  optionalText,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";
import { readBlockerCounts, readBlockerCountsBatch, readBlockerItems } from "./blocker-query";
import { discardObjects, enqueueUnreferencedCleanup } from "../asset-cleanup";
import { assertProjectCompletionReady, readProjectCompletionReadiness } from "../projects/completion";
import { createDeliverableService } from "./deliverables";
import { createPhaseTemplateService } from "./templates";

type PhaseRow = Awaited<ReturnType<TxClient["sfPhase"]["findUniqueOrThrow"]>>;
type ProjectRow = Awaited<ReturnType<TxClient["sfProject"]["findUniqueOrThrow"]>>;

/** Iteration states that count as "the phase's open iteration". */
/** Undo stays possible for this long after a change (WO-SF-ITER-01 decision 7). */
export const UNDO_WINDOW_MS = 300_000;

/** Notes per iteration: what the client said, kept as one text (owner, 2026-10-05). */
export const ITERATION_NOTE_MAX = 4000;

/** A file dropped, pasted or picked into an iteration's client notes. */
export type IterationImageUpload = { body: Uint8Array; contentType: string };

/** Signed read links for an iteration's images stay valid this long. */
const ITERATION_IMAGE_SIGNED_URL_SECONDS = 15 * 60;

const ITERATION_IMAGES_SELECT = {
  orderBy: [{ sort_order: "asc" as const }, { created_at: "asc" as const }, { id: "asc" as const }],
  select: { id: true, storage_key: true, content_type: true, bytes: true },
};

const OPEN_ITERATION_STATES: Array<"NOT_SENT" | "SENT" | "ANSWERED"> = ["NOT_SENT", "SENT", "ANSWERED"];

function invalidState(message = "This action is not available in the phase's current state."): AppError {
  return conflict("PHASE_INVALID_STATE", message);
}

function iterationNotFound(): AppError {
  return new AppError("NOT_FOUND", "ITERATION_NOT_FOUND", "This iteration no longer exists.");
}

function resolvePhaseName(phase: { name_snapshot: string }): string {
  return phase.name_snapshot;
}

export function createPhaseService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;
  const { referenceRevisionId, computeDeliverableStatus, ...deliverables } = createDeliverableService(db, ports, activeRevision);

  async function loadPhase(tx: TxClient, projectId: string, phaseId: string, access?: CommandContext): Promise<{ phase: PhaseRow; project: ProjectRow }> {
    const phase = await tx.sfPhase.findUnique({ where: { id: phaseId }, include: { project: true } });
    if (!phase || phase.project_id !== projectId) throw notFound("phase");
    assertProjectWritable(phase.project);
    if (access?.actor.userId) await requireProjectAccess(tx, { grants: access.grants, actorId: access.actor.userId, projectId, phaseId, kind: "transition" });
    const { project, ...rest } = phase;
    return { phase: rest, project };
  }

  async function activeRevision(tx: TxClient | Db, phaseId: string) {
    return tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: { in: OPEN_ITERATION_STATES } }, orderBy: { major: "desc" } });
  }

  async function latestRevision(tx: TxClient, phaseId: string) {
    return tx.sfRevision.findFirst({ where: { phase_id: phaseId }, orderBy: { major: "desc" } });
  }

  async function setPhase(tx: TxClient, phase: PhaseRow, data: { status: PhaseStatus; is_locked?: boolean }) {
    await tx.sfPhase.update({ where: { id: phase.id }, data: { ...data, status_changed_at: nowOf(ports) } });
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
    async bypassPhase(input: PhaseCommandInput & { reason: string }) {
      requireCommand(input, P.phaseReview);
      const reason = requiredText(input.reason, "BYPASS_REASON_REQUIRED", "A reason", 500);
      return runTransaction(async (tx) => {
        const { phase, project } = await loadPhase(tx, input.projectId, input.phaseId, input);
        if (phase.status !== "PENDING" && phase.status !== "ACTIVE") throw invalidState("Only a phase that has not started or is active can be skipped.");
        if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active to skip a phase.");
        const target: PhaseStatus = "DONE";
        const current = await activeRevision(tx, phase.id);
        let beforeIteration: ReturnType<typeof iterationUndo> | undefined;
        let deletedIteration: { iteration: ReturnType<typeof iterationUndo> } | undefined;
        let createdIteration: ReturnType<typeof iterationUndo> | undefined;
        if (current) {
          const [files, activities, images] = await Promise.all([
            tx.sfDeliverable.count({ where: { revision_id: current.id } }),
            tx.sfActivity.count({ where: { revision_id: current.id } }),
            tx.sfIterationImage.count({ where: { iteration_id: current.id } }),
          ]);
          // Only an iteration with nothing attached may be deleted; anything else is kept as closed history.
          const emptyNeverSent = current.status === "NOT_SENT" && !current.note?.trim() && files === 0 && activities === 0 && images === 0;
          if (emptyNeverSent) {
            deletedIteration = { iteration: iterationUndo(current) };
            await tx.sfRevision.delete({ where: { id: current.id } });
          } else {
            beforeIteration = iterationUndo(current);
            await tx.sfRevision.update({ where: { id: current.id }, data: { status: "DONE", done_at: nowOf(ports) } });
          }
        } else if (phase.status === "PENDING") {
          const created = await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, major: 1, name: `${phase.name_snapshot} 1`, status: "DONE", done_at: nowOf(ports) } });
          createdIteration = iterationUndo(created);
        }
        await setPhase(tx, phase, { status: target, is_locked: true });
        const auto = await autoAdvance(tx, input, phase);
        await recordEvent(tx, input, phase, deletedIteration ? null : current?.id ?? createdIteration?.id ?? null, phase.status, target, {
          kind: "bypass", reason, phaseBefore: phase.status, beforeIteration, deletedIteration, createdIteration, autoAdvance: auto,
        });
        await audit(tx, input.actor, "bypassed", phase, phase.status as PhaseStatus, target, { reason, autoAdvance: auto });
        return { phaseId: phase.id, autoAdvance: auto };
      });
    },

    /** Legacy admin hard reset; the full history snapshot goes into the audit event. */
    async overrideRevision(input: PhaseCommandInput & { mode: "HARD_RESET_ACTIVE" | "HARD_RESET_PENDING"; major?: number; note: string }) {
      requireCommand(input, P.phaseOverride);
      const note = requiredText(input.note, "OVERRIDE_NOTE_REQUIRED", "A note", 1000);
      if (input.mode === "HARD_RESET_ACTIVE") {
        if (!Number.isInteger(input.major) || input.major! < 1) {
          throw invalid("OVERRIDE_VERSION_INVALID", "Enter an iteration number of 1 or higher.");
        }
      }
      const reset = await runTransaction(async (tx) => {
        const { phase } = await loadPhase(tx, input.projectId, input.phaseId, input);
        const revisions = await tx.sfRevision.findMany({
          where: { phase_id: phase.id },
          orderBy: { major: "asc" },
          select: { id: true, major: true, name: true, status: true, created_at: true, note: true, visit_date: true, activities: { select: { content: true, mode: true, status: true } } },
        });
        // Snapshot deliverable provenance before revision destruction
        const deliverables = await tx.sfDeliverable.findMany({ where: { phase_id: phase.id }, select: { id: true, name: true, revision_id: true, storage_key: true, created_at: true } });
        const deliverableSnapshot = deliverables.map((d) => ({
          id: d.id, name: d.name, revisionId: d.revision_id, storageKey: d.storage_key, createdAt: d.created_at.toISOString(),
        }));
        const imageKeys = (await tx.sfIterationImage.findMany({ where: { iteration: { phase_id: phase.id } }, select: { storage_key: true } })).map((image) => image.storage_key);
        const history = revisions.map((rev) => ({ version: rev.name, status: rev.status, createdAt: rev.created_at.toISOString(), note: rev.note, visitDate: rev.visit_date?.toISOString() ?? null, activities: rev.activities }));
        if (input.mode === "HARD_RESET_ACTIVE" && revisions.length > 0) {
          const latest = revisions[revisions.length - 1]!;
          if (input.major! <= latest.major) throw invalid("OVERRIDE_VERSION_BACKWARD", `Iteration ${input.major} must be higher than the latest iteration ${latest.major}.`);
        }
        // Detach deliverables from their revisions (set revision_id to null) before deleting revisions
        await tx.sfDeliverable.updateMany({ where: { phase_id: phase.id, revision_id: { not: null } }, data: { revision_id: null } });
        await tx.sfRevision.deleteMany({ where: { phase_id: phase.id } });
        const releasedKeys = await enqueueUnreferencedCleanup(tx, imageKeys);
        const from = phase.status as PhaseStatus;
        let target: PhaseStatus = "PENDING";
        let revisionId: string | null = null;
        if (input.mode === "HARD_RESET_ACTIVE") {
          target = "ACTIVE";
          revisionId = randomUUID();
          await tx.sfRevision.create({ data: { id: revisionId, phase_id: phase.id, major: input.major!, name: `${phase.name_snapshot} ${input.major}`, status: "NOT_SENT" } });
        }
        await setPhase(tx, phase, { status: target, is_locked: false });
        await audit(tx, input.actor, "revision-overridden", phase, from, target, {
          mode: input.mode,
          note,
          targetRevision: input.mode === "HARD_RESET_ACTIVE" ? `${phase.name_snapshot} ${input.major}` : null,
          history,
          deliverableSnapshot,
        });
        return { phaseId: phase.id, revisionId, releasedKeys };
      });
      await discardObjects(db, ports.storage, reset.releasedKeys);
      return { phaseId: reset.phaseId, revisionId: reset.revisionId };
    },

    /** Portfolio Timeline (owner, 2026-09-23): overridable planned start/end for the Gantt page. `null` clears back to the equal-width sequence fallback. Schedule metadata, not phase-work — not gated by phase lock. */
    async setPhasePlannedDates(input: PhaseCommandInput & { plannedStartDate?: string | null; plannedEndDate?: string | null }) {
      requireCommand(input, P.projectManage);
      const startDate = input.plannedStartDate === undefined ? undefined : input.plannedStartDate ? dateOnlyToDate(input.plannedStartDate) : null;
      const endDate = input.plannedEndDate === undefined ? undefined : input.plannedEndDate ? dateOnlyToDate(input.plannedEndDate) : null;
      if (startDate && endDate && startDate > endDate) {
        throw invalid("PHASE_PLANNED_DATES_INVALID", "Planned end date cannot be before the planned start date.");
      }
      return runTransaction(async (tx) => {
        const project = await loadWritableProject(tx, input.projectId);
        await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, kind: "project" });
        const phase = await tx.sfPhase.findUnique({ where: { id: input.phaseId } });
        if (!phase || phase.project_id !== project.id) throw notFound("phase");
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const data: { planned_start_date?: Date | null; planned_end_date?: Date | null; planned_dates_manual?: boolean } = { planned_dates_manual: true };
        if (startDate !== undefined) {
          const to = dateToDateOnly(startDate);
          if (dateToDateOnly(phase.planned_start_date) !== to) { changes.plannedStartDate = { from: dateToDateOnly(phase.planned_start_date), to }; data.planned_start_date = startDate; }
        }
        if (endDate !== undefined) {
          const to = dateToDateOnly(endDate);
          if (dateToDateOnly(phase.planned_end_date) !== to) { changes.plannedEndDate = { from: dateToDateOnly(phase.planned_end_date), to }; data.planned_end_date = endDate; }
        }
        if (Object.keys(changes).length === 0) return { phaseId: phase.id };
        await tx.sfPhase.update({ where: { id: phase.id }, data });
        await writeAudit(ports, tx, { action: "studioflow.phase.planned-dates-changed", entityType: "phase", entityId: phase.id, actor: input.actor, changes, metadata: { projectId: project.id, phaseName: phase.name_snapshot } });
        return { phaseId: phase.id };
      });
    },
  };

  // WO-SF-ITER-01 phase 2.  These commands deliberately keep the event payload
  // self-contained: undo must reverse only rows created by this exact command.
  async function writableIteration(tx: TxClient, input: PhaseCommandInput) {
    requireCommand(input, P.phaseWork);
    const loaded = await loadPhase(tx, input.projectId, input.phaseId, input);
    if (loaded.project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing an iteration.");
    return loaded;
  }
  async function recordEvent(tx: TxClient, input: PhaseCommandInput, phase: PhaseRow, iterationId: string | null, from: string | null, to: string, autoCreated: Record<string, unknown> = {}) {
    // The injected test clock is deliberately fixed. Keep event time monotonic so
    // "latest" remains deterministic even when several commands share that clock tick.
    const latest = await tx.sfPhaseEvent.findFirst({ where: { project_id: phase.project_id }, orderBy: { occurred_at: "desc" }, select: { occurred_at: true } });
    const requested = nowOf(ports);
    const occurredAt = latest && latest.occurred_at >= requested ? new Date(latest.occurred_at.getTime() + 1) : requested;
    return tx.sfPhaseEvent.create({ data: { id: randomUUID(), project_id: phase.project_id, phase_id: phase.id, iteration_id: iterationId, from_state: from, to_state: to, actor_id: input.actor.userId!, occurred_at: occurredAt, auto_created: autoCreated as never } });
  }
  /** A phase that has not started follows the sequential rule: its predecessor must be done unless the phase runs in parallel. */
  async function assertCanStart(tx: TxClient, phase: PhaseRow) {
    const previous = await tx.sfPhase.findFirst({ where: { project_id: phase.project_id, order_index: phase.order_index - 1 } });
    if (!canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null)) {
      throw conflict("PHASE_SEQUENTIAL", `${resolvePhaseName(phase)} starts after ${resolvePhaseName(previous!)} is finished.`);
    }
  }
  async function createIteration(tx: TxClient, phase: PhaseRow, kind?: string | null, visit?: { date: Date; note: string | null }) {
    const latest = await latestRevision(tx, phase.id);
    const major = (latest?.major ?? 0) + 1;
    return tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phase.id, major, name: kind ?? `${phase.name_snapshot} ${major}`, status: "NOT_SENT", visit_date: visit?.date, note: visit?.note } });
  }
  function iterationUndo(row: { id: string; phase_id: string; major: number; name: string; status: string; sent_at: Date | null; answered_at: Date | null; done_at: Date | null; visit_date: Date | null; note: string | null }) {
    return { id: row.id, phaseId: row.phase_id, major: row.major, name: row.name, status: row.status, sentAt: row.sent_at?.toISOString() ?? null, answeredAt: row.answered_at?.toISOString() ?? null, doneAt: row.done_at?.toISOString() ?? null, visitDate: row.visit_date?.toISOString() ?? null, note: row.note };
  }
  async function defaultFirstKind(tx: TxClient, phase: PhaseRow) {
    const definition = await tx.sfPhaseDefinition.findUnique({ where: { id: phase.definition_id }, select: { default_iteration_kinds: true } });
    return iterationKinds(definition?.default_iteration_kinds)[0];
  }
  async function autoAdvance(tx: TxClient, input: PhaseCommandInput, completed: PhaseRow) {
    const candidates = await tx.sfPhase.findMany({ where: { project_id: completed.project_id, status: "PENDING" }, orderBy: { order_index: "asc" } });
    for (const candidate of candidates) {
      const previous = await tx.sfPhase.findFirst({ where: { project_id: completed.project_id, order_index: candidate.order_index - 1 } });
      if (!canActivatePhase({ orderIndex: candidate.order_index, allowParallel: candidate.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null)) continue;
      const iteration = await createIteration(tx, candidate, await defaultFirstKind(tx, candidate));
      await setPhase(tx, candidate, { status: "ACTIVE", is_locked: false });
      return { phaseId: candidate.id, iterationId: iteration.id };
    }
    return null;
  }
  async function closePhase(tx: TxClient, input: PhaseCommandInput, phase: PhaseRow, project: ProjectRow, iteration: { id: string; status: string; phase_id: string; major: number; name: string; sent_at: Date | null; answered_at: Date | null; done_at: Date | null; visit_date: Date | null; note: string | null }) {
    const at = nowOf(ports);
    await tx.sfRevision.update({ where: { id: iteration.id }, data: { status: "DONE", answered_at: at, done_at: at } });
    await setPhase(tx, phase, { status: "DONE", is_locked: true });
    const auto = await autoAdvance(tx, input, phase);
    await recordEvent(tx, input, phase, iteration.id, iteration.status, "DONE", { beforeIteration: iterationUndo(iteration), phaseBefore: "ACTIVE", autoAdvance: auto });
    await audit(tx, input.actor, "iteration-done", phase, "ACTIVE", "DONE", { iterationId: iteration.id, autoAdvance: auto });
    return { phaseId: phase.id, autoAdvance: auto };
  }

  async function writeIterationNote(tx: TxClient, input: PhaseCommandInput, phase: PhaseRow, iteration: Parameters<typeof iterationUndo>[0], note: string | null) {
    await tx.sfRevision.update({ where: { id: iteration.id }, data: { note } });
    await recordEvent(tx, input, phase, iteration.id, iteration.status, iteration.status, { beforeIteration: iterationUndo(iteration) });
    await audit(tx, input.actor, "iteration-note-set", phase, phase.status as PhaseStatus, phase.status as PhaseStatus, { iterationId: iteration.id });
  }

  const iterationCommands = {
    async addIteration(input: PhaseCommandInput) {
      return runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        // An active phase may take an iteration only when it has none open (its only unsent iteration was deleted); it would otherwise be stuck.
        if (phase.status === "ACTIVE") {
          if (isLegacySupervisionDefinition(phase.definition_id) || await activeRevision(tx, phase.id)) throw invalidState("Finish the current iteration before adding another.");
        } else if (phase.status !== "PENDING" && phase.status !== "DONE") throw invalidState("An iteration can only be added to a new or finished phase.");
        if (phase.status === "PENDING") await assertCanStart(tx, phase);
        const iteration = await createIteration(tx, phase, await defaultFirstKind(tx, phase));
        await setPhase(tx, phase, { status: "ACTIVE", is_locked: false });
        await recordEvent(tx, input, phase, null, phase.status, "NOT_SENT", { createdIteration: iterationUndo(iteration), phaseBefore: phase.status });
        await audit(tx, input.actor, "iteration-added", phase, phase.status as PhaseStatus, "ACTIVE", { iterationId: iteration.id });
        return { phaseId: phase.id, iterationId: iteration.id };
      });
    },
    async sendIteration(input: PhaseCommandInput & { iterationId: string }) {
      return runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id } });
        if (!iteration) throw iterationNotFound();
        if (iteration.status === "SENT") return { iterationId: iteration.id };
        if (phase.status !== "ACTIVE" || iteration.status !== "NOT_SENT") throw invalidState("Only the current unsent iteration can be sent.");
        await tx.sfRevision.update({ where: { id: iteration.id }, data: { status: "SENT", sent_at: nowOf(ports) } });
        await recordEvent(tx, input, phase, iteration.id, "NOT_SENT", "SENT", { beforeIteration: iterationUndo(iteration) });
        await audit(tx, input.actor, "iteration-sent", phase, "ACTIVE", "ACTIVE", { iterationId: iteration.id });
        return { iterationId: iteration.id };
      });
    },
    /** The client answered: the iteration is ANSWERED and, when given, what they said becomes its notes. */
    async recordClientAnswer(input: PhaseCommandInput & { iterationId: string; note?: string | null }) {
      const note = input.note === undefined ? undefined : optionalText(input.note, ITERATION_NOTE_MAX);
      return runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id } });
        if (!iteration) throw iterationNotFound();
        if (iteration.status === "ANSWERED") {
          // A retry, or notes added after "decide later": keep the answer, store the notes.
          if (note !== undefined && note !== iteration.note) await writeIterationNote(tx, input, phase, iteration, note);
          return { iterationId: iteration.id };
        }
        if (iteration.status !== "SENT") throw invalidState("Only an iteration sent to the client can receive an answer.");
        await tx.sfRevision.update({ where: { id: iteration.id }, data: { status: "ANSWERED", answered_at: nowOf(ports), ...(note !== undefined ? { note } : {}) } });
        await recordEvent(tx, input, phase, iteration.id, "SENT", "ANSWERED", { beforeIteration: iterationUndo(iteration) });
        await audit(tx, input.actor, "client-answer-recorded", phase, "ACTIVE", "ACTIVE", { iterationId: iteration.id, notes: note !== undefined && note !== null });
        return { iterationId: iteration.id };
      });
    },
    /**
     * An iteration's notes: what the client said about it (owner, 2026-10-05; they replace per-point feedback).
     * Editable on any iteration of the phase while the project is open, so a late remark can still be recorded.
     */
    async setIterationNote(input: PhaseCommandInput & { iterationId: string; note: string | null }) {
      const note = optionalText(input.note, ITERATION_NOTE_MAX);
      return runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id } });
        if (!iteration) throw iterationNotFound();
        if (iteration.note === note) return { iterationId: iteration.id };
        await writeIterationNote(tx, input, phase, iteration, note);
        return { iterationId: iteration.id };
      });
    },
    /**
     * Appends one image to an iteration's client notes. Same permission and project rules as `setIterationNote`.
     * The object is written before the row and discarded if the transaction fails; not undoable.
     */
    async addIterationImage(input: PhaseCommandInput & { iterationId: string; file: IterationImageUpload }) {
      requireCommand(input, P.phaseWork);
      const extension = STUDIOFLOW_IMAGE_TYPES[input.file.contentType];
      if (!extension) throw invalid("ITERATION_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
      const bytes = input.file.body.byteLength;
      if (bytes === 0 || bytes > ITERATION_IMAGE_BYTES) throw invalid("ITERATION_IMAGE_SIZE", "Each image must be smaller than 3 MB.");
      if (!sniffImage(input.file.body, input.file.contentType)) throw invalid("ITERATION_IMAGE_TYPE", "This file is not a valid image.");
      // Scope, access and limit are checked before touching storage, then again inside the write transaction.
      await runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id }, select: { id: true } });
        if (!iteration) throw iterationNotFound();
        if (await tx.sfIterationImage.count({ where: { iteration_id: iteration.id } }) >= ITERATION_IMAGE_LIMIT) throw invalid("ITERATION_IMAGE_LIMIT", `An iteration holds at most ${ITERATION_IMAGE_LIMIT} images.`);
      });
      const key = createPrivateObjectKey(`studioflow/iterations/${input.projectId}`, extension);
      await ports.storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body });
      try {
        return await runTransaction(async (tx) => {
          const { phase } = await writableIteration(tx, input);
          const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id }, select: { id: true } });
          if (!iteration) throw iterationNotFound();
          // Serialise concurrent adds to one iteration so the limit and the order cannot race.
          await tx.$queryRaw`SELECT id FROM studioflow.sf_revision WHERE id = ${iteration.id} FOR UPDATE`;
          const last = await tx.sfIterationImage.aggregate({ where: { iteration_id: iteration.id }, _count: { _all: true }, _max: { sort_order: true } });
          if (last._count._all >= ITERATION_IMAGE_LIMIT) throw invalid("ITERATION_IMAGE_LIMIT", `An iteration holds at most ${ITERATION_IMAGE_LIMIT} images.`);
          const image = await tx.sfIterationImage.create({
            data: { iteration_id: iteration.id, storage_key: key, content_type: input.file.contentType, bytes, sort_order: (last._max.sort_order ?? 0) + 1, uploaded_by_id: input.actor.userId!, uploaded_by_name: input.actor.label },
            select: { id: true },
          });
          await audit(tx, input.actor, "iteration-image-added", phase, phase.status as PhaseStatus, phase.status as PhaseStatus, { iterationId: iteration.id, imageId: image.id, bytes });
          return { iterationId: iteration.id, imageId: image.id };
        });
      } catch (error) {
        await discardObjects(db, ports.storage, [key]);
        throw error;
      }
    },
    /** Removes one image from its iteration's client notes; the object is released after commit unless something else still points at it. */
    async removeIterationImage(input: PhaseCommandInput & { imageId: string }) {
      requireCommand(input, P.phaseWork);
      const result = await runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        const image = await tx.sfIterationImage.findFirst({ where: { id: input.imageId, iteration: { phase_id: phase.id } }, select: { id: true, iteration_id: true, storage_key: true } });
        if (!image) throw new AppError("NOT_FOUND", "ITERATION_IMAGE_NOT_FOUND", "This image no longer exists.");
        await tx.sfIterationImage.delete({ where: { id: image.id } });
        await audit(tx, input.actor, "iteration-image-removed", phase, phase.status as PhaseStatus, phase.status as PhaseStatus, { iterationId: image.iteration_id, imageId: image.id });
        return { iterationId: image.iteration_id, imageId: image.id, keys: await enqueueUnreferencedCleanup(tx, [image.storage_key]) };
      });
      await discardObjects(db, ports.storage, result.keys);
      return { iterationId: result.iterationId, imageId: result.imageId };
    },
    async chooseIterationOutcome(input: PhaseCommandInput & { iterationId: string; outcome: "REVISION" | "DONE" | "CONTINUE_CD_FINAL" }) {
      return runTransaction(async (tx) => {
        const { phase, project } = await writableIteration(tx, input);
        const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id } });
        if (!iteration || iteration.status !== "ANSWERED") throw invalidState("Choose an outcome only after the client answer is recorded.");
        const definition = await tx.sfPhaseDefinition.findUniqueOrThrow({ where: { id: phase.definition_id }, select: { default_iteration_kinds: true } });
        const kinds = iterationKinds(definition.default_iteration_kinds);
        const isMall = isCdMall(kinds, iteration.name);
        if (input.outcome === "REVISION") {
          // What the client said stays in this iteration's notes; the next iteration shows them as its brief.
          const at = nowOf(ports); await tx.sfRevision.update({ where: { id: iteration.id }, data: { status: "REVISED", done_at: at } });
          // A revised CD Mall stays CD Mall, so the phase still has to continue to CD Final before it can be done.
          const next = await createIteration(tx, phase, isMall ? iteration.name : undefined);
          await recordEvent(tx, input, phase, iteration.id, "ANSWERED", "REVISED", { beforeIteration: iterationUndo(iteration), createdIteration: iterationUndo(next) });
          await audit(tx, input.actor, "iteration-revised", phase, "ACTIVE", "ACTIVE", { iterationId: iteration.id, nextIterationId: next.id });
          return { iterationId: iteration.id, nextIterationId: next.id };
        }
        if (input.outcome === "CONTINUE_CD_FINAL") {
          if (!isMall || !kinds[1]) throw invalidState("Only CD Mall can continue to CD Final.");
          const at = nowOf(ports); await tx.sfRevision.update({ where: { id: iteration.id }, data: { status: "DONE", done_at: at } });
          const next = await createIteration(tx, phase, kinds[1]);
          await recordEvent(tx, input, phase, iteration.id, "ANSWERED", "DONE", { beforeIteration: iterationUndo(iteration), createdIteration: iterationUndo(next), cdContinuation: true });
          await audit(tx, input.actor, "iteration-continued", phase, "ACTIVE", "ACTIVE", { iterationId: iteration.id, nextIterationId: next.id });
          return { iterationId: iteration.id, nextIterationId: next.id };
        }
        if (isMall) throw invalidState("CD Mall must be revised or continued to CD Final.");
        return closePhase(tx, input, phase, project, iteration);
      });
    },
    async renameIteration(input: PhaseCommandInput & { iterationId: string; name: string }) {
      const name = requiredText(input.name, "ITERATION_NAME_REQUIRED", "Iteration name", 200);
      return runTransaction(async (tx) => { const { phase } = await writableIteration(tx, input); const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id } }); if (!iteration) throw iterationNotFound(); if (iteration.name === name) return { iterationId: iteration.id };
        // A two-step phase knows its step by the iteration name (`isCdMall`): renaming "CD Mall" would let OK close the
        // phase without CD Final, and naming another iteration "CD Mall" would fake the step. Those names stay put.
        const definition = await tx.sfPhaseDefinition.findUnique({ where: { id: phase.definition_id }, select: { default_iteration_kinds: true } });
        const kinds = iterationKinds(definition?.default_iteration_kinds);
        if (kinds.length >= 2 && (kinds.includes(iteration.name) || kinds.includes(name))) throw conflict("ITERATION_KIND_NAME_LOCKED", `${kinds.join(" and ")} keep their names: the phase uses them to know which step it is in.`);
        await tx.sfRevision.update({ where: { id: iteration.id }, data: { name } }); await recordEvent(tx, input, phase, iteration.id, iteration.name, name, { beforeIteration: iterationUndo(iteration) }); await audit(tx, input.actor, "iteration-renamed", phase, phase.status as PhaseStatus, phase.status as PhaseStatus, { iterationId: iteration.id }); return { iterationId: iteration.id }; });
    },
    async deleteNeverSentIteration(input: PhaseCommandInput & { iterationId: string }) {
      return runTransaction(async (tx) => { const { phase } = await writableIteration(tx, input); const iteration = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id }, include: { _count: { select: { activities: true, deliverables: true, images: true } } } }); if (!iteration) throw iterationNotFound(); if (iteration.status !== "NOT_SENT") throw invalidState("Only an iteration that was never sent can be deleted.");
      // Deleting the iteration would cascade-delete its activities and detach its files (SetNull), and undo only recreates
      // the iteration row — so an iteration with persisted work is never deleted.
      if (iteration._count.activities + iteration._count.deliverables + iteration._count.images > 0) throw conflict("ITERATION_HAS_ATTACHED_WORK", "This iteration has files, images or notes attached. Remove them first, then delete the iteration."); const snapshot = { iteration: iterationUndo(iteration) }; await tx.sfRevision.delete({ where: { id: iteration.id } }); await recordEvent(tx, input, phase, null, "NOT_SENT", "DELETED", { deletedIteration: snapshot }); await audit(tx, input.actor, "iteration-deleted", phase, phase.status as PhaseStatus, phase.status as PhaseStatus, { iterationId: iteration.id }); return { iterationId: iteration.id }; });
    },
    async setPhaseNote(input: PhaseCommandInput & { note: string | null }) {
      return runTransaction(async (tx) => { const { phase } = await writableIteration(tx, input); const note = input.note === null ? null : requiredText(input.note, "PHASE_NOTE_REQUIRED", "Note", 2000); if (phase.note === note) return { phaseId: phase.id }; await tx.sfPhase.update({ where: { id: phase.id }, data: { note } }); await recordEvent(tx, input, phase, null, phase.note, note ?? "", { phaseNoteBefore: phase.note }); await audit(tx, input.actor, "note-set", phase, phase.status as PhaseStatus, phase.status as PhaseStatus); return { phaseId: phase.id }; });
    },
    async dismissRequirement(input: PhaseCommandInput & { itemId: string }) {
      return runTransaction(async (tx) => { const { phase } = await writableIteration(tx, input); const item = await tx.sfChecklistItem.findFirst({ where: { id: input.itemId, phase_id: phase.id } }); if (!item) throw notFound("requirement"); if (item.dismissed_at) return { itemId: item.id }; await tx.sfChecklistItem.update({ where: { id: item.id }, data: { dismissed_at: nowOf(ports) } }); await recordEvent(tx, input, phase, null, "VISIBLE", "DISMISSED", { requirementId: item.id, dismissedAtBefore: null }); await audit(tx, input.actor, "requirement-dismissed", phase, phase.status as PhaseStatus, phase.status as PhaseStatus, { requirementId: item.id }); return { itemId: item.id }; });
    },
    async createSupervisionVisit(input: PhaseCommandInput & { visitDate: string; note?: string | null }) {
      return runTransaction(async (tx) => {
        const { phase } = await writableIteration(tx, input);
        if (!isLegacySupervisionDefinition(phase.definition_id)) throw invalidState("Visits are available only for Supervision.");
        if (phase.status !== "PENDING" && phase.status !== "ACTIVE") throw invalidState();
        if (phase.status === "PENDING") await assertCanStart(tx, phase);
        const current = await activeRevision(tx, phase.id);
        if (current) {
          const [files, activities, images] = await Promise.all([
            tx.sfDeliverable.count({ where: { revision_id: current.id } }),
            tx.sfActivity.count({ where: { revision_id: current.id } }),
            tx.sfIterationImage.count({ where: { iteration_id: current.id } }),
          ]);
          const emptyAutoStart = current.status === "NOT_SENT" && current.visit_date === null && !current.note?.trim() && files === 0 && activities === 0 && images === 0;
          if (!emptyAutoStart) throw invalidState("Finish the current visit before adding another.");
          await tx.sfRevision.delete({ where: { id: current.id } });
        }
        const visit = await createIteration(tx, phase, undefined, { date: dateOnlyToDate(input.visitDate), note: input.note ? requiredText(input.note, "VISIT_NOTE_REQUIRED", "Visit note", 2000) : null });
        if (phase.status === "PENDING") await setPhase(tx, phase, { status: "ACTIVE", is_locked: false });
        await recordEvent(tx, input, phase, null, null, "NOT_SENT", { createdIteration: iterationUndo(visit), phaseBefore: phase.status });
        await audit(tx, input.actor, "visit-created", phase, phase.status as PhaseStatus, "ACTIVE", { iterationId: visit.id });
        return { iterationId: visit.id };
      });
    },
    async chooseSupervisionVisit(input: PhaseCommandInput & { iterationId: string; outcome: "NEXT_VISIT" | "DONE" }) {
      return runTransaction(async (tx) => { const { phase, project } = await writableIteration(tx, input); if (!isLegacySupervisionDefinition(phase.definition_id)) throw invalidState(); const visit = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase_id: phase.id } }); if (!visit || visit.status !== "NOT_SENT") throw invalidState("Only the open visit can be completed."); if (input.outcome === "NEXT_VISIT") { await tx.sfRevision.update({ where: { id: visit.id }, data: { status: "DONE", done_at: nowOf(ports) } }); await recordEvent(tx, input, phase, visit.id, "NOT_SENT", "DONE", { beforeIteration: iterationUndo(visit) }); await audit(tx, input.actor, "visit-completed", phase, "ACTIVE", "ACTIVE", { iterationId: visit.id }); return { iterationId: visit.id }; } return closePhase(tx, input, phase, project, visit); });
    },
    async undoPhaseEvent(input: CommandContext & { projectId: string; eventId: string }) {
      return runTransaction(async (tx) => {
        const event = await tx.sfPhaseEvent.findUnique({ where: { id: input.eventId } });
        if (!event || event.project_id !== input.projectId) throw notFound("phase event");
        const eventPayload = (event.auto_created ?? {}) as { kind?: string };
        requireCommand(input, eventPayload.kind === "bypass" ? P.phaseReview : P.phaseWork);
        // A completed, archived or paused project takes no phase changes, and undo is one (it would reopen a closed phase).
        const project = await tx.sfProject.findUniqueOrThrow({ where: { id: input.projectId } });
        assertProjectWritable(project);
        if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before undoing a change.");
        const latest = await tx.sfPhaseEvent.findFirst({ where: { project_id: input.projectId }, orderBy: { occurred_at: "desc" } });
        if (latest?.id !== event.id) throw conflict("UNDO_NOT_LATEST", "Only the latest project change can be undone.");
        if (event.actor_id !== input.actor.userId) throw conflict("UNDO_ACTOR_MISMATCH", "Only the person who made this change can undo it.");
        if (event.undone_at || nowOf(ports).getTime() - event.occurred_at.getTime() > UNDO_WINDOW_MS) throw conflict("UNDO_EXPIRED", "This change can no longer be undone.");
        const p = (event.auto_created ?? {}) as { beforeIteration?: ReturnType<typeof iterationUndo>; createdIteration?: ReturnType<typeof iterationUndo>; deletedIteration?: { iteration: ReturnType<typeof iterationUndo> }; autoAdvance?: { phaseId: string; iterationId: string } | null; phaseBefore?: string; phaseNoteBefore?: string | null; requirementId?: string; dismissedAtBefore?: string | null };
        for (const created of [p.createdIteration, p.autoAdvance ? { id: p.autoAdvance.iterationId } : undefined]) {
          if (!created) continue;
          const attached = await tx.sfRevision.findUnique({ where: { id: created.id }, select: { _count: { select: { activities: true, deliverables: true, images: true } } } });
          if (attached && attached._count.activities + attached._count.deliverables + attached._count.images > 0) throw conflict("UNDO_HAS_NEWER_DATA", "This change now has attached work and cannot be undone.");
        }
        if (p.autoAdvance) { await tx.sfRevision.delete({ where: { id: p.autoAdvance.iterationId } }); await tx.sfPhase.update({ where: { id: p.autoAdvance.phaseId }, data: { status: "PENDING", is_locked: false } }); }
        if (p.createdIteration) await tx.sfRevision.delete({ where: { id: p.createdIteration.id } });
        if (p.deletedIteration) { const row = p.deletedIteration.iteration; await tx.sfRevision.create({ data: { id: row.id, phase_id: row.phaseId, major: row.major, name: row.name, status: row.status as "NOT_SENT", sent_at: row.sentAt ? new Date(row.sentAt) : null, answered_at: row.answeredAt ? new Date(row.answeredAt) : null, done_at: row.doneAt ? new Date(row.doneAt) : null, visit_date: row.visitDate ? new Date(row.visitDate) : null, note: row.note } }); }
        if (p.beforeIteration) { const row = p.beforeIteration; await tx.sfRevision.update({ where: { id: row.id }, data: { name: row.name, status: row.status as "NOT_SENT" | "SENT" | "ANSWERED" | "REVISED" | "DONE", sent_at: row.sentAt ? new Date(row.sentAt) : null, answered_at: row.answeredAt ? new Date(row.answeredAt) : null, done_at: row.doneAt ? new Date(row.doneAt) : null, visit_date: row.visitDate ? new Date(row.visitDate) : null, note: row.note } }); }
        if (p.requirementId) await tx.sfChecklistItem.update({ where: { id: p.requirementId }, data: { dismissed_at: p.dismissedAtBefore ? new Date(p.dismissedAtBefore) : null } });
        if (p.phaseNoteBefore !== undefined) await tx.sfPhase.update({ where: { id: event.phase_id }, data: { note: p.phaseNoteBefore } });
        if (p.phaseBefore) await tx.sfPhase.update({ where: { id: event.phase_id }, data: { status: p.phaseBefore as PhaseStatus, is_locked: p.phaseBefore === "DONE" } });
        await tx.sfPhaseEvent.update({ where: { id: event.id }, data: { undone_at: nowOf(ports), undone_by_id: input.actor.userId } });
        await writeAudit(ports, tx, { action: "studioflow.phase-event.undone", entityType: "phase-event", entityId: event.id, actor: input.actor, metadata: { projectId: input.projectId } });
        return { eventId: event.id };
      });
    },
    async markProjectCompleted(input: CommandContext & { projectId: string; overrideReason?: string | null }) {
      requireCommand(input, P.projectRead);
      return runTransaction(async (tx) => {
        const project = await loadWritableProject(tx, input.projectId, { allowCompleted: true });
        const access = await getProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: project.id });
        if (!canChangeCompletion(access)) throw new AppError("FORBIDDEN", "PERMISSION_DENIED", "Only a project PIC can complete this project.");
        if (project.status === "COMPLETED") return { projectId: project.id };
        const completion = await assertProjectCompletionReady(tx, input);
        await tx.sfProject.update({ where: { id: project.id }, data: { status: "COMPLETED" } });
        await writeAudit(ports, tx, { action: "studioflow.project.completed", entityType: "project", entityId: project.id, actor: input.actor, changes: { status: { from: project.status, to: "COMPLETED" } }, metadata: completion.overrideReason ? { completionOverrideReason: completion.overrideReason } : undefined });
        return { projectId: project.id };
      });
    },
    async reopenProject(input: CommandContext & { projectId: string }) {
      requireCommand(input, P.projectRead);
      return runTransaction(async (tx) => {
        const project = await loadWritableProject(tx, input.projectId, { allowCompleted: true });
        const access = await getProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: project.id });
        if (!canChangeCompletion(access)) throw new AppError("FORBIDDEN", "PERMISSION_DENIED", "Only a project PIC can reopen this project.");
        if (project.status !== "COMPLETED") return { projectId: project.id };
        await tx.sfProject.update({ where: { id: project.id }, data: { status: "ACTIVE" } });
        await writeAudit(ports, tx, { action: "studioflow.project.reopened", entityType: "project", entityId: project.id, actor: input.actor, changes: { status: { from: "COMPLETED", to: "ACTIVE" } } });
        return { projectId: project.id };
      });
    },
    /** What completing the project would meet right now: unfinished phases block it; open requirements are
     * reminders that are only reported (owner, 2026-10-04/05). */
    async getProjectCompletionReadiness(input: ReadContext & { actor: CommandContext["actor"]; projectId: string }) {
      requireRead(input.grants);
      const readiness = await readProjectCompletionReadiness(db, input.projectId);
      const access = input.actor.userId ? await getProjectAccess(db, { grants: input.grants, actorId: input.actor.userId, projectId: input.projectId }) : null;
      return { ...readiness, canChange: access ? canChangeCompletion(access) : false, canOverride: hasPermission(input.grants, P.projectManage) };
    },
  };

  // ── Reads ───────────────────────────────────────────────────────────────

  function phaseSnapshot(phase: { name_snapshot: string; prefix_snapshot: string; seat_snapshot: string }): PhaseSnapshot {
    return { nameSnapshot: phase.name_snapshot, prefixSnapshot: phase.prefix_snapshot, seatSnapshot: phase.seat_snapshot as PhaseSeat };
  }

  type ImageRow = { id: string; storage_key: string; content_type: string; bytes: number };
  /** Public view of an iteration's images: short-lived signed links, never the storage key. */
  async function signIterationImages(rows: readonly ImageRow[]) {
    return Promise.all(rows.map(async (row) => {
      let url: string | null = null;
      try {
        url = await ports.storage.createSignedReadUrl(row.storage_key, ITERATION_IMAGE_SIGNED_URL_SECONDS);
      } catch {
        // A storage hiccup hides one thumbnail; it must not fail the whole page.
      }
      return { id: row.id, url, contentType: row.content_type, bytes: row.bytes };
    }));
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
          status_changed_at: true, planned_start_date: true, planned_end_date: true, planned_dates_manual: true,
          revisions: { where: { status: { in: OPEN_ITERATION_STATES } }, take: 1, select: { major: true, name: true, status: true, sent_at: true } },
          events: { where: { to_state: "DONE", undone_at: null }, orderBy: { occurred_at: "desc" }, take: 1, select: { auto_created: true } },
        },
      });
      const results = [];
      const countsByPhase = await readBlockerCountsBatch(db, phases.map((phase) => phase.id));
      for (const phase of phases) {
        const counts = countsByPhase.get(phase.id)!;
        const status = phase.status as PhaseStatus;
        const previous = phases.find((p) => p.order_index === phase.order_index - 1) ?? null;
        const canStart = canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null);
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
          waitingDays: status === "ACTIVE" ? waitingDays(phase.revisions[0]?.status === "SENT" ? phase.revisions[0].sent_at : phase.status_changed_at, now) : null,
          statusChangedAt: phase.status_changed_at,
          plannedStartDate: dateToDateOnly(phase.planned_start_date),
          plannedEndDate: dateToDateOnly(phase.planned_end_date),
          plannedDatesManual: phase.planned_dates_manual,
          activeRevision: phase.revisions[0] ? revisionLabel(phase.revisions[0], snap.prefixSnapshot) : null,
          iterationName: phase.revisions[0]?.name ?? null,
          iterationState: phase.revisions[0]?.status ?? null,
          openRootChecklist: counts.openRootChecklistItems,
          blockers: fullBlockers(counts),
          todoBlockers: todoBlockers(counts),
          startBlockedReason: status === "PENDING" && !canStart && previous ? `Starts after ${phaseSnapshot(previous).nameSnapshot} is approved.` : null,
          skippedReason: phaseSkipReason(phase.events[0]),
        });
      }
      return results;
    },

    /** Minimal nav data: id, label, accent, and open root-checklist count. Used by the project workspace rail. */
    async listNavPhases(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      type Row = { id: string; definition_id: string | null; name_snapshot: string; status: string };
      const phases: Row[] = await db.sfPhase.findMany({
        where: { project_id: input.projectId },
        orderBy: { order_index: "asc" },
        select: { id: true, definition_id: true, name_snapshot: true, status: true },
      });
      const grouped = await db.sfChecklistItem.groupBy({
        by: ["phase_id"],
        where: { phase_id: { in: phases.map((phase) => phase.id) }, parent_id: null, is_checked: false },
        _count: { _all: true },
      });
      const counts = new Map(grouped.map((row) => [row.phase_id, row._count._all]));
      return phases.map((p) => ({
        id: p.id,
        definitionId: p.definition_id,
        label: p.name_snapshot,
        status: p.status as PhaseStatus,
        openCount: counts.get(p.id) ?? 0,
      }));
    },

    async getPhaseDetail(input: ReadContext & { projectId: string; phaseId: string }) {
      requireRead(input.grants);
      const phase = await db.sfPhase.findUnique({
        where: { id: input.phaseId },
        select: {
          id: true, project_id: true, definition_id: true, order_index: true, status: true, is_locked: true,
          allow_parallel: true, name_snapshot: true, prefix_snapshot: true, seat_snapshot: true,
          status_changed_at: true, note: true,
          definition: { select: { default_iteration_kinds: true } },
          project: { select: { id: true, name: true, archived_at: true, status: true, pic_designer_id: true, pic_drafter_id: true } },
          revisions: {
            orderBy: { major: "desc" },
            select: {
              id: true, major: true, name: true, status: true, created_at: true, sent_at: true, answered_at: true, done_at: true, visit_date: true, note: true,
              images: ITERATION_IMAGES_SELECT,
            },
          },
          events: { where: { to_state: "DONE", undone_at: null }, orderBy: { occurred_at: "desc" }, take: 1, select: { auto_created: true } },
        },
      });
      if (!phase || phase.project_id !== input.projectId) throw notFound("phase");
      const status = phase.status as PhaseStatus;
      const counts = await readBlockerCounts(db, phase.id);
      const previous = await db.sfPhase.findFirst({ where: { project_id: phase.project_id, order_index: phase.order_index - 1 }, select: { name_snapshot: true, prefix_snapshot: true, seat_snapshot: true, status: true, order_index: true } });
      const canStart = canActivatePhase({ orderIndex: phase.order_index, allowParallel: phase.allow_parallel }, previous ? { status: previous.status as PhaseStatus } : null);
      const active = phase.revisions.find((rev) => OPEN_ITERATION_STATES.includes(rev.status as "NOT_SENT" | "SENT" | "ANSWERED")) ?? null;
      const archived = phase.project.archived_at !== null;
      const snap = phaseSnapshot(phase);
      const isSupervision = isLegacySupervisionDefinition(phase.definition_id);
      const imagesByIteration = new Map(await Promise.all(phase.revisions.map(async (rev) => [rev.id, await signIterationImages(rev.images)] as const)));
      const seatUserId = snap.seatSnapshot === "drafter" ? phase.project.pic_drafter_id : phase.project.pic_designer_id;
      // R2.4E: Warning projection — non-blocking indicators for UI.
      // Warning-only checklist items (the merged requirements) count here, never in blockers.
      const [optionalOpen, deliverables, refRevisionId, blockerItems] = await Promise.all([
        db.sfChecklistItem.count({ where: { phase_id: phase.id, parent_id: null, is_checked: false, is_blocking: false } }),
        db.sfDeliverable.findMany({ where: { phase_id: phase.id }, select: { revision_id: true } }),
        referenceRevisionId(db, phase.id),
        readBlockerItems(db, phase.id, counts),
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
        waitingDays: status !== "ACTIVE" ? null : waitingDays(active?.status === "SENT" ? active.sent_at : phase.status_changed_at, nowOf(ports)),
        modifiable: !archived && isPhaseModifiable({ status, isLocked: phase.is_locked }),
        startBlockedReason: status === "PENDING" && !canStart && previous ? `Starts after ${resolvePhaseName(previous)} is approved.` : phase.project.status !== "ACTIVE" && status === "PENDING" ? "The project is not active." : null,
        blockers: fullBlockers(counts, blockerItems),
        todoBlockers: todoBlockers(counts),
        warnings: { optionalOpen, deliverableStatus: computeDeliverableStatus(deliverables, refRevisionId) },
        note: phase.note,
        isSupervision,
        skippedReason: phaseSkipReason(phase.events[0]),
        canStart: status === "PENDING" && phase.project.status === "ACTIVE" && canStart,
        /** The open iteration with the next steps the server will accept (the same choices the project card shows). */
        currentIteration: active ? {
          id: active.id, name: active.name, state: active.status, sentAt: active.sent_at, visitDate: dateToDateOnly(active.visit_date),
          waitingDays: active.status === "SENT" ? waitingDays(active.sent_at, nowOf(ports)) : null,
          choices: iterationChoices({ state: active.status, phaseStatus: status, iterationName: active.name, kinds: iterationKinds(phase.definition.default_iteration_kinds), supervision: isSupervision }),
          /** The outcomes offered once the client has answered (Revision / Done, or Continue to CD Final on CD Mall). */
          answerChoices: iterationChoices({ state: "ANSWERED", phaseStatus: status, iterationName: active.name, kinds: iterationKinds(phase.definition.default_iteration_kinds), supervision: isSupervision }),
          note: active.note,
          images: imagesByIteration.get(active.id) ?? [],
        } : null,
        /** The iteration before the open one: its notes are the brief for the open iteration. */
        previousIteration: (() => {
          const before = active ? phase.revisions.find((rev) => rev.major < active.major) : null;
          return before ? { id: before.id, name: before.name, state: before.status, note: before.note, images: imagesByIteration.get(before.id) ?? [] } : null;
        })(),
        iterations: phase.revisions.map((rev) => ({
          id: rev.id, name: rev.name, state: rev.status, createdAt: rev.created_at, sentAt: rev.sent_at, answeredAt: rev.answered_at, doneAt: rev.done_at,
          visitDate: dateToDateOnly(rev.visit_date), note: rev.note, images: imagesByIteration.get(rev.id) ?? [],
        })),
        activeRevision: active ? { id: active.id, label: revisionLabel(active, snap.prefixSnapshot), name: active.name, state: active.status, sentAt: active.sent_at, createdAt: active.created_at, note: active.note, images: imagesByIteration.get(active.id) ?? [] } : null,
        history: phase.revisions.filter((rev) => !OPEN_ITERATION_STATES.includes(rev.status as "NOT_SENT" | "SENT" | "ANSWERED")).map((rev) => ({
          id: rev.id,
          label: revisionLabel(rev, snap.prefixSnapshot),
          name: rev.name,
          state: rev.status,
          createdAt: rev.created_at,
          closedAt: rev.done_at ?? rev.answered_at,
          note: rev.note,
          images: imagesByIteration.get(rev.id) ?? [],
        })),
      };
    },

    /** The project's latest phase event when this person may still undo it (same actor, within five minutes, not yet undone). */
    async latestUndoableEvent(input: ReadContext & { actor: AuditActor; projectId: string }) {
      requireRead(input.grants);
      const event = await db.sfPhaseEvent.findFirst({ where: { project_id: input.projectId }, orderBy: [{ occurred_at: "desc" }, { id: "desc" }], include: { phase: { select: { name_snapshot: true } } } });
      if (!event || event.undone_at || event.actor_id !== input.actor.userId) return null;
      const expiresAt = new Date(event.occurred_at.getTime() + UNDO_WINDOW_MS);
      if (nowOf(ports) >= expiresAt) return null;
      return { id: event.id, phaseName: event.phase.name_snapshot, toState: event.to_state, expiresAt };
    },

    /** The free-text note of every phase of a project, for the card's notes dialog. */
    async listPhaseNotes(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const rows = await db.sfPhase.findMany({ where: { project_id: input.projectId }, orderBy: { order_index: "asc" }, select: { id: true, name_snapshot: true, note: true } });
      return rows.map((row) => ({ phaseId: row.id, phaseName: row.name_snapshot, note: row.note }));
    },

    capabilities(grants: ReadContext["grants"]) {
      return {
        work: hasPermission(grants, P.phaseWork),
        review: hasPermission(grants, P.phaseReview),
        override: hasPermission(grants, P.phaseOverride),
      };
    },
  };

  return { ...commands, ...iterationCommands, ...reads, ...createPhaseTemplateService(db, ports), ...deliverables };
}
