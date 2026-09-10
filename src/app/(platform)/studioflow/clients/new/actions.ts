"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction } from "@platform/core/actions";
import type { ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { studioFlowService } from "@/apps/studioflow/runtime";

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(200),
  contact_name: z.string().trim().max(200).optional(),
  contact_phone: z.string().trim().max(50).optional(),
  contact_email: z.string().trim().email("Format email tidak valid").max(200).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function parseClient(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? ""),
    contact_name: String(formData.get("contact_name") ?? "") || undefined,
    contact_phone: String(formData.get("contact_phone") ?? "") || undefined,
    contact_email: String(formData.get("contact_email") ?? "") || undefined,
    address: String(formData.get("address") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  };
  const parsed = ClientSchema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function createClientAction(
  _prev: ActionResult<never> | null,
  formData: FormData,
): Promise<ActionResult<never>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const input = parseClient(formData);
    const client = await studioFlowService.createClient(
      grants,
      { kind: "USER", userId: principal.userId, label: principal.displayName },
      {
        name: input.name,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        contact_email: input.contact_email || undefined,
        address: input.address,
        notes: input.notes,
      },
    );
    revalidatePath("/studioflow/clients");
    redirect(`/studioflow/clients/${client.id}`);
  });
}
