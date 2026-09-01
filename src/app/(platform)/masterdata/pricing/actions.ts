"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { masterDataService } from "@/apps/masterdata/runtime";
import { validationError } from "@platform/core/validation";

type PriceKind = "material" | "material-labor" | "labor";
const mutationInput = z.object({ kind: z.enum(["material", "material-labor", "labor"]), id: z.string().uuid() });
const deletionInput = mutationInput.extend({ reason: z.string().max(1000).optional() });

function parseMutationInput(kind: PriceKind, id: string): { kind: PriceKind; id: string } {
  const parsed = mutationInput.safeParse({ kind, id });
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

function refreshPricing(): void {
  revalidatePath("/masterdata/pricing");
  revalidatePath("/masterdata/skus");

}

async function context() {
  const { principal, grants } = await requirePrincipalGrants();
  return { grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName } };
}

const priceForm = z.object({
  id: z.string().uuid().optional(), name: z.string().min(1).max(128).optional(), skuId: z.string().uuid().optional(), vendorId: z.string().uuid().optional(), categoryId: z.string().uuid().optional(), unitId: z.string().uuid().optional(), amount: z.string().min(1), currency: z.string().length(3), scopeNote: z.string().max(1000).optional(), notes: z.string().max(1000).optional(),
});

const pricingVendorQuickForm = z.object({
  name: z.string().min(1).max(128),
  vendorTypeId: z.string().uuid(),
});

const pricingCategoryQuickForm = z.object({
  name: z.string().min(1).max(64),
});

export async function createMaterialSkuAction(formData: FormData): Promise<ActionResult<{ skuId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
    const schema = z.object({
      name: z.string().min(1).max(128),
      code: z.string().max(32).optional().nullable().or(z.literal("")),
      brandId: z.string().uuid().optional().nullable().or(z.literal("")),
      baseUnitId: z.string().uuid(),
      purchaseUnitId: z.string().uuid().optional().nullable().or(z.literal("")),
      categoryIds: z.array(z.string().uuid()).min(1),
      supplierVendorId: z.string().uuid(),
      amount: z.string().min(1),
      currency: z.string().length(3),
      notes: z.string().max(1000).optional().nullable().or(z.literal("")),
    });
    const parsed = schema.safeParse({
      name: String(formData.get("name") ?? ""),
      code: formData.get("code") ? String(formData.get("code")) : null,
      brandId: formData.get("brandId") ? String(formData.get("brandId")) : null,
      baseUnitId: String(formData.get("baseUnitId") ?? ""),
      purchaseUnitId: formData.get("purchaseUnitId") ? String(formData.get("purchaseUnitId")) : null,
      categoryIds,
      supplierVendorId: String(formData.get("supplierVendorId") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      currency: String(formData.get("currency") ?? "IDR").toUpperCase(),
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
      categoryIds: parsed.data.categoryIds,
      priceMaterials: [{ supplierVendorId: parsed.data.supplierVendorId, amount: parsed.data.amount, currency: parsed.data.currency, notes: parsed.data.notes || undefined }],
      notes: parsed.data.notes || undefined,
    });
    refreshPricing();
    revalidatePath("/masterdata/brands");
    revalidatePath("/masterdata");
    return result;
  });
}

export async function createPricingWorkCategoryQuickAction(formData: FormData): Promise<ActionResult<{ categoryId: string }>> {
  return runSafeAction(async () => {
    const parsed = pricingCategoryQuickForm.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validationError(parsed.error);
    const ctx = await context();
    const result = await masterDataService.createCategory({
      ...ctx,
      name: parsed.data.name,
      kind: "WORK",
    });
    refreshPricing();
    revalidatePath("/masterdata/categories");
    revalidatePath("/settings/general/masterdata");
    revalidatePath("/masterdata");
    return result;
  });
}

export async function createPricingVendorQuickAction(kind: PriceKind, formData: FormData): Promise<ActionResult<{ vendorId: string }>> {
  return runSafeAction(async () => {
    const parsed = pricingVendorQuickForm.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw validationError(parsed.error);
    const parsedKind = z.enum(["material", "material-labor", "labor"]).safeParse(kind);
    if (!parsedKind.success) throw validationError(parsedKind.error);
    const ctx = await context();
    const result = await masterDataService.createPricingVendorQuick({
      ...ctx,
      name: parsed.data.name,
      vendorTypeId: parsed.data.vendorTypeId,
      capability: parsedKind.data === "material" ? "MATERIAL" : "LABOR",
    });
    refreshPricing();
    return result;
  });
}

