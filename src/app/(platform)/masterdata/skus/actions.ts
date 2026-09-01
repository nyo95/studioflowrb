"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { masterDataService } from "@/apps/masterdata/runtime";

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

export async function createSkuAction(
  _prev: ActionResult<{ skuId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ skuId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();

    const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
    const supplierVendorId = String(formData.get("supplierVendorId") ?? "");
    const amount = String(formData.get("amount") ?? "");
    const currency = String(formData.get("currency") ?? "IDR").toUpperCase();

    const schema = z.object({
      name: z.string().min(1, "SKU name is required").max(128),
      code: z.string().max(32).optional().nullable().or(z.literal("")),
      brandId: z.string().uuid().optional().nullable().or(z.literal("")),
      baseUnitId: z.string().uuid("Base unit is required"),
      purchaseUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      dimensionLength: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionWidth: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionThickness: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      categoryIds: z.array(z.string().uuid()).min(1, "At least one category is required"),
      supplierVendorId: z.string().uuid("Supplier vendor is required"),
      amount: z.string().min(1, "Amount is required"),
      currency: z.string().length(3, "3-letter currency code"),
      notes: z.string().max(1000).optional().nullable().or(z.literal("")),
    });

    const parsed = schema.safeParse({
      name: String(formData.get("name") ?? ""),
      code: formData.get("code") ? String(formData.get("code")) : null,
      brandId: formData.get("brandId") ? String(formData.get("brandId")) : null,
      baseUnitId: String(formData.get("baseUnitId") ?? ""),
      purchaseUnitId: formData.get("purchaseUnitId") ? String(formData.get("purchaseUnitId")) : null,
      dimensionLength: formData.get("dimensionLength") ? String(formData.get("dimensionLength")) : null,
      dimensionWidth: formData.get("dimensionWidth") ? String(formData.get("dimensionWidth")) : null,
      dimensionThickness: formData.get("dimensionThickness") ? String(formData.get("dimensionThickness")) : null,
      dimensionUnitId: formData.get("dimensionUnitId") ? String(formData.get("dimensionUnitId")) : null,
      categoryIds,
      supplierVendorId,
      amount,
      currency,
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.createSku({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      name: parsed.data.name,
      code: parsed.data.code || undefined,
      brandId: parsed.data.brandId || undefined,
      baseUnitId: parsed.data.baseUnitId,
      purchaseUnitId: parsed.data.purchaseUnitId || undefined,
      dimensionLength: parsed.data.dimensionLength || undefined,
      dimensionWidth: parsed.data.dimensionWidth || undefined,
      dimensionThickness: parsed.data.dimensionThickness || undefined,
      dimensionUnitId: parsed.data.dimensionUnitId || undefined,
      categoryIds: parsed.data.categoryIds,
      priceMaterials: [
        {
          supplierVendorId: parsed.data.supplierVendorId,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          notes: parsed.data.notes || undefined,
        },
      ],
      notes: parsed.data.notes || undefined,
    });
    revalidateSkus();
    return result;
  });
}

export async function updateSkuAction(
  _prev: ActionResult<{ skuId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ skuId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);

    const schema = z.object({
      skuId: z.string().uuid(),
      name: z.string().min(1, "SKU name is required").max(128),
      code: z.string().max(32).optional().nullable().or(z.literal("")),
      brandId: z.string().uuid().optional().nullable().or(z.literal("")),
      baseUnitId: z.string().uuid("Base unit is required"),
      purchaseUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      dimensionLength: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionWidth: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionThickness: z.string().max(32).optional().nullable().or(z.literal("")),
      dimensionUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      categoryIds: z.array(z.string().uuid()).min(1, "At least one category is required"),
      notes: z.string().max(1000).optional().nullable().or(z.literal("")),
    });

    const parsed = schema.safeParse({
      skuId: String(formData.get("skuId") ?? ""),
      name: String(formData.get("name") ?? ""),
      code: formData.get("code") ? String(formData.get("code")) : null,
      brandId: formData.get("brandId") ? String(formData.get("brandId")) : null,
      baseUnitId: String(formData.get("baseUnitId") ?? ""),
      purchaseUnitId: formData.get("purchaseUnitId") ? String(formData.get("purchaseUnitId")) : null,
      dimensionLength: formData.get("dimensionLength") ? String(formData.get("dimensionLength")) : null,
      dimensionWidth: formData.get("dimensionWidth") ? String(formData.get("dimensionWidth")) : null,
      dimensionThickness: formData.get("dimensionThickness") ? String(formData.get("dimensionThickness")) : null,
      dimensionUnitId: formData.get("dimensionUnitId") ? String(formData.get("dimensionUnitId")) : null,
      categoryIds,
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
      categoryIds: parsed.data.categoryIds,
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
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = DeletionInputSchema.safeParse({ id: skuId, reason, notes });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.requestSkuDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      skuId: parsed.data.id,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });
    revalidateSkus();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
