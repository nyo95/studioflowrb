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
const PhaseKey = z.enum(["MOODBOARD", "LAYOUT", "DESIGN_3D", "CD", "SUPERVISION"]);

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

export async function setAutoNamingAction(enabled: boolean): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.projects.setAutoNaming({ ...ctx, enabled: parse(z.boolean(), enabled) });
    refresh();
    return result;
  });
}

const TemplateInput = z.strictObject({ phaseKey: PhaseKey.nullable(), label: z.string().min(1).max(200) });
export async function createTemplateAction(input: z.infer<typeof TemplateInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.createTemplate({ ...ctx, ...parse(TemplateInput, input) });
    refresh();
    return result;
  });
}

const TemplateUpdate = z.strictObject({ templateId: Id, label: z.string().min(1).max(200).optional(), isActive: z.boolean().optional() });
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

const TemplateReorder = z.strictObject({ phaseKey: PhaseKey.nullable(), orderedIds: z.array(Id).min(1).max(500) });
export async function reorderTemplatesAction(input: z.infer<typeof TemplateReorder>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.reorderTemplates({ ...ctx, ...parse(TemplateReorder, input) });
    refresh();
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
  projectType: z.string().max(60).nullish(),
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
    const result = await studioFlow.projects.updateProject({ ...ctx, ...data, openingDate: data.openingDate || null });
    refresh(data.projectId);
    return result;
  });
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

export async function setProjectStatusAction(projectId: string, status: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const id = parse(Id, projectId);
    const result = await studioFlow.projects.setProjectStatus({ ...ctx, projectId: id, status: parse(z.enum(["ACTIVE", "ON_HOLD", "COMPLETED"]), status) });
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
  z.strictObject({ command: z.literal("activate"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("bypass"), projectId: Id, phaseId: Id, reason: Reason }),
  z.strictObject({ command: z.literal("submitInternal"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("approveInternal"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("rejectInternal"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("submitClient"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("approveClient"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("rejectClient"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("reopen"), projectId: Id, phaseId: Id, reason: Reason, intent: z.enum(["INTERNAL", "CLIENT"]) }),
  z.strictObject({ command: z.literal("completeSupervision"), projectId: Id, phaseId: Id }),
  z.strictObject({ command: z.literal("override"), projectId: Id, phaseId: Id, mode: z.enum(["HARD_RESET_ACTIVE", "HARD_RESET_PENDING"]), major: z.number().int().optional(), minor: z.number().int().optional(), note: z.string().max(1000) }),
]);

export async function phaseCommandAction(input: z.infer<typeof PhaseCommand>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(PhaseCommand, input);
    const base = { ...ctx, projectId: data.projectId, phaseId: data.phaseId };
    const phases = studioFlow.phases;
    let result: unknown;
    switch (data.command) {
      case "activate": result = await phases.activatePhase(base); break;
      case "bypass": result = await phases.bypassPhase({ ...base, reason: data.reason }); break;
      case "submitInternal": result = await phases.submitForInternalReview(base); break;
      case "approveInternal": result = await phases.approveInternal(base); break;
      case "rejectInternal": result = await phases.rejectPhase({ ...base, type: "INTERNAL" }); break;
      case "submitClient": result = await phases.submitForClientReview(base); break;
      case "approveClient": result = await phases.approveClient(base); break;
      case "rejectClient": result = await phases.rejectPhase({ ...base, type: "CLIENT" }); break;
      case "reopen": result = await phases.reopenPhase({ ...base, intent: data.intent, reason: data.reason }); break;
      case "completeSupervision": result = await phases.completeSupervision(base); break;
      case "override": result = await phases.overrideRevision({ ...base, mode: data.mode, major: data.major, minor: data.minor, note: data.note }); break;
    }
    refresh(data.projectId);
    return result;
  });
}

// ── Activities ──────────────────────────────────────────────────────────────

const ActivityAdd = z.strictObject({ projectId: Id, phaseId: Id.nullable(), content: z.string().min(1).max(2000), mode: z.enum(["TODO", "FEEDBACK"]), dueDate: DateOnly, assignedToId: Id.nullish() });
export async function addActivityAction(input: z.infer<typeof ActivityAdd>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ActivityAdd, input);
    const result = await studioFlow.phases.addActivity({ ...ctx, ...data, dueDate: data.dueDate || null });
    refresh(data.projectId);
    return result;
  });
}

const ActivityOp = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("done"), projectId: Id, activityId: Id, done: z.boolean() }),
  z.strictObject({ op: z.literal("update"), projectId: Id, activityId: Id, content: z.string().max(2000).optional(), dueDate: DateOnly.optional(), assignedToId: Id.nullish() }),
  z.strictObject({ op: z.literal("delete"), projectId: Id, activityId: Id }),
  z.strictObject({ op: z.literal("defer"), projectId: Id, activityId: Id }),
]);
export async function activityAction(input: z.infer<typeof ActivityOp>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ActivityOp, input);
    const base = { ...ctx, projectId: data.projectId, activityId: data.activityId };
    let result: unknown;
    if (data.op === "done") result = await studioFlow.phases.setActivityDone({ ...base, done: data.done });
    if (data.op === "update") result = await studioFlow.phases.updateActivity({ ...base, content: data.content, dueDate: data.dueDate === "" ? null : data.dueDate, assignedToId: data.assignedToId });
    if (data.op === "delete") result = await studioFlow.phases.deleteActivity(base);
    if (data.op === "defer") result = await studioFlow.phases.deferActivity(base);
    refresh(data.projectId);
    return result;
  });
}

