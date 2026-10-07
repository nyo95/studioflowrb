"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";
import { studioFlow } from "@/apps/studioflow/runtime";

/**
 * StudioFlow server-action boundary. Validates transport input, resolves the
 * principal, and delegates every decision to the StudioFlow services.
 */

const Id = z.uuid();
const OptionalText = z.string().max(2000).nullish();
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal(""));

async function context() {
  const { principal, grants } = await requirePrincipalGrants();
  return { grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName }, userId: principal.userId };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function refresh(projectId?: string) {
  revalidatePath("/studioflow", "layout");
  if (projectId) revalidatePath(`/studioflow/projects/${projectId}`, "layout");
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function setArchiveRetentionAction(archiveRetentionDays: number): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.projects.setArchiveRetention({ ...ctx, archiveRetentionDays: parse(z.number().int().min(7).max(730), archiveRetentionDays) });
    refresh();
    return result;
  });
}

const TemplateInput = z.strictObject({ definitionId: Id.nullable(), label: z.string().min(1).max(200), isBlocking: z.boolean().optional() });
export async function createTemplateAction(input: z.infer<typeof TemplateInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.createTemplate({ ...ctx, ...parse(TemplateInput, input) });
    refresh();
    return result;
  });
}

const TemplateUpdate = z.strictObject({ templateId: Id, label: z.string().min(1).max(200).optional(), isActive: z.boolean().optional(), isBlocking: z.boolean().optional() });
export async function updateTemplateAction(input: z.infer<typeof TemplateUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.updateTemplate({ ...ctx, ...parse(TemplateUpdate, input) });
    refresh();
    return result;
  });
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.deleteTemplate({ ...ctx, templateId: parse(Id, templateId) });
    refresh();
    return result;
  });
}

const TemplateReorder = z.strictObject({ definitionId: Id.nullable(), orderedIds: z.array(Id).min(1).max(500) });
export async function reorderTemplatesAction(input: z.infer<typeof TemplateReorder>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.reorderTemplates({ ...ctx, ...parse(TemplateReorder, input) });
    refresh();
    return result;
  });
}

// ── CD List (Construction Drawing drawings) ────────────────────────────────

const CdItemCreate = z.strictObject({ projectId: Id, phaseId: Id, drawingCode: z.string().max(40), drawingName: z.string().min(1).max(200), assignedToId: Id.nullish() });
export async function createCdItemAction(input: z.infer<typeof CdItemCreate>): Promise<ActionResult<{ itemId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(CdItemCreate, input);
    const item = await studioFlow.cdList.create({ ...ctx, ...data });
    refresh(data.projectId);
    return { itemId: item.id };
  });
}

const CdItemUpdate = z.strictObject({ projectId: Id, phaseId: Id, itemId: Id, drawingCode: z.string().max(40).optional(), drawingName: z.string().min(1).max(200).optional(), assignedToId: Id.nullish() });
export async function updateCdItemAction(input: z.infer<typeof CdItemUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(CdItemUpdate, input);
    const result = await studioFlow.cdList.update({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

const CdItemStatus = z.strictObject({ projectId: Id, phaseId: Id, itemId: Id, status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]) });
export async function setCdItemStatusAction(input: z.infer<typeof CdItemStatus>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(CdItemStatus, input);
    const result = await studioFlow.cdList.setStatus({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

const CdItemRef = z.strictObject({ projectId: Id, phaseId: Id, itemId: Id });
export async function deleteCdItemAction(input: z.infer<typeof CdItemRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(CdItemRef, input);
    const result = await studioFlow.cdList.delete({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

// ── Clients ─────────────────────────────────────────────────────────────────

const ClientInput = z.strictObject({ clientId: Id.optional(), name: z.string().min(1).max(200), address: OptionalText });
export async function saveClientAction(input: z.infer<typeof ClientInput>): Promise<ActionResult<{ clientId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ClientInput, input);
    const result = data.clientId
      ? await studioFlow.projects.updateClient({ ...ctx, clientId: data.clientId, name: data.name, address: data.address })
      : await studioFlow.projects.createClient({ ...ctx, name: data.name, address: data.address });
    refresh();
    return result;
  });
}

export async function setClientArchivedAction(clientId: string, archived: boolean): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, clientId);
    const result = archived ? await studioFlow.projects.archiveClient({ ...ctx, clientId: id }) : await studioFlow.projects.restoreClient({ ...ctx, clientId: id });
    refresh();
    return result;
  });
}

// ── Projects ────────────────────────────────────────────────────────────────

const Priority = z.enum(["URGENT", "NORMAL", "LOW"]);
const ProjectFields = {
  clientId: Id.nullish(),
  newClientName: z.string().max(200).nullish(),
  picDesignerId: Id,
  picDrafterId: Id,
  openingDate: DateOnly,
  timelineStartDate: DateOnly,
  clientContact: z.string().max(200).nullish(),
  address: OptionalText,
  area: z.string().max(20).nullish(),
};
const ProjectCreate = z.strictObject({ name: z.string().min(1).max(200), priority: Priority.optional(), ...ProjectFields });
export async function createProjectAction(input: z.infer<typeof ProjectCreate>): Promise<ActionResult<{ projectId: string; name: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ProjectCreate, input);
    const result = await studioFlow.projects.createProject({ ...ctx, ...data, openingDate: data.openingDate || null });
    refresh();
    return result;
  });
}

