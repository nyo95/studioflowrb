"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey, validateMomImage } from "@platform/core/storage";
import { objectStorage } from "@platform/runtime";
import { studioFlowService } from "@/apps/studioflow/runtime";

const actorFrom = (principal: { userId: string; displayName: string }) => ({ kind: "USER" as const, userId: principal.userId, label: principal.displayName });

const MomMetadataSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required").max(255),
  meeting_at: z.coerce.date(),
  prepared_by_name: z.string().trim().min(1, "Preparer is required").max(255),
  venue: z.string().trim().max(255).nullable(),
  attendees_text: z.string().trim().max(4000).nullable(),
});

const MomContentSchema = z.object({
  items: z.array(z.object({
    sort_order: z.number().int().min(0),
    is_text_only: z.boolean(),
    list_style: z.enum(["NONE", "BULLET", "NUMBERED"]),
    points: z.array(z.object({ sort_order: z.number().int().min(0), text: z.string().trim().min(1).max(10000), style: z.enum(["TEXT", "BULLET", "NUMBERED"]) })).min(1),
    images: z.array(z.object({ sort_order: z.number().int().min(0), storage_key: z.string().min(1).max(500), alt_text: z.string().trim().max(500).nullable().optional() })).max(2),
  })).min(1),
});

function metadataFrom(formData: FormData) {
  return MomMetadataSchema.parse({
    topic: String(formData.get("topic") ?? ""), meeting_at: String(formData.get("meeting_at") ?? ""),
    prepared_by_name: String(formData.get("prepared_by_name") ?? ""),
    venue: String(formData.get("venue") ?? "").trim() || null,
    attendees_text: String(formData.get("attendees_text") ?? "").trim() || null,
  });
}

export async function createMomAction(projectId: string, _prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.createMomDraft(grants, actorFrom(principal), { project_id: projectId, ...metadataFrom(formData) });
    revalidatePath(`/studioflow/${projectId}`);
  }, { context: "studioflow.mom.create" });
}

export async function updateMomAction(projectId: string, momId: string, _prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.updateMomDraft(grants, actorFrom(principal), projectId, momId, metadataFrom(formData));
    revalidatePath(`/studioflow/${projectId}`); revalidatePath(`/studioflow/${projectId}/mom/${momId}`);
  }, { context: "studioflow.mom.update" });
}

export async function issueMomAction(projectId: string, momId: string, _prev: ActionResult<void> | null, _formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.issueMom(grants, actorFrom(principal), projectId, momId);
    revalidatePath(`/studioflow/${projectId}`); revalidatePath(`/studioflow/${projectId}/mom/${momId}`);
  }, { context: "studioflow.mom.issue" });
}

export async function discardMomAction(projectId: string, momId: string, _prev: ActionResult<void> | null, _formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const mom = await studioFlowService.getMom(grants, projectId, momId);
    await studioFlowService.discardMomDraft(grants, actorFrom(principal), projectId, momId);
    await Promise.allSettled(mom.items.flatMap((item) => item.images.map((image) => objectStorage.remove(image.storage_key))));
    revalidatePath(`/studioflow/${projectId}`);
  }, { context: "studioflow.mom.discard" });
}

export async function updateMomContentAction(projectId: string, momId: string, _prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    let decoded: unknown;
    try { decoded = JSON.parse(String(formData.get("content") ?? "{}")); }
    catch { throw new AppError("VALIDATION", "studioflow.mom.content-json", "MOM content is invalid"); }
    const content = MomContentSchema.parse(decoded);
    const previous = await studioFlowService.getMom(grants, projectId, momId);
    await studioFlowService.updateMomContent(grants, actorFrom(principal), projectId, momId, content);
    const retained = new Set(content.items.flatMap((item) => item.images.map((image) => image.storage_key)));
    const removed = previous.items.flatMap((item) => item.images.map((image) => image.storage_key)).filter((key) => !retained.has(key));
    await Promise.allSettled(removed.map((key) => objectStorage.remove(key)));
    revalidatePath(`/studioflow/${projectId}`); revalidatePath(`/studioflow/${projectId}/mom/${momId}`);
  }, { context: "studioflow.mom.content.update" });
}

export async function uploadMomImageAction(projectId: string, momId: string, file: File): Promise<ActionResult<{ storageKey: string; readUrl: string }>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    await studioFlowService.assertMomDraftEditable(grants, projectId, momId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateMomImage({ bytes, contentType: file.type });
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const key = createPrivateObjectKey(`studioflow/mom/${projectId}/${momId}`, extension);
    await objectStorage.put({ key, body: bytes, bytes: bytes.length, contentType: file.type });
    try { return { storageKey: key, readUrl: await objectStorage.createSignedReadUrl(key, 600) }; }
    catch (error) { await objectStorage.remove(key).catch(() => undefined); throw error; }
  }, { context: "studioflow.mom.image.upload" });
}

export async function supersedeMomAction(projectId: string, momId: string, _prev: ActionResult<void> | null, formData: FormData): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    await studioFlowService.supersedeMom(grants, actorFrom(principal), projectId, momId, { project_id: projectId, ...metadataFrom(formData) });
    revalidatePath(`/studioflow/${projectId}`); revalidatePath(`/studioflow/${projectId}/mom/${momId}`);
  }, { context: "studioflow.mom.supersede" });
}
