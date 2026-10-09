"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { requireModuleEnabled } from "@platform/core/modules";
import { validationError } from "@platform/core/validation";
import { studioFlow } from "@/apps/studioflow/runtime";

/**
 * Ideas board actions (WO-SF-IDEAS-01). Transport validation only: ownership, limits and the schedule rules
 * are decided by the StudioFlow services. Every card read and write is scoped to the signed-in user.
 */

const Id = z.uuid();
const Text = (max: number) => z.string().max(max).nullish();

async function context() {
  const { principal, grants } = await requirePrincipalGrants();
  return { grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName } };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function refresh(projectId?: string) {
  revalidatePath("/studioflow/ideas");
  if (projectId) revalidatePath(`/studioflow/projects/${projectId}`, "layout");
}

async function imageOf(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "IDEA_IMAGE_REQUIRED", "Choose an image.");
  return { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

function formText(formData: FormData, name: string): string | null | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export type IdeaCardView = Awaited<ReturnType<typeof studioFlow.ideas.listIdeaCards>>[number];

export async function listIdeaCardsAction(): Promise<ActionResult<IdeaCardView[]>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    return studioFlow.ideas.listIdeaCards(await context());
  });
}

export async function listIdeaTargetsAction(): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    return studioFlow.ideas.listIdeaTargets(await context());
  });
}

export async function listIdeaTargetEntriesAction(projectId: string): Promise<ActionResult<Awaited<ReturnType<typeof studioFlow.ideas.listIdeaTargetEntries>>>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    return studioFlow.ideas.listIdeaTargetEntries({ ...(await context()), projectId: parse(Id, projectId) });
  });
}

/** Categories the studio already knows per section, for the new-item category field. */
export async function listIdeaCategoryChoicesAction(): Promise<ActionResult<Array<{ section: string; category: string }>>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const { grants } = await context();
    return (await studioFlow.schedule.listCategoryChoices({ grants })).map(({ section, category }) => ({ section, category }));
  });
}

const CreateForm = z.strictObject({ title: Text(160), sourceUrl: Text(2000), note: Text(2000) });
/** FormData: `file` (required), optional `title`, `sourceUrl`, `note`. */
export async function createIdeaCardAction(formData: FormData): Promise<ActionResult<{ cardId: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const ctx = await context();
    const data = parse(CreateForm, { title: formText(formData, "title"), sourceUrl: formText(formData, "sourceUrl"), note: formText(formData, "note") });
    const result = await studioFlow.ideas.createIdeaCard({ ...ctx, ...data, file: await imageOf(formData) });
    refresh();
    return result;
  });
}

const ImageForm = z.strictObject({ cardId: Id });
export async function replaceIdeaImageAction(formData: FormData): Promise<ActionResult<{ cardId: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const ctx = await context();
    const data = parse(ImageForm, { cardId: formData.get("cardId") });
    const result = await studioFlow.ideas.replaceIdeaImage({ ...ctx, ...data, file: await imageOf(formData) });
    refresh();
    return result;
  });
}

const IdeaCommand = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("update"), cardId: Id, title: Text(160).optional(), sourceUrl: Text(2000).optional(), note: Text(2000).optional() }),
  z.strictObject({ command: z.literal("delete"), cardId: Id }),
]);
export type IdeaCommandInput = z.infer<typeof IdeaCommand>;

export async function ideaCardAction(input: IdeaCommandInput): Promise<ActionResult<{ cardId: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const ctx = await context();
    const data = parse(IdeaCommand, input);
    const result = data.command === "update"
      ? await studioFlow.ideas.updateIdeaCard({ ...ctx, cardId: data.cardId, title: data.title, sourceUrl: data.sourceUrl, note: data.note })
      : await studioFlow.ideas.deleteIdeaCard({ ...ctx, cardId: data.cardId });
    refresh();
    return result;
  });
}

const UseInput = z.strictObject({
  cardId: Id,
  projectId: Id,
  target: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("new-item"), section: z.string().max(20), category: z.string().max(120), qty: Text(20), unit: Text(40), location: Text(160) }),
    z.strictObject({ kind: z.literal("option"), entryId: Id }),
  ]),
  option: z.strictObject({ productName: z.string().max(200), brandName: Text(200), color: Text(200), pattern: Text(200), finishing: Text(200), dimension: Text(200), notes: Text(2000) }),
});
export type UseIdeaInput = z.infer<typeof UseInput>;

export async function applyIdeaToScheduleAction(input: UseIdeaInput): Promise<ActionResult<{ projectId: string; entryId: string; optionId: string; code: string; label: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const ctx = await context();
    const data = parse(UseInput, input);
    const result = await studioFlow.ideas.useIdeaInSchedule({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

const NoteImageRef = { projectId: Id, phaseId: Id, imageId: Id };

/** "Save to Ideas" on a phase-note image: a private copy on the signed-in user's own board. */
export async function saveNoteImageToIdeasAction(input: { projectId: string; phaseId: string; imageId: string }): Promise<ActionResult<{ cardId: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const ctx = await context();
    const data = parse(z.strictObject(NoteImageRef), input);
    const result = await studioFlow.ideas.saveNoteImageToIdeas({ ...ctx, ...data });
    revalidatePath("/studioflow/ideas");
    return result;
  });
}

const NoteUseInput = z.strictObject({ ...NoteImageRef, target: UseInput.shape.target, option: UseInput.shape.option });

/** "Use in schedule" straight from a phase-note image, in the note's own project. */
export async function applyNoteImageToScheduleAction(input: z.infer<typeof NoteUseInput>): Promise<ActionResult<{ projectId: string; entryId: string; optionId: string; code: string; label: string }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    const ctx = await context();
    const data = parse(NoteUseInput, input);
    const result = await studioFlow.ideas.useNoteImageInSchedule({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

/** "Add to moodboard" on a card: a copy becomes a slide of the project Moodboard board. */
export async function addIdeaToMoodboardAction(input: { cardId: string; projectId: string }): Promise<ActionResult<{ boardId: string; slideId: string; created: boolean }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    await requireModuleEnabled("presentation");
    const ctx = await context();
    const data = parse(z.strictObject({ cardId: Id, projectId: Id }), input);
    const result = await studioFlow.ideas.addIdeaToMoodboard({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}

/** "Add to moodboard" from a phase-note image, in the note own project. */
export async function addNoteImageToMoodboardAction(input: { projectId: string; phaseId: string; imageId: string }): Promise<ActionResult<{ boardId: string; slideId: string; created: boolean }>> {
  return runSafeAction(async () => {
    await requireModuleEnabled("ideas");
    await requireModuleEnabled("presentation");
    const ctx = await context();
    const data = parse(z.strictObject(NoteImageRef), input);
    const result = await studioFlow.ideas.addNoteImageToMoodboard({ ...ctx, ...data });
    refresh(data.projectId);
    return result;
  });
}