const ProjectUpdate = z.strictObject({ projectId: Id, name: z.string().min(1).max(200), ...ProjectFields });
export async function updateProjectAction(input: z.infer<typeof ProjectUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ProjectUpdate, input);
    const result = await studioFlow.projects.updateProject({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

/** Timeline is the only place a project's start and opening date are set (owner, 2026-09-30). */
const ProjectDates = z.strictObject({ projectId: Id, timelineStartDate: DateOnly, openingDate: DateOnly });
export async function setProjectDatesAction(input: z.infer<typeof ProjectDates>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ProjectDates, input);
    const result = await studioFlow.projects.updateProject({ ...ctx, projectId: data.projectId, timelineStartDate: data.timelineStartDate || null, openingDate: data.openingDate || null });
    refresh(data.projectId);
    return result;
  });
}
const FitOutStart = z.strictObject({ projectId: Id, fitOutStartDate: DateOnly });
export async function setFitOutStartAction(input: z.infer<typeof FitOutStart>): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const ctx = await context(); const data = parse(FitOutStart, input); const result = await studioFlow.projects.setFitOutStart({ ...ctx, projectId: data.projectId, fitOutStartDate: data.fitOutStartDate || null }); refresh(data.projectId); return result; }); }
export async function applyProjectPlanAction(projectId: string): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const ctx = await context(); const id = parse(Id, projectId); const result = await studioFlow.projects.applyProjectPlan({ ...ctx, projectId: id }); refresh(id); return result; }); }
const PlanDays = z.number().int().min(1).max(260);
const PlanIntervalsInput = z.strictObject({ cdMall: PlanDays, cdFinal: PlanDays, gap: PlanDays, fitOutToHandover: PlanDays, handoverToOpening: PlanDays });
export async function setPlanningDefaultsAction(input: z.infer<typeof PlanIntervalsInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { const ctx = await context(); const result = await studioFlow.projects.setPlanningDefaults({ ...ctx, ...parse(PlanIntervalsInput, input) }); refresh(); return result; });
}
const PlanOverridesInput = z.strictObject({ projectId: Id, overrides: PlanIntervalsInput.partial().nullable() });
export async function setPlanOverridesAction(input: z.infer<typeof PlanOverridesInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { const ctx = await context(); const data = parse(PlanOverridesInput, input); const result = await studioFlow.projects.setPlanOverrides({ ...ctx, projectId: data.projectId, overrides: data.overrides }); refresh(data.projectId); return result; });
}
export async function resetPhasePlannedDatesAction(projectId: string, phaseId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { const ctx = await context(); const result = await studioFlow.projects.resetPhasePlannedDates({ ...ctx, projectId: parse(Id, projectId), phaseId: parse(Id, phaseId) }); refresh(projectId); return result; });
}
const HolidayInput = z.strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().trim().min(1).max(120) });
export async function addHolidayAction(input: z.infer<typeof HolidayInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { const ctx = await context(); const result = await studioFlow.projects.addHoliday({ ...ctx, ...parse(HolidayInput, input) }); refresh(); return result; });
}
export async function removeHolidayAction(holidayId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { const ctx = await context(); const result = await studioFlow.projects.removeHoliday({ ...ctx, holidayId: parse(Id, holidayId) }); refresh(); return result; });
}

export async function setProjectPriorityAction(projectId: string, priority: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const result = await studioFlow.projects.setProjectPriority({ ...ctx, projectId: id, priority: parse(Priority, priority) });
    refresh(id);
    return result;
  });
}

/** Active ↔ On hold only; completing and reopening have their own actions. */
export async function setProjectStatusAction(projectId: string, status: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const result = await studioFlow.projects.setProjectStatus({ ...ctx, projectId: id, status: parse(z.enum(["ACTIVE", "ON_HOLD"]), status) });
    refresh(id);
    return result;
  });
}

const Reason = z.string().max(500);
export async function archiveProjectAction(projectId: string, reason: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const result = await studioFlow.projects.archiveProject({ ...ctx, projectId: id, reason: parse(Reason, reason) });
    refresh(id);
    return result;
  });
}

/** How many archived projects the next cleanup would purge right now (reads only). */
export async function getAssetCleanupPreviewAction(): Promise<ActionResult<{ eligibleProjects: number; retentionDays: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    return studioFlow.projects.previewAssetCleanup(ctx);
  });
}

/** Owner-triggered cleanup of archived-project files past the retention window. Irreversible. */
export async function runAssetCleanupAction(limit?: number) {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.projects.runAssetCleanup({ ...ctx, limit: parse(z.number().int().min(1).max(100).default(25), limit) });
    refresh();
    return result;
  });
}

export async function restoreProjectAction(projectId: string, reason: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const result = await studioFlow.projects.restoreProject({ ...ctx, projectId: id, reason: parse(Reason, reason) });
    refresh(id);
    return result;
  });
}

export async function syncChecklistAction(projectId: string): Promise<ActionResult<{ created: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const result = await studioFlow.tasks.syncProjectChecklist({ ...ctx, projectId: id });
    refresh(id);
    return result;
  });
}

// ── Phase commands ──────────────────────────────────────────────────────────

