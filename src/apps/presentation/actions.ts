"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { requireModuleEnabled } from "@platform/core/modules";
import { validationError } from "@platform/core/validation";
import { presentation } from "./runtime";
import { studioFlowPresentationBridge } from "@/apps/studioflow/public/presentation-bridge-runtime";

const Id = z.uuid();
const OptionalText = z.string().max(2000).nullish();

async function context() {
  const { principal, grants } = await requirePrincipalGrants();
  return { grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName } };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function refresh(projectId: string) { revalidatePath(`/studioflow/projects/${projectId}`, "layout"); }

const BoardInput = z.strictObject({ projectId: Id, boardId: Id.optional(), title: z.string().min(1).max(200) });
export async function createPresentationBoardAction(input: z.infer<typeof BoardInput>): Promise<ActionResult<{ boardId: string }>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(BoardInput, input); const result = await presentation.createBoard({ ...(await context()), projectId: data.projectId, title: data.title }); refresh(data.projectId); return result; });
}
export async function updatePresentationBoardAction(input: z.infer<typeof BoardInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(BoardInput, input); if (!data.boardId) throw new AppError("VALIDATION", "PRESENTATION_BOARD_REQUIRED", "Choose a presentation board."); const result = await presentation.updateBoard({ ...(await context()), projectId: data.projectId, boardId: data.boardId, title: data.title }); refresh(data.projectId); return result; });
}
const BoardRef = z.strictObject({ projectId: Id, boardId: Id });
export async function deletePresentationBoardAction(input: z.infer<typeof BoardRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(BoardRef, input); await presentation.deleteBoard({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
const SlidesOrder = z.strictObject({ projectId: Id, boardId: Id, orderedIds: z.array(Id).min(1).max(500) });
export async function reorderPresentationSlidesAction(input: z.infer<typeof SlidesOrder>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(SlidesOrder, input); await presentation.reorderSlides({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
export async function addPresentationSlidesAction(formData: FormData): Promise<ActionResult<{ slideIds: string[] }>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const projectId = parse(Id, formData.get("projectId")); const boardId = parse(Id, formData.get("boardId")); const files = formData.getAll("files").filter((value): value is File => value instanceof File); const result = await presentation.addSlides({ ...(await context()), projectId, boardId, files: await Promise.all(files.map(async (file) => ({ body: new Uint8Array(await file.arrayBuffer()), contentType: file.type }))) }); refresh(projectId); return result; });
}
const SlideRef = z.strictObject({ projectId: Id, slideId: Id });
export async function deletePresentationSlideAction(input: z.infer<typeof SlideRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(SlideRef, input); await presentation.deleteSlide({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
const WorkspaceImageRef = z.strictObject({ projectId: Id, phaseId: Id.nullable().optional(), imageId: Id });
/** "Add to moodboard" from a Workspace image, owned entirely by Presentation. */
export async function addWorkspaceImageToMoodboardAction(input: z.infer<typeof WorkspaceImageRef>): Promise<ActionResult<{ boardId: string; slideId: string; created: boolean }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("presentation");
    const ctx = await context();
    const data = parse(WorkspaceImageRef, input);
    const source = await studioFlowPresentationBridge.readWorkspaceImageSource({ ...ctx, ...data });
    const result = await presentation.addStoredImageToMoodboard({ ...ctx, projectId: data.projectId, source });
    refresh(data.projectId);
    return result;
  });
}
const AnnotationInput = z.strictObject({ projectId: Id, slideId: Id.optional(), annotationId: Id.optional(), pinX: z.number().min(0).max(100).optional(), pinY: z.number().min(0).max(100).optional(), scheduleEntryId: Id.nullish(), labelSide: z.enum(["auto", "left", "right"]).optional(), note: OptionalText });
export async function addPresentationAnnotationAction(input: z.infer<typeof AnnotationInput>): Promise<ActionResult<{ annotationId: string }>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(AnnotationInput, input); if (!data.slideId || data.pinX === undefined || data.pinY === undefined) throw new AppError("VALIDATION", "PRESENTATION_PIN_REQUIRED", "Choose a slide and pin position."); const result = await presentation.addAnnotation({ ...(await context()), projectId: data.projectId, slideId: data.slideId, pinX: data.pinX, pinY: data.pinY, scheduleEntryId: data.scheduleEntryId, labelSide: data.labelSide, note: data.note }); refresh(data.projectId); return result; });
}
export async function updatePresentationAnnotationAction(input: z.infer<typeof AnnotationInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(AnnotationInput, input); if (!data.annotationId) throw new AppError("VALIDATION", "PRESENTATION_PIN_REQUIRED", "Choose a pin."); await presentation.updateAnnotation({ ...(await context()), projectId: data.projectId, annotationId: data.annotationId, pinX: data.pinX, pinY: data.pinY, scheduleEntryId: data.scheduleEntryId, labelSide: data.labelSide, note: data.note }); refresh(data.projectId); return {}; });
}
const AnnotationRef = z.strictObject({ projectId: Id, annotationId: Id });
export async function deletePresentationAnnotationAction(input: z.infer<typeof AnnotationRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(AnnotationRef, input); await presentation.deleteAnnotation({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
