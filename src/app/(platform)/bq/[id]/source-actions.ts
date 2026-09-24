"use server";

import { requirePrincipalGrants } from "@platform/core/auth";
import { requirePermission, hasPermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { bqPublicRead, masterDataRead } from "@/apps/bq/runtime";
import { BQ_PERMISSIONS } from "@/apps/bq/public";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";

async function authorize() {
  const { grants } = await requirePrincipalGrants();
  requirePermission(grants, BQ_PERMISSIONS.access);
  if (!hasPermission(grants, BQ_PERMISSIONS.projectRead) && !hasPermission(grants, BQ_PERMISSIONS.projectManage)) {
    throw new AppError("FORBIDDEN", "BQ_PROJECT_ACCESS_REQUIRED", "BQ project read or manage access is required.");
  }
  return { grants };
}

export type LineItemSourceOption = {
  id: string;
  sourceType: "MASTERDATA" | "BQ_LIBRARY";
  sourceKind: "material" | "material-labor" | "labor" | "library";
  title: string;
  detail: string;
  unit: string;
  amount: string;
  currency: string;
  kategori: string;
};

/**
 * Composes the two source catalogues for the picker. Master Data is reached only
 * through its published read contract; the BQ Library is BQ's own.
 */
export async function listLineItemSourcesAction(query: string): Promise<ActionResult<LineItemSourceOption[]>> {
  return runSafeAction(async () => {
    const { grants } = await authorize();
    const search = query.trim();
    const options: LineItemSourceOption[] = [];

    const library = await bqPublicRead.listLibraryItems();
    for (const item of library) {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) continue;
      options.push({
        id: item.id,
        sourceType: "BQ_LIBRARY",
        sourceKind: "library",
        title: item.name,
        detail: "BQ Library",
        unit: item.purchaseUnit,
        amount: item.harga,
        currency: item.currency,
        kategori: item.kategori,
      });
    }

    /* Master Data access is a separate grant: an estimator without it still gets
       the Library, rather than an error that hides the half they may use. */
    if (hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead)) {
      const materials = await masterDataRead.listMaterialPriceOptions({ search, limit: 50 });
      for (const option of materials) {
        options.push({
          id: option.id,
          sourceType: "MASTERDATA",
          sourceKind: "material",
          title: option.skuName ?? option.skuCode ?? "Material",
          detail: `${option.supplierVendor.name} · Master Data`,
          unit: option.unit.code,
          amount: option.amount,
          currency: option.currency,
          kategori: "MATERIAL",
        });
      }
    }

    if (hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkRead)) {
      const works = await masterDataRead.listWorkPricesRead({ search, limit: 80 });
      for (const option of works) {
        options.push({
          id: option.id,
          sourceType: "MASTERDATA",
          sourceKind: option.kind,
          title: option.name,
          detail: `${option.vendor.name} · Master Data`,
          unit: option.unit.code,
          amount: option.amount,
          currency: option.currency,
          kategori: option.kind === "labor" ? "UPAH" : "MATERIAL_UPAH",
        });
      }
    }

    return options.slice(0, 80);
  });
}