const PhaseCommand = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("addIteration"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("sendIteration"), projectId: Id, phaseId: Id, iterationId: Id }),
  z.strictObject({ command: z.literal("recordClientAnswer"), projectId: Id, phaseId: Id, iterationId: Id, note: z.string().max(4000).nullish() }),
  z.strictObject({ command: z.literal("setIterationNote"), projectId: Id, phaseId: Id, iterationId: Id, note: z.string().max(4000).nullable() }),
  z.strictObject({ command: z.literal("chooseOutcome"), projectId: Id, phaseId: Id, iterationId: Id, outcome: z.enum(["REVISION", "DONE", "CONTINUE_CD_FINAL"]) }),
  z.strictObject({ command: z.literal("renameIteration"), projectId: Id, phaseId: Id, iterationId: Id, name: z.string().max(200) }),
  z.strictObject({ command: z.literal("deleteIteration"), projectId: Id, phaseId: Id, iterationId: Id }),
  z.strictObject({ command: z.literal("setPhaseNote"), projectId: Id, phaseId: Id, note: z.string().max(2000).nullable() }),
  z.strictObject({ command: z.literal("dismissRequirement"), projectId: Id, phaseId: Id, itemId: Id }),
  z.strictObject({ command: z.literal("createVisit"), projectId: Id, phaseId: Id, visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().max(2000).nullish() }),
  z.strictObject({ command: z.literal("chooseVisit"), projectId: Id, phaseId: Id, iterationId: Id, outcome: z.enum(["NEXT_VISIT", "DONE"]) }),
  z.strictObject({ command: z.literal("bypass"), projectId: Id, phaseId: Id, reason: Reason }),
  z.strictObject({ command: z.literal("override"), projectId: Id, phaseId: Id, mode: z.enum(["HARD_RESET_ACTIVE", "HARD_RESET_PENDING"]), major: z.number().int().optional(), note: z.string().max(1000) }),
]);

export type PhaseCommandInput = z.infer<typeof PhaseCommand>;

/** What the screens need after a phase command: whether the change can still be undone, and until when. */
export type PhaseCommandOutcome = { result: unknown; undo: { eventId: string; label: string; expiresAt: string } | null };

export async function phaseCommandAction(input: PhaseCommandInput): Promise<ActionResult<PhaseCommandOutcome>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PhaseCommand, input);
    const base = { ...ctx, projectId: data.projectId, phaseId: data.phaseId };
    const phases = studioFlow.phases;
    let result: unknown;
    switch (data.command) {
      case "addIteration": result = await phases.addIteration(base); break;
      case "sendIteration": result = await phases.sendIteration({ ...base, iterationId: data.iterationId }); break;
      case "recordClientAnswer": result = await phases.recordClientAnswer({ ...base, iterationId: data.iterationId, note: data.note }); break;
      case "setIterationNote": result = await phases.setIterationNote({ ...base, iterationId: data.iterationId, note: data.note }); break;
      case "chooseOutcome": result = await phases.chooseIterationOutcome({ ...base, iterationId: data.iterationId, outcome: data.outcome }); break;
      case "renameIteration": result = await phases.renameIteration({ ...base, iterationId: data.iterationId, name: data.name }); break;
      case "deleteIteration": result = await phases.deleteNeverSentIteration({ ...base, iterationId: data.iterationId }); break;
      case "setPhaseNote": result = await phases.setPhaseNote({ ...base, note: data.note }); break;
      case "dismissRequirement": result = await phases.dismissRequirement({ ...base, itemId: data.itemId }); break;
      case "createVisit": result = await phases.createSupervisionVisit({ ...base, visitDate: data.visitDate, note: data.note ?? null }); break;
      case "chooseVisit": result = await phases.chooseSupervisionVisit({ ...base, iterationId: data.iterationId, outcome: data.outcome }); break;
      case "bypass": result = await phases.bypassPhase({ ...base, reason: data.reason }); break;
      case "override": result = await phases.overrideRevision({ ...base, mode: data.mode, major: data.major, note: data.note }); break;
    }
    refresh(data.projectId);
    const undoable = await phases.latestUndoableEvent({ grants: ctx.grants, actor: ctx.actor, projectId: data.projectId });
    const undo = undoable ? { eventId: undoable.id, label: `${undoable.phaseName}`, expiresAt: undoable.expiresAt.toISOString() } : null;
    return { result, undo };
  });
}

const UndoInput = z.strictObject({ projectId: Id, eventId: Id });
export async function undoPhaseEventAction(input: z.infer<typeof UndoInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(UndoInput, input);
    const result = await studioFlow.phases.undoPhaseEvent({ ...ctx, projectId: data.projectId, eventId: data.eventId });
    refresh(data.projectId);
    return result;
  });
}

/** Marking a project completed (or reopening it) is always a person's explicit choice; no phase change does it. */
export async function projectCompletionAction(projectId: string, change: "complete" | "reopen", overrideReason?: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const reason = parse(z.string().max(500).optional(), overrideReason);
    const result = parse(z.enum(["complete", "reopen"]), change) === "complete"
      ? await studioFlow.phases.markProjectCompleted({ ...ctx, projectId: id, overrideReason: reason })
      : await studioFlow.phases.reopenProject({ ...ctx, projectId: id });
    refresh(id);
    return result;
  });
}

/** Library: website images and offerings for one batch of Brands (read-only). */
export async function libraryBrandWebsitesAction(brandIds: string[]) {
  return runSafeAction(async () => {
    const ctx = await context();
    return studioFlow.library.readBrandWebsites({ grants: ctx.grants, brandIds: parse(z.array(Id).max(24), brandIds) });
  });
}

