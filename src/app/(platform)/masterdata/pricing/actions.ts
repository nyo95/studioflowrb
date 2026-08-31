"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { masterDataService } from "@/apps/masterdata/runtime";

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
