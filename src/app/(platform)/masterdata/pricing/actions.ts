"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { masterDataService } from "@/apps/masterdata/runtime";
import { validationError } from "@platform/core/validation";

type PriceKind = "material" | "material-labor" | "labor";

function refreshPricing(): void {
  revalidatePath("/masterdata/pricing");
  revalidatePath("/masterdata/skus");
  revalidatePath("/masterdata/settings/deletions");
}

async function context() {
  const { principal, grants } = await requirePrincipalGrants();
  return { grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName } };
}

const priceForm = z.object({
  id: z.string().uuid().optional(), name: z.string().min(1).max(128).optional(), skuId: z.string().uuid().optional(), vendorId: z.string().uuid().optional(), categoryId: z.string().uuid().optional(), unitId: z.string().uuid().optional(), amount: z.string().min(1), currency: z.string().length(3), scopeNote: z.string().max(1000).optional(), notes: z.string().max(1000).optional(),
});

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
    refreshPricing(); return result;
  });
}

export async function archivePriceAction(kind: PriceKind, id: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = kind === "material"
      ? await masterDataService.archivePriceMaterial({ ...ctx, priceMaterialId: id })
      : kind === "material-labor"
        ? await masterDataService.archivePriceMaterialLabor({ ...ctx, priceMaterialLaborId: id })
        : await masterDataService.archivePriceLabor({ ...ctx, priceLaborId: id });
    refreshPricing();
    return result;
  });
}

export async function restorePriceAction(kind: PriceKind, id: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = kind === "material"
      ? await masterDataService.restorePriceMaterial({ ...ctx, priceMaterialId: id })
      : kind === "material-labor"
        ? await masterDataService.restorePriceMaterialLabor({ ...ctx, priceMaterialLaborId: id })
        : await masterDataService.restorePriceLabor({ ...ctx, priceLaborId: id });
    refreshPricing();
    return result;
  });
}

export async function requestPriceDeletionAction(kind: PriceKind, id: string, reason?: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const ctx = await context();
    const result = kind === "material"
      ? await masterDataService.requestPriceMaterialDeletion({ ...ctx, priceMaterialId: id, reason })
      : kind === "material-labor"
        ? await masterDataService.requestPriceMaterialLaborDeletion({ ...ctx, priceMaterialLaborId: id, reason })
        : await masterDataService.requestPriceLaborDeletion({ ...ctx, priceLaborId: id, reason });
    refreshPricing();
    return result;
  });
}