/** What completing the project would meet right now, for the confirmation dialog. Writes nothing. */
export async function projectCompletionReadinessAction(projectId: string) {
  return runSafeAction(async () => {
    const ctx = await context();
    return studioFlow.phases.getProjectCompletionReadiness({ grants: ctx.grants, actor: ctx.actor, projectId: parse(Id, projectId) });
  });
}

export async function listPhaseNotesAction(projectId: string) {
  return runSafeAction(async () => {
    const ctx = await context();
    return studioFlow.phases.listPhaseNotes({ grants: ctx.grants, projectId: parse(Id, projectId) });
  });
}

// ── Portfolio Timeline ─────────────────────────────────────────────────────

const PhasePlannedDates = z.strictObject({ projectId: Id, phaseId: Id, plannedStartDate: DateOnly, plannedEndDate: DateOnly });
export async function setPhasePlannedDatesAction(input: z.infer<typeof PhasePlannedDates>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PhasePlannedDates, input);
    const result = await studioFlow.phases.setPhasePlannedDates({
      ...ctx,
      projectId: data.projectId,
      phaseId: data.phaseId,
      plannedStartDate: data.plannedStartDate || null,
      plannedEndDate: data.plannedEndDate || null,
    });
    refresh(data.projectId);
    revalidatePath("/studioflow/timeline", "layout");
    return result;
  });
}


// ── MOM (SF-R2) ─────────────────────────────────────────────────────────────

function refreshMom(projectId: string) {
  revalidatePath(`/studioflow/projects/${projectId}`, "layout");
  revalidatePath(`/studioflow/print/projects/${projectId}`, "layout");
}

const MomCreate = z.strictObject({ projectId: Id, topic: z.string().max(400) });
export async function createMomDocumentAction(input: z.infer<typeof MomCreate>): Promise<ActionResult<{ documentId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomCreate, input);
    const result = await studioFlow.mom.createDocument({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomRevisionSave = z.strictObject({ projectId: Id, documentId: Id, note: z.string().max(400).optional() });
export async function saveMomRevisionAction(input: z.infer<typeof MomRevisionSave>): Promise<ActionResult<{ number: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomRevisionSave, input);
    const result = await studioFlow.mom.saveRevision({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomRevisionRestore = z.strictObject({ projectId: Id, documentId: Id, revisionId: Id });
export async function restoreMomRevisionAction(input: z.infer<typeof MomRevisionRestore>): Promise<ActionResult<{ number: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomRevisionRestore, input);
    const result = await studioFlow.mom.restoreRevision({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomHeader = z.strictObject({
  projectId: Id,
  documentId: Id,
  topic: z.string().max(200),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().max(500).nullish(),
  attendees: z.string().max(5000).nullish(),
  preparedByName: z.string().max(200),
});
export async function updateMomDocumentAction(input: z.infer<typeof MomHeader>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomHeader, input);
    const result = await studioFlow.mom.updateDocument({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomDocRef = z.strictObject({ projectId: Id, documentId: Id });
export async function deleteMomDocumentAction(input: z.infer<typeof MomDocRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomDocRef, input);
    const result = await studioFlow.mom.deleteDocument({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

export async function addMomItemAction(input: z.infer<typeof MomDocRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomDocRef, input);
    const result = await studioFlow.mom.addItem({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomItemUpdate = z.strictObject({ projectId: Id, itemId: Id, isTextOnly: z.boolean() });
export async function updateMomItemAction(input: z.infer<typeof MomItemUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomItemUpdate, input);
    const result = await studioFlow.mom.updateItem({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomItemRef = z.strictObject({ projectId: Id, itemId: Id });
export async function deleteMomItemAction(input: z.infer<typeof MomItemRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomItemRef, input);
    const result = await studioFlow.mom.deleteItem({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const Direction = z.enum(["up", "down"]);
const MomItemMove = z.strictObject({ projectId: Id, itemId: Id, direction: Direction });
export async function moveMomItemAction(input: z.infer<typeof MomItemMove>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomItemMove, input);
    const result = await studioFlow.mom.moveItem({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomItemContentUpdate = z.strictObject({ projectId: Id, itemId: Id, content: z.string().max(20000) });
export async function updateMomItemContentAction(input: z.infer<typeof MomItemContentUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomItemContentUpdate, input);
    const result = await studioFlow.mom.updateItemContent({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomImageForm = z.strictObject({ projectId: Id, itemId: Id, slot: z.coerce.number().int() });
/** Multipart upload: `projectId`, `itemId`, `slot`, `file`. Size/type policy lives in the service. */
export async function setMomImageAction(formData: FormData): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomImageForm, { projectId: formData.get("projectId"), itemId: formData.get("itemId"), slot: formData.get("slot") });
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "MOM_IMAGE_REQUIRED", "Choose an image.");
    const result = await studioFlow.mom.setImage({ ...ctx, ...data, file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } });
    refreshMom(data.projectId);
    return result;
  });
}

const MomImageRef = z.strictObject({ projectId: Id, imageId: Id });
export async function deleteMomImageAction(input: z.infer<typeof MomImageRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomImageRef, input);
    const result = await studioFlow.mom.deleteImage({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

export async function swapMomImagesAction(input: z.infer<typeof MomItemRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomItemRef, input);
    const result = await studioFlow.mom.swapImages({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

// ── Product Schedule (SF-R3) ───────────────────────────────────────────────

function refreshSchedule(projectId: string) {
  revalidatePath(`/studioflow/projects/${projectId}`, "layout");
}

// ── Presentation ───────────────────────────────────────────────────────────

function refreshPresentation(projectId: string) {
  revalidatePath(`/studioflow/projects/${projectId}`, "layout");
}

const PresentationBoardInput = z.strictObject({ projectId: Id, boardId: Id.optional(), title: z.string().min(1).max(200) });
export async function createPresentationBoardAction(input: z.infer<typeof PresentationBoardInput>): Promise<ActionResult<{ boardId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationBoardInput, input);
    const result = await studioFlow.presentation.createBoard({ ...ctx, projectId: data.projectId, title: data.title });
    refreshPresentation(data.projectId);
    return result;
  });
}

export async function updatePresentationBoardAction(input: z.infer<typeof PresentationBoardInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationBoardInput, input);
    if (!data.boardId) throw new AppError("VALIDATION", "PRESENTATION_BOARD_REQUIRED", "Choose a presentation board.");
    const result = await studioFlow.presentation.updateBoard({ ...ctx, projectId: data.projectId, boardId: data.boardId, title: data.title });
    refreshPresentation(data.projectId);
    return result;
  });
}

const PresentationBoardRef = z.strictObject({ projectId: Id, boardId: Id });
export async function deletePresentationBoardAction(input: z.infer<typeof PresentationBoardRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationBoardRef, input);
    await studioFlow.presentation.deleteBoard({ ...ctx, ...data });
    refreshPresentation(data.projectId);
    return {};
  });
}

const PresentationSlidesOrder = z.strictObject({ projectId: Id, boardId: Id, orderedIds: z.array(Id).min(1).max(500) });
export async function reorderPresentationSlidesAction(input: z.infer<typeof PresentationSlidesOrder>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationSlidesOrder, input);
    await studioFlow.presentation.reorderSlides({ ...ctx, ...data });
    refreshPresentation(data.projectId);
    return {};
  });
}

export async function addPresentationSlidesAction(formData: FormData): Promise<ActionResult<{ slideIds: string[] }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const projectId = parse(Id, formData.get("projectId"));
    const boardId = parse(Id, formData.get("boardId"));
    const files = formData.getAll("files").filter((value): value is File => value instanceof File);
    const result = await studioFlow.presentation.addSlides({
      ...ctx,
      projectId,
      boardId,
      files: await Promise.all(files.map(async (file) => ({ body: new Uint8Array(await file.arrayBuffer()), contentType: file.type }))),
    });
    refreshPresentation(projectId);
    return result;
  });
}

const PresentationSlideRef = z.strictObject({ projectId: Id, slideId: Id });
export async function deletePresentationSlideAction(input: z.infer<typeof PresentationSlideRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationSlideRef, input);
    await studioFlow.presentation.deleteSlide({ ...ctx, ...data });
    refreshPresentation(data.projectId);
    return {};
  });
}

