"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { studioFlowService } from "@/apps/studioflow/runtime";

const EditClientSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Client name is required").max(200),
  contact_name: z.string().trim().max(200).optional(),
  contact_phone: z.string().trim().max(50).optional(),
  contact_email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Format email tidak valid"),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function editClientAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = EditClientSchema.safeParse({
      id: String(formData.get("id") ?? ""),
      name: String(formData.get("name") ?? ""),
      contact_name: String(formData.get("contact_name") ?? "") || undefined,
      contact_phone: String(formData.get("contact_phone") ?? "") || undefined,
      contact_email: String(formData.get("contact_email") ?? "") || undefined,
      address: String(formData.get("address") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
    });
    if (!parsed.success) throw validationError(parsed.error);
    const { id, ...input } = parsed.data;
    await studioFlowService.editClient(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      id,
      {
        name: input.name,
        contact_name: input.contact_name ?? null,
        contact_phone: input.contact_phone ?? null,
        contact_email: input.contact_email || null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
    );
    revalidatePath(`/studioflow/clients/${id}`);
    revalidatePath("/studioflow/clients");
  });
}

export async function archiveClientAction(
  _prev: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = String(formData.get("id") ?? "");
    await studioFlowService.archiveClient(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      id,
    );
    revalidatePath("/studioflow/clients");
  });
}