export async function savePriceAction(kind: PriceKind, formData: FormData): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const raw = Object.fromEntries(formData);
    const parsed = priceForm.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error);
    const value = parsed.data; const ctx = await context();
    if (kind === "material" && !value.id) {
      const required = z.object({ skuId: z.string().uuid(), vendorId: z.string().uuid() }).safeParse(raw);
      if (!required.success) throw validationError(required.error);
    }
    if (kind !== "material") {
      const required = z.object({ name: z.string().min(1), categoryId: z.string().uuid(), vendorId: z.string().uuid(), unitId: z.string().uuid() }).safeParse(raw);
      if (!required.success) throw validationError(required.error);
    }
    const result = kind === "material" ? value.id
      ? await masterDataService.updatePriceMaterial({ ...ctx, priceMaterialId: value.id, amount: value.amount, currency: value.currency, unitId: value.unitId, notes: value.notes })
      : await masterDataService.createPriceMaterial({ ...ctx, skuId: value.skuId!, supplierVendorId: value.vendorId!, amount: value.amount, currency: value.currency, notes: value.notes })
      : kind === "material-labor" ? value.id
        ? await masterDataService.updatePriceMaterialLabor({ ...ctx, priceMaterialLaborId: value.id, name: value.name!, categoryId: value.categoryId!, vendorId: value.vendorId!, unitId: value.unitId!, amount: value.amount, currency: value.currency, scopeNote: value.scopeNote, notes: value.notes })
        : await masterDataService.createPriceMaterialLabor({ ...ctx, name: value.name!, categoryId: value.categoryId!, vendorId: value.vendorId!, unitId: value.unitId!, amount: value.amount, currency: value.currency, scopeNote: value.scopeNote, notes: value.notes })
        : value.id
          ? await masterDataService.updatePriceLabor({ ...ctx, priceLaborId: value.id, name: value.name!, categoryId: value.categoryId!, vendorId: value.vendorId!, unitId: value.unitId!, amount: value.amount, currency: value.currency, notes: value.notes })
          : await masterDataService.createPriceLabor({ ...ctx, name: value.name!, categoryId: value.categoryId!, vendorId: value.vendorId!, unitId: value.unitId!, amount: value.amount, currency: value.currency, notes: value.notes });
    refreshPricing();
    return result;
  });
}

export async function archivePriceAction(kind: PriceKind, id: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const input = parseMutationInput(kind, id);
    const result = input.kind === "material"
      ? await masterDataService.archivePriceMaterial({ ...ctx, priceMaterialId: input.id })
      : input.kind === "material-labor"
        ? await masterDataService.archivePriceMaterialLabor({ ...ctx, priceMaterialLaborId: input.id })
        : await masterDataService.archivePriceLabor({ ...ctx, priceLaborId: input.id });
    refreshPricing();
    return result;
  });
}

export async function restorePriceAction(kind: PriceKind, id: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const input = parseMutationInput(kind, id);
    const result = input.kind === "material"
      ? await masterDataService.restorePriceMaterial({ ...ctx, priceMaterialId: input.id })
      : input.kind === "material-labor"
        ? await masterDataService.restorePriceMaterialLabor({ ...ctx, priceMaterialLaborId: input.id })
        : await masterDataService.restorePriceLabor({ ...ctx, priceLaborId: input.id });
    refreshPricing();
    return result;
  });
}

export async function requestPriceDeletionAction(kind: PriceKind, id: string, reason?: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const input = deletionInput.safeParse({ kind, id, reason });
    if (!input.success) throw validationError(input.error);
    const result = input.data.kind === "material"
      ? await masterDataService.requestPriceMaterialDeletion({ ...ctx, priceMaterialId: input.data.id, reason: input.data.reason })
      : input.data.kind === "material-labor"
        ? await masterDataService.requestPriceMaterialLaborDeletion({ ...ctx, priceMaterialLaborId: input.data.id, reason: input.data.reason })
        : await masterDataService.requestPriceLaborDeletion({ ...ctx, priceLaborId: input.data.id, reason: input.data.reason });
    refreshPricing();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