const PresentationAnnotationInput = z.strictObject({ projectId: Id, slideId: Id.optional(), annotationId: Id.optional(), pinX: z.number().min(0).max(100).optional(), pinY: z.number().min(0).max(100).optional(), scheduleEntryId: Id.nullish(), labelSide: z.enum(["auto", "left", "right"]).optional(), note: OptionalText });
export async function addPresentationAnnotationAction(input: z.infer<typeof PresentationAnnotationInput>): Promise<ActionResult<{ annotationId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationAnnotationInput, input);
    if (!data.slideId || data.pinX === undefined || data.pinY === undefined) throw new AppError("VALIDATION", "PRESENTATION_PIN_REQUIRED", "Choose a slide and pin position.");
    const result = await studioFlow.presentation.addAnnotation({ ...ctx, projectId: data.projectId, slideId: data.slideId, pinX: data.pinX, pinY: data.pinY, scheduleEntryId: data.scheduleEntryId, labelSide: data.labelSide, note: data.note });
    refreshPresentation(data.projectId);
    return result;
  });
}

export async function updatePresentationAnnotationAction(input: z.infer<typeof PresentationAnnotationInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationAnnotationInput, input);
    if (!data.annotationId) throw new AppError("VALIDATION", "PRESENTATION_PIN_REQUIRED", "Choose a pin.");
    await studioFlow.presentation.updateAnnotation({ ...ctx, projectId: data.projectId, annotationId: data.annotationId, pinX: data.pinX, pinY: data.pinY, scheduleEntryId: data.scheduleEntryId, labelSide: data.labelSide, note: data.note });
    refreshPresentation(data.projectId);
    return {};
  });
}

const PresentationAnnotationRef = z.strictObject({ projectId: Id, annotationId: Id });
export async function deletePresentationAnnotationAction(input: z.infer<typeof PresentationAnnotationRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PresentationAnnotationRef, input);
    await studioFlow.presentation.deleteAnnotation({ ...ctx, ...data });
    refreshPresentation(data.projectId);
    return {};
  });
}

