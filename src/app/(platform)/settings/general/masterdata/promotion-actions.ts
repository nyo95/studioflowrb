"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { bqService } from "@/apps/bq/runtime";
import { masterDataService } from "@/apps/masterdata/runtime";

const PromotionSchema = z.object({
  type: z.enum(["material", "labor", "material_labor"]),
  libItemId: z.string().uuid(),
});

function refresh(): void {
  revalidatePath("/settings/general/masterdata");
  revalidatePath("/bq/library");
  revalidatePath("/masterdata");
}

export async function approveBqPromotionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = PromotionSchema.extend({ masterdataRefId: z.string().trim().uuid() })
      .safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);

    const reference = await masterDataService.validatePromotionReference({
      grants,
      type: parsed.data.type,
      referenceId: parsed.data.masterdataRefId,
    });
    await bqService.approvePromotion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      type: parsed.data.type,
      libItemId: parsed.data.libItemId,
      masterdataRefId: reference.referenceId,
    });
    refresh();
    return { id: parsed.data.libItemId };
  });
}

export async function rejectBqPromotionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = PromotionSchema.extend({ reason: z.string().trim().min(1).max(500) })
      .safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw validationError(parsed.error);
    await bqService.rejectPromotion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      type: parsed.data.type,
      libItemId: parsed.data.libItemId,
      reason: parsed.data.reason,
    });
    refresh();
    return { id: parsed.data.libItemId };
  });
}