// ── Checklist ───────────────────────────────────────────────────────────────

const ChecklistOp = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("check"), projectId: Id, itemId: Id, checked: z.boolean() }),
  z.strictObject({ op: z.literal("subtask"), projectId: Id, itemId: Id, label: z.string().min(1).max(200) }),
  z.strictObject({ op: z.literal("update"), projectId: Id, itemId: Id, label: z.string().max(200).optional(), priority: z.number().int().optional(), dueDate: DateOnly.optional(), assignedToId: Id.nullish() }),
  z.strictObject({ op: z.literal("delete"), projectId: Id, itemId: Id }),
  z.strictObject({ op: z.literal("detach"), projectId: Id, itemId: Id }),
  z.strictObject({ op: z.literal("label"), projectId: Id, itemId: Id, name: z.string().min(1).max(40) }),
  z.strictObject({ op: z.literal("unlabel"), projectId: Id, itemId: Id, labelId: Id }),
  z.strictObject({ op: z.literal("reorder"), projectId: Id, itemId: Id, orderedIds: z.array(Id).min(1).max(500) }),
]);
export async function checklistAction(input: z.infer<typeof ChecklistOp>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ChecklistOp, input);
    const base = { ...ctx, projectId: data.projectId, itemId: data.itemId };
    const tasks = studioFlow.tasks;
    let result: unknown;
    switch (data.op) {
      case "check": result = await tasks.setItemChecked({ ...base, checked: data.checked }); break;
      case "subtask": result = await tasks.createSubtask({ ...ctx, projectId: data.projectId, parentId: data.itemId, label: data.label }); break;
      case "update": result = await tasks.updateItem({ ...base, label: data.label, priority: data.priority, dueDate: data.dueDate === "" ? null : data.dueDate, assignedToId: data.assignedToId }); break;
      case "delete": result = await tasks.deleteItem(base); break;
      case "detach": result = await tasks.detachFromTemplate(base); break;
      case "label": result = await tasks.attachLabel({ ...base, name: data.name }); break;
      case "unlabel": result = await tasks.detachLabel({ ...base, labelId: data.labelId }); break;
      case "reorder": result = await tasks.reorderItems({ ...ctx, projectId: data.projectId, orderedIds: data.orderedIds }); break;
    }
    refresh(data.projectId);
    return result;
  });
}

const FilterSave = z.strictObject({
  name: z.string().min(1).max(60),
  query: z.strictObject({ status: z.enum(["OPEN", "COMPLETED"]), priority: z.enum(["P1"]).nullable(), assignee: z.enum(["ME"]).nullable(), due: z.enum(["TODAY_OR_EARLIER", "OVERDUE"]).nullable() }),
});
export async function saveFilterViewAction(input: z.infer<typeof FilterSave>): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.saveFilterView({ ...ctx, ...parse(FilterSave, input) });
    refresh();
    return result;
  });
}

export async function deleteFilterViewAction(filterId: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.tasks.deleteFilterView({ ...ctx, filterId: parse(Id, filterId) });
    refresh();
    return result;
  });
}

// ── MOM (SF-R2) ─────────────────────────────────────────────────────────────

function refreshMom(projectId: string) {
  revalidatePath(`/studioflow/projects/${projectId}`, "layout");
  revalidatePath(`/studioflow/print/projects/${projectId}`, "layout");
}