const ScheduleSection = z.enum(["MATERIAL", "FIXTURE"]);
const ScheduleSnapshot = z.strictObject({
  brandId: Id.nullish(),
  brandName: z.string().max(160).nullish(),
  productName: z.string().max(200),
  color: z.string().max(160).nullish(),
  pattern: z.string().max(160).nullish(),
  finishing: z.string().max(160).nullish(),
  dimension: z.string().max(160).nullish(),
  notes: z.string().max(2000).nullish(),
  /** Free-form spec lines; the service normalizes, de-duplicates and caps them. */
  extra: z.array(z.strictObject({ label: z.string().max(60), value: z.string().max(300) })).max(12).nullish(),
});
const ScheduleEntryInput = z.strictObject({
  projectId: Id,
  section: ScheduleSection,
  category: z.string().min(1).max(80),
  qty: z.string().max(20).nullish(),
  unit: z.string().max(40).nullish(),
  location: z.string().max(160).nullish(),
  snapshot: ScheduleSnapshot.nullish(),
});
export async function createScheduleEntryAction(input: z.infer<typeof ScheduleEntryInput>): Promise<ActionResult<{ entryId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryInput, input);
    const result = await studioFlow.schedule.createEntry({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleEntryUpdate = z.strictObject({ projectId: Id, entryId: Id, qty: z.string().max(20).nullable().optional(), unit: z.string().max(40).nullable().optional(), location: z.string().max(160).nullable().optional() });
export async function updateScheduleEntryAction(input: z.infer<typeof ScheduleEntryUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryUpdate, input);
    const result = await studioFlow.schedule.updateEntry({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

/** `fields: null` clears the override and returns the card to the default set. */
const ScheduleEntryCardFields = z.strictObject({ projectId: Id, entryId: Id, fields: z.array(z.string().max(64)).max(24).nullable() });
export async function updateScheduleEntryCardFieldsAction(input: z.infer<typeof ScheduleEntryCardFields>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryCardFields, input);
    const result = await studioFlow.schedule.updateEntryCardFields({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleEntryRef = z.strictObject({ projectId: Id, entryId: Id });
export async function deleteScheduleEntryAction(input: z.infer<typeof ScheduleEntryRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryRef, input);
    const result = await studioFlow.schedule.deleteEntry({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleOptionInput = z.strictObject({ projectId: Id, entryId: Id, snapshot: ScheduleSnapshot });
export async function createScheduleOptionAction(input: z.infer<typeof ScheduleOptionInput>): Promise<ActionResult<{ optionId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionInput, input);
    const result = await studioFlow.schedule.createOption({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleOptionRef = z.strictObject({ projectId: Id, optionId: Id });
export async function markScheduleFinalAction(input: z.infer<typeof ScheduleOptionRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionRef, input);
    const result = await studioFlow.schedule.markFinal({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

export async function unmarkScheduleFinalAction(input: z.infer<typeof ScheduleOptionRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionRef, input);
    const result = await studioFlow.schedule.unmarkFinal({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

export async function deleteScheduleOptionAction(input: z.infer<typeof ScheduleOptionRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionRef, input);
    const result = await studioFlow.schedule.deleteOption({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleImageForm = z.strictObject({ projectId: Id, optionId: Id });
/** Option photo upload (FormData: projectId, optionId, file). */
export async function setScheduleOptionImageAction(formData: FormData): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleImageForm, { projectId: formData.get("projectId"), optionId: formData.get("optionId") });
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "SCHEDULE_IMAGE_REQUIRED", "Choose an image.");
    const result = await studioFlow.schedule.setOptionImage({ ...ctx, ...data, file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } });
    refreshSchedule(data.projectId);
    return result;
  });
}

export async function removeScheduleOptionImageAction(input: z.infer<typeof ScheduleOptionRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionRef, input);
    const result = await studioFlow.schedule.removeOptionImage({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleSampleRequest = z.strictObject({ projectId: Id, optionId: Id, requestedFrom: z.string().max(200).optional(), note: OptionalText });
export async function requestScheduleSampleAction(input: z.infer<typeof ScheduleSampleRequest>): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleSampleRequest, input);
    const result = await studioFlow.schedule.requestSample({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleSampleReceive = z.strictObject({ projectId: Id, requestId: Id, note: OptionalText });
export async function receiveScheduleSampleAction(input: z.infer<typeof ScheduleSampleReceive>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleSampleReceive, input);
    const result = await studioFlow.schedule.receiveSample({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleSampleCancel = z.strictObject({ projectId: Id, requestId: Id });
export async function cancelScheduleSampleAction(input: z.infer<typeof ScheduleSampleCancel>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleSampleCancel, input);
    const result = await studioFlow.schedule.cancelSample({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

export async function saveScheduleEntryAsTemplateAction(input: z.infer<typeof ScheduleEntryRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryRef, input);
    const result = await studioFlow.schedule.saveEntryAsTemplate({ ...ctx, ...data });
    refresh();
    return result;
  });
}

const ScheduleApply = z.strictObject({ projectId: Id });
export async function applyScheduleTemplatesAction(input: z.infer<typeof ScheduleApply>): Promise<ActionResult<{ created: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleApply, input);
    const result = await studioFlow.schedule.applyTemplates({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleCsvImport = z.strictObject({
  projectId: Id,
  section: ScheduleSection,
  csv: z.string().max(200000).optional(),
  /** An .xlsx or .csv upload as base64 (about 5 MB of file). */
  file: z.strictObject({ name: z.string().min(1).max(200), base64: z.string().max(7_200_000) }).optional(),
});
export async function importScheduleCsvAction(input: z.infer<typeof ScheduleCsvImport>): Promise<ActionResult<{ created: number; updated: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleCsvImport, input);
    const { file, ...rest } = data;
    const result = await studioFlow.schedule.importCsv({ ...ctx, ...rest, ...(file ? { file: { name: file.name, data: Buffer.from(file.base64, "base64") } } : {}) });
    refreshSchedule(data.projectId);
    return result;
  });
}

export async function scheduleImportTemplateAction(input: { projectId: string; format?: "xlsx" | "csv" }): Promise<ActionResult<{ filename: string; mimeType: string; base64: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(z.strictObject({ projectId: Id, format: z.enum(["xlsx", "csv"]).optional() }), input);
    const file = await studioFlow.schedule.importTemplate({ ...ctx, ...data });
    return { filename: file.filename, mimeType: file.mimeType, base64: file.data.toString("base64") };
  });
}

const SchedulePrefixInput = z.strictObject({ section: ScheduleSection, category: z.string().min(1).max(80), prefix: z.string().min(1).max(8) });
export async function upsertSchedulePrefixAction(input: z.infer<typeof SchedulePrefixInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.schedule.upsertPrefix({ ...ctx, ...parse(SchedulePrefixInput, input) });
    refresh();
    return result;
  });
}

const ScheduleTemplateItemInput = z.strictObject({
  templateCategoryId: Id.nullish(),
  section: ScheduleSection,
  category: z.string().min(1).max(80),
  snapshot: ScheduleSnapshot,
  qty: z.string().max(20).nullish(),
  unit: z.string().max(40).nullish(),
  location: z.string().max(160).nullish(),
});
export async function createScheduleTemplateItemAction(input: z.infer<typeof ScheduleTemplateItemInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.schedule.createTemplateItem({ ...ctx, ...parse(ScheduleTemplateItemInput, input) });
    refresh();
    return result;
  });
}

const ScheduleTemplateItemUpdate = z.strictObject({
  templateItemId: Id,
  snapshot: ScheduleSnapshot,
  qty: z.string().max(20).nullish(),
  unit: z.string().max(40).nullish(),
  location: z.string().max(160).nullish(),
});
export async function updateScheduleTemplateItemAction(input: z.infer<typeof ScheduleTemplateItemUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.schedule.updateTemplateItem({ ...ctx, ...parse(ScheduleTemplateItemUpdate, input) });
    refresh();
    return result;
  });
}

const ScheduleOptionUpdate = z.strictObject({ projectId: Id, optionId: Id, snapshot: ScheduleSnapshot });
export async function updateScheduleOptionAction(input: z.infer<typeof ScheduleOptionUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionUpdate, input);
    const result = await studioFlow.schedule.updateOption({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleEntryMove = z.strictObject({ projectId: Id, entryId: Id, direction: z.enum(["up", "down"]) });
export async function moveScheduleEntryAction(input: z.infer<typeof ScheduleEntryMove>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryMove, input);
    const result = await studioFlow.schedule.moveEntry({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleEntryReorder = z.strictObject({ projectId: Id, section: ScheduleSection, prefix: z.string().min(1).max(12), orderedIds: z.array(Id).min(1).max(500) });
export async function reorderScheduleEntriesAction(input: z.infer<typeof ScheduleEntryReorder>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryReorder, input);
    const result = await studioFlow.schedule.reorderEntries({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleEntryRecategorize = z.strictObject({ projectId: Id, entryId: Id, category: z.string().min(1).max(80) });
export async function moveScheduleEntryToCategoryAction(input: z.infer<typeof ScheduleEntryRecategorize>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryRecategorize, input);
    const result = await studioFlow.schedule.moveEntryToCategory({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleReuseSearch = z.strictObject({ projectId: Id, query: z.string().max(120), section: ScheduleSection.optional() });
/** Read-only search of other projects' options (reuse pool). */
export async function searchReusableScheduleOptionsAction(input: z.infer<typeof ScheduleReuseSearch>) {
  return runSafeAction(async () => {
    const { grants } = await context();
    const data = parse(ScheduleReuseSearch, input);
    return studioFlow.schedule.searchReusableOptions({ grants, ...data, limit: 20 });
  });
}

const ScheduleReuseCopy = z.strictObject({ projectId: Id, entryId: Id, sourceOptionId: Id });
export async function copyReusableScheduleOptionAction(input: z.infer<typeof ScheduleReuseCopy>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleReuseCopy, input);
    const result = await studioFlow.schedule.copyReusableOption({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const ScheduleTemplateItemToggle = z.strictObject({ templateItemId: Id, isActive: z.boolean() });
export async function setScheduleTemplateItemActiveAction(input: z.infer<typeof ScheduleTemplateItemToggle>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.schedule.setTemplateItemActive({ ...ctx, ...parse(ScheduleTemplateItemToggle, input) });
    refresh();
    return result;
  });
}

export async function deleteScheduleTemplateItemAction(templateItemId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.schedule.deleteTemplateItem({ ...ctx, templateItemId: parse(Id, templateItemId) });
    refresh();
    return result;
  });
}

export async function deleteSchedulePrefixAction(prefixId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.schedule.deletePrefix({ ...ctx, prefixId: parse(Id, prefixId) });
    refresh();
    return result;
  });
}

// ── Phase templates (V2) ─────────────────────────────────────────────────────

const PhaseTemplateCreate = z.strictObject({ name: z.string().min(1).max(200), isDefault: z.boolean().optional() });
export async function createPhaseTemplateAction(input: z.infer<typeof PhaseTemplateCreate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.createPhaseTemplate({ ...ctx, ...parse(PhaseTemplateCreate, input) });
    refresh();
    return result;
  });
}

const PhaseTemplateUpdate = z.strictObject({ templateId: Id, name: z.string().min(1).max(200).optional(), isActive: z.boolean().optional(), isDefault: z.boolean().optional() });
export async function updatePhaseTemplateAction(input: z.infer<typeof PhaseTemplateUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.updatePhaseTemplate({ ...ctx, ...parse(PhaseTemplateUpdate, input) });
    refresh();
    return result;
  });
}

export async function deletePhaseTemplateAction(templateId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.deletePhaseTemplate({ ...ctx, templateId: parse(Id, templateId) });
    refresh();
    return result;
  });
}

const PhaseDefinitionCreate = z.strictObject({ templateId: Id, name: z.string().min(1).max(200), prefix: z.string().min(1).max(4), seat: z.enum(["designer", "drafter"]).optional(), allowParallel: z.boolean().optional() });
export async function createPhaseDefinitionAction(input: z.infer<typeof PhaseDefinitionCreate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.createPhaseDefinition({ ...ctx, ...parse(PhaseDefinitionCreate, input) });
    refresh();
    return result;
  });
}

const PhaseDefinitionUpdate = z.strictObject({ definitionId: Id, name: z.string().min(1).max(200).optional(), prefix: z.string().min(1).max(4).optional(), seat: z.enum(["designer", "drafter"]).optional(), allowParallel: z.boolean().optional() });
export async function updatePhaseDefinitionAction(input: z.infer<typeof PhaseDefinitionUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.updatePhaseDefinition({ ...ctx, ...parse(PhaseDefinitionUpdate, input) });
    refresh();
    return result;
  });
}

