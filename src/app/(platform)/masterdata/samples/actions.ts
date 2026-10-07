"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { sampleRequestCoordinator } from "@/app/sample-request-runtime";
import { masterDataService } from "@/apps/masterdata/runtime";

const Create = z.object({ skuId: z.string().uuid(), rack: z.string().max(40), box: z.string().max(40), quantity: z.coerce.number().int().min(1).max(999), locationNote: z.string().max(200).optional(), notes: z.string().max(1000).optional() });
const Location = Create.omit({ skuId: true }).extend({ sampleId: z.string().uuid() });
const Status = z.object({ sampleId: z.string().uuid(), status: z.enum(["AVAILABLE", "BORROWED", "SENT_TO_CLIENT", "LOST", "DISCARDED"]), holderName: z.string().max(120).optional(), holderProjectId: z.string().max(120).optional(), note: z.string().max(1000).optional() });
const actor = (p: { userId: string; displayName: string }) => ({ kind: "USER" as const, userId: p.userId, label: p.displayName });
const refresh = () => revalidatePath("/masterdata/samples");
export async function createSampleAction(input: unknown): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const c = await requirePrincipalGrants(); const x = Create.safeParse(input); if (!x.success) throw validationError(x.error); const result = await masterDataService.createSample({ grants: c.grants, actor: actor(c.principal), ...x.data }); refresh(); return result; }); }
export async function updateSampleLocationAction(input: unknown): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const c = await requirePrincipalGrants(); const x = Location.safeParse(input); if (!x.success) throw validationError(x.error); const result = await masterDataService.updateSampleLocation({ grants: c.grants, actor: actor(c.principal), ...x.data }); refresh(); return result; }); }
export async function setSampleStatusAction(input: unknown): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const c = await requirePrincipalGrants(); const x = Status.safeParse(input); if (!x.success) throw validationError(x.error); const result = await sampleRequestCoordinator.setSampleStatus({ grants: c.grants, actor: actor(c.principal), ...x.data }); refresh(); return result; }); }
/** One sample's movements, newest first, loaded when its history is opened. */
export async function getSampleHistoryAction(sampleId: string) {
  return runSafeAction(async () => {
    const c = await requirePrincipalGrants();
    const x = z.string().uuid().safeParse(sampleId);
    if (!x.success) throw validationError(x.error);
    const rows = await masterDataService.getSampleHistory({ grants: c.grants, sampleId: x.data });
    return rows.map((row) => ({ id: row.id, kind: row.kind, statusAfter: row.status_after, holderName: row.holder_name, holderProjectName: row.holder_project_name, fromRack: row.from_rack, fromBox: row.from_box, toRack: row.to_rack, toBox: row.to_box, note: row.note, actorLabel: row.actor_label, createdAt: row.created_at }));
  });
}
export async function deleteSampleAction(sampleId: string): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const c = await requirePrincipalGrants(); const x = z.string().uuid().safeParse(sampleId); if (!x.success) throw validationError(x.error); const result = await masterDataService.deleteSample({ grants: c.grants, actor: actor(c.principal), sampleId: x.data }); refresh(); return result; }); }