export async function createMomDocumentAction(projectId: string): Promise<ActionResult<{ documentId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = await studioFlow.mom.createDocument({ ...ctx, projectId: parse(Id, projectId) });
    refreshMom(projectId);
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

const MomListStyle = z.enum(["DECIMAL", "DISC", "DASH", "NONE"]);
const MomItemUpdate = z.strictObject({ projectId: Id, itemId: Id, isTextOnly: z.boolean(), listStyle: MomListStyle });
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

const MomPointAdd = z.strictObject({ projectId: Id, itemId: Id, text: z.string().max(5000).optional() });
export async function addMomPointAction(input: z.infer<typeof MomPointAdd>): Promise<ActionResult<{ pointId: string }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomPointAdd, input);
    const result = await studioFlow.mom.addPoint({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomPointUpdate = z.strictObject({ projectId: Id, pointId: Id, text: z.string().max(5000), style: z.enum(["DEFAULT", "PLAIN"]) });
export async function updateMomPointAction(input: z.infer<typeof MomPointUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomPointUpdate, input);
    const result = await studioFlow.mom.updatePoint({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomPointRef = z.strictObject({ projectId: Id, pointId: Id });
export async function deleteMomPointAction(input: z.infer<typeof MomPointRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomPointRef, input);
    const result = await studioFlow.mom.deletePoint({ ...ctx, ...data });
    refreshMom(data.projectId);
    return result;
  });
}

const MomPointMove = z.strictObject({ projectId: Id, pointId: Id, direction: Direction });
export async function moveMomPointAction(input: z.infer<typeof MomPointMove>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(MomPointMove, input);
    const result = await studioFlow.mom.movePoint({ ...ctx, ...data });
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

const ScheduleSection = z.enum(["MATERIAL", "FIXTURE"]);
const ScheduleSnapshot = z.strictObject({
  brandId: Id.nullish(),
  brandName: z.string().max(160).nullish(),
  productName: z.string().max(200),
  skuText: z.string().max(160).nullish(),
  color: z.string().max(160).nullish(),
  finishing: z.string().max(160).nullish(),
  dimension: z.string().max(160).nullish(),
  notes: z.string().max(2000).nullish(),
  imageKey: z.string().max(500).nullish(),
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

const ScheduleEntryUpdate = z.strictObject({ projectId: Id, entryId: Id, qty: z.string().max(20).nullish(), unit: z.string().max(40).nullish(), location: z.string().max(160).nullish() });
export async function updateScheduleEntryAction(input: z.infer<typeof ScheduleEntryUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleEntryUpdate, input);
    const result = await studioFlow.schedule.updateEntry({ ...ctx, ...data });
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

export async function deleteScheduleOptionAction(input: z.infer<typeof ScheduleOptionRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleOptionRef, input);
    const result = await studioFlow.schedule.deleteOption({ ...ctx, ...data });
    refreshSchedule(data.projectId);
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

const ScheduleCsvImport = z.strictObject({ projectId: Id, section: ScheduleSection, csv: z.string().max(200000) });
export async function importScheduleCsvAction(input: z.infer<typeof ScheduleCsvImport>): Promise<ActionResult<{ created: number }>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const data = parse(ScheduleCsvImport, input);
    const result = await studioFlow.schedule.importCsv({ ...ctx, ...data });
    refreshSchedule(data.projectId);
    return result;
  });
}

const SchedulePrefixInput = z.strictObject({ section: ScheduleSection, category: z.string().min(1).max(80), prefix: z.string().min(1).max(8) });
export async function upsertSchedulePrefixAction(input: z.infer<typeof SchedulePrefixInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    return studioFlow.schedule.upsertPrefix({ ...ctx, ...parse(SchedulePrefixInput, input) });
  });
}

const ScheduleTemplateCategoryInput = z.strictObject({ section: ScheduleSection, category: z.string().min(1).max(80), isDefaultEntry: z.boolean().optional(), isActive: z.boolean().optional() });
export async function upsertScheduleTemplateCategoryAction(input: z.infer<typeof ScheduleTemplateCategoryInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    return studioFlow.schedule.upsertTemplateCategory({ ...ctx, ...parse(ScheduleTemplateCategoryInput, input) });
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
    return studioFlow.schedule.createTemplateItem({ ...ctx, ...parse(ScheduleTemplateItemInput, input) });
  });
}