export async function deletePhaseDefinitionAction(definitionId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.deletePhaseDefinition({ ...ctx, definitionId: parse(Id, definitionId) });
    refresh();
    return result;
  });
}

const PhaseDefinitionReorder = z.strictObject({ templateId: Id, orderedIds: z.array(Id).min(1).max(100) });
export async function reorderPhaseDefinitionsAction(input: z.infer<typeof PhaseDefinitionReorder>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.phases.reorderPhaseDefinitions({ ...ctx, ...parse(PhaseDefinitionReorder, input) });
    refresh();
    return result;
  });
}

// ── Deliverables ──────────────────────────────────────────────────────────

const DeliverableRef = z.strictObject({ projectId: Id, deliverableId: Id });
export async function deleteDeliverableAction(input: z.infer<typeof DeliverableRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(DeliverableRef, input);
    const result = await studioFlow.phases.deleteDeliverable({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

const DeliverableFinal = z.strictObject({ projectId: Id, deliverableId: Id, isFinal: z.boolean() });
export async function setDeliverableFinalAction(input: z.infer<typeof DeliverableFinal>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(DeliverableFinal, input);
    const result = await studioFlow.phases.setDeliverableFinal({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

export async function extendDeliverableExpiryAction(input: z.infer<typeof DeliverableRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(DeliverableRef, input);
    const result = await studioFlow.phases.extendDeliverableExpiry({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

const DeliverableUploadMeta = z.strictObject({ projectId: Id, phaseId: Id, name: z.string().min(1).max(200) });
/** Multipart upload: `projectId`, `phaseId`, `name`, `file`. Size policy lives in the service. */
export async function uploadDeliverableAction(formData: FormData): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(DeliverableUploadMeta, { projectId: formData.get("projectId"), phaseId: formData.get("phaseId"), name: formData.get("name") });
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "DELIVERABLE_FILE_REQUIRED", "Choose a file.");
    const result = await studioFlow.phases.uploadDeliverable({ ...ctx, ...data, file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type } });
    refresh(data.projectId);
    return result;
  });
}

// ── Global search ─────────────────────────────────────────────────────────

const SearchQuery = z.string().trim().min(1).max(200);

export type GlobalSearchResult = {
  projects: Array<{ id: string; name: string; clientName: string | null }>;
  clients: Array<{ id: string; name: string }>;
};

/** Header quick-search: top project and client matches by name (client name also matches on projects). */
export async function globalSearchAction(query: string): Promise<ActionResult<GlobalSearchResult>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const q = parse(SearchQuery, query);
    return studioFlow.projects.quickSearch({ ...ctx, search: q });
  });
}

// ── Requirements (one general checklist per project) ────────────────────────

const RequirementOp = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("check"), projectId: Id, itemId: Id, checked: z.boolean() }),
  z.strictObject({ op: z.literal("rename"), projectId: Id, itemId: Id, label: z.string().min(1).max(200) }),
  z.strictObject({ op: z.literal("subtask"), projectId: Id, itemId: Id, label: z.string().min(1).max(200) }),
]);
export async function requirementAction(input: z.infer<typeof RequirementOp>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(RequirementOp, input);
    const tasks = studioFlow.tasks;
    let result: unknown;
    switch (data.op) {
      case "check": result = await tasks.setItemChecked({ ...ctx, projectId: data.projectId, itemId: data.itemId, checked: data.checked }); break;
      case "rename": result = await tasks.updateItem({ ...ctx, projectId: data.projectId, itemId: data.itemId, label: data.label }); break;
      case "subtask": result = await tasks.createSubtask({ ...ctx, projectId: data.projectId, parentId: data.itemId, label: data.label }); break;
    }
    refresh(data.projectId);
    return result;
  });
}
