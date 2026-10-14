"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { requireModuleEnabled } from "@platform/core/modules";
import { validationError } from "@platform/core/validation";
import { presentation } from "./runtime";
import { PRESENTATION_LAYOUTS } from "./layouts";
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

/** The width/height ratio the browser measured; anything else is left unknown (the image then shows whole). */
function ratioOf(value: FormDataEntryValue | null): number | null {
  const ratio = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(ratio) && ratio > 0.05 && ratio < 20 ? ratio : null;
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
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const projectId = parse(Id, formData.get("projectId")); const boardId = parse(Id, formData.get("boardId")); const files = formData.getAll("files").filter((value): value is File => value instanceof File); const ratios = formData.getAll("ratios"); const result = await presentation.addSlides({ ...(await context()), projectId, boardId, files: await Promise.all(files.map(async (file, index) => ({ body: new Uint8Array(await file.arrayBuffer()), contentType: file.type, imageRatio: ratioOf(ratios[index] ?? null) }))) }); refresh(projectId); return result; });
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
const NewSlide = z.strictObject({ projectId: Id, boardId: Id, layout: z.enum(PRESENTATION_LAYOUTS).optional() });
/** An empty slide in a chosen layout (owner 2026-10-14, slide layouts). */
export async function addPresentationSlideAction(input: z.infer<typeof NewSlide>): Promise<ActionResult<{ slideId: string }>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(NewSlide, input); const result = await presentation.addSlide({ ...(await context()), ...data }); refresh(data.projectId); return result; });
}
const SlideUpdate = z.strictObject({ projectId: Id, slideId: Id, layout: z.enum(PRESENTATION_LAYOUTS).optional(), title: z.string().max(200).nullish(), caption: z.string().max(1000).nullish() });
export async function updatePresentationSlideAction(input: z.infer<typeof SlideUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(SlideUpdate, input); await presentation.updateSlide({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
/** An image put in one box of a slide (form data: projectId, slideId, slot, file). */
export async function placePresentationImageAction(formData: FormData): Promise<ActionResult<{ imageId: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("presentation");
    const projectId = parse(Id, formData.get("projectId")); const slideId = parse(Id, formData.get("slideId")); const slot = parse(z.coerce.number().int().min(0).max(3), formData.get("slot"));
    const file = formData.get("file"); if (!(file instanceof File)) throw new AppError("VALIDATION", "PRESENTATION_IMAGES_REQUIRED", "Choose an image.");
    const result = await presentation.placeImage({ ...(await context()), projectId, slideId, slot, file: { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type, imageRatio: ratioOf(formData.get("imageRatio")) } });
    refresh(projectId); return result;
  });
}
const ImageMove = z.strictObject({ projectId: Id, imageId: Id, slot: z.number().int().min(0).max(3) });
export async function movePresentationImageAction(input: z.infer<typeof ImageMove>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(ImageMove, input); await presentation.moveImage({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
const ImageUpdate = z.strictObject({ projectId: Id, imageId: Id, fit: z.enum(["cover", "contain"]).optional(), focusX: z.number().min(0).max(100).optional(), focusY: z.number().min(0).max(100).optional() });
export async function updatePresentationImageAction(input: z.infer<typeof ImageUpdate>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(ImageUpdate, input); await presentation.updateImage({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
const ImageRef = z.strictObject({ projectId: Id, imageId: Id });
export async function removePresentationImageAction(input: z.infer<typeof ImageRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(ImageRef, input); await presentation.removeImage({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
const AnnotationInput = z.strictObject({ projectId: Id, imageId: Id.optional(), annotationId: Id.optional(), pinX: z.number().min(0).max(100).optional(), pinY: z.number().min(0).max(100).optional(), scheduleEntryId: Id.nullish(), labelSide: z.enum(["auto", "left", "right"]).optional(), note: OptionalText });
export async function addPresentationAnnotationAction(input: z.infer<typeof AnnotationInput>): Promise<ActionResult<{ annotationId: string }>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(AnnotationInput, input); if (!data.imageId || data.pinX === undefined || data.pinY === undefined) throw new AppError("VALIDATION", "PRESENTATION_PIN_REQUIRED", "Choose an image and pin position."); const result = await presentation.addAnnotation({ ...(await context()), projectId: data.projectId, imageId: data.imageId, pinX: data.pinX, pinY: data.pinY, scheduleEntryId: data.scheduleEntryId, labelSide: data.labelSide, note: data.note }); refresh(data.projectId); return result; });
}
export async function updatePresentationAnnotationAction(input: z.infer<typeof AnnotationInput>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(AnnotationInput, input); if (!data.annotationId) throw new AppError("VALIDATION", "PRESENTATION_PIN_REQUIRED", "Choose a pin."); await presentation.updateAnnotation({ ...(await context()), projectId: data.projectId, annotationId: data.annotationId, pinX: data.pinX, pinY: data.pinY, scheduleEntryId: data.scheduleEntryId, labelSide: data.labelSide, note: data.note }); refresh(data.projectId); return {}; });
}
const AnnotationRef = z.strictObject({ projectId: Id, annotationId: Id });
export async function deletePresentationAnnotationAction(input: z.infer<typeof AnnotationRef>): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => { await requireModuleEnabled("presentation"); const data = parse(AnnotationRef, input); await presentation.deleteAnnotation({ ...(await context()), ...data }); refresh(data.projectId); return {}; });
}
