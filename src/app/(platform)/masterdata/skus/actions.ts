"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { hasPermission } from "@platform/core/rbac";
import { masterDataService } from "@/apps/masterdata/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

const IdSchema = z.string().uuid();
const DeletionInputSchema = z.object({ id: IdSchema, reason: z.string().max(1000).optional(), notes: z.string().max(1000).optional() });

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function revalidateSkus(): void {
  revalidatePath("/masterdata/skus");
  revalidatePath("/masterdata/pricing");
  revalidatePath("/masterdata/brands");
  revalidatePath("/masterdata");
}

export async function updateSkuAction(
  _prev: ActionResult<{ skuId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ skuId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const categoryId = String(formData.get("categoryId") ?? "");

    const schema = z.object({
      skuId: z.string().uuid(),
      name: z.string().max(128).optional().nullable().or(z.literal("")),
      code: z.string().max(32).optional().nullable().or(z.literal("")),
      brandId: z.string().uuid().or(z.literal("")),
      baseUnitId: z.string().uuid("Base unit is required"),
      purchaseUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      dimensionLength: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionWidth: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionThickness: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      categoryId: z.string().uuid("Product category is required"),
      notes: z.string().max(1000).optional().nullable().or(z.literal("")),
    }).refine((value) => Boolean(value.name?.trim() || value.code?.trim()), { message: "SKU code or SKU name is required.", path: ["name"] });

    const parsed = schema.safeParse({
      skuId: String(formData.get("skuId") ?? ""),
      name: formData.get("name") ? String(formData.get("name")) : null,
      code: formData.get("code") ? String(formData.get("code")) : null,
      brandId: String(formData.get("brandId") ?? ""),
      baseUnitId: String(formData.get("baseUnitId") ?? ""),
      purchaseUnitId: formData.get("purchaseUnitId") ? String(formData.get("purchaseUnitId")) : null,
      dimensionLength: formData.get("dimensionLength") ? String(formData.get("dimensionLength")) : null,
      dimensionWidth: formData.get("dimensionWidth") ? String(formData.get("dimensionWidth")) : null,
      dimensionThickness: formData.get("dimensionThickness") ? String(formData.get("dimensionThickness")) : null,
      dimensionUnitId: formData.get("dimensionUnitId") ? String(formData.get("dimensionUnitId")) : null,
      categoryId,
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.updateSku({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      skuId: parsed.data.skuId,
      name: parsed.data.name,
      code: parsed.data.code || undefined,
      brandId: parsed.data.brandId,
      baseUnitId: parsed.data.baseUnitId,
      purchaseUnitId: parsed.data.purchaseUnitId,
      dimensionLength: parsed.data.dimensionLength,
      dimensionWidth: parsed.data.dimensionWidth,
      dimensionThickness: parsed.data.dimensionThickness,
      dimensionUnitId: parsed.data.dimensionUnitId,
      categoryId: parsed.data.categoryId,
      notes: parsed.data.notes,
    });
    revalidateSkus();
    return result;
  });
}

export async function archiveSkuAction(skuId: string): Promise<ActionResult<{ skuId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = parseId(skuId);
    const result = await masterDataService.archiveSku({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      skuId: id,
    });
    revalidateSkus();
    return result;
  });
}

export async function restoreSkuAction(skuId: string): Promise<ActionResult<{ skuId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = parseId(skuId);
    const result = await masterDataService.restoreSku({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      skuId: id,
    });
    revalidateSkus();
    return result;
  });
}

export async function requestSkuDeletionAction(
  skuId: string,
  reason?: string,
  notes?: string,
): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = DeletionInputSchema.safeParse({ id: skuId, reason, notes });
    if (!parsed.success) throw validationError(parsed.error);
    const actor = { kind: "USER" as const, userId: principal.userId, label: principal.displayName };
    const result = hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove)
      ? await masterDataService.hardDeleteArchived({ grants, actor, targetType: "sku", targetId: parsed.data.id })
      : await masterDataService.requestSkuDeletion({ grants, actor, skuId: parsed.data.id, reason: parsed.data.reason, notes: parsed.data.notes });
    revalidateSkus();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
