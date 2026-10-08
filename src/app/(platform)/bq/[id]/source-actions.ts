"use server";

import { requirePrincipalGrants } from "@platform/core/auth";
import { requirePermission, hasPermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { bqPublicRead, masterDataRead } from "@/apps/bq/runtime";
import { BQ_PERMISSIONS } from "@/apps/bq/public";
import type { BqAssemblyLineRead } from "@/apps/bq/public";
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

/** How many options each source (Library, Master Data materials, Master Data work prices) may add to the picker. */
const SOURCE_SHARE = 30;

/**
 * Composes the two source catalogues for the picker. Master Data is reached only
 * through its published read contract; the BQ Library is BQ's own.
 */
export async function listLineItemSourcesAction(query: string): Promise<ActionResult<LineItemSourceOption[]>> {
  return runSafeAction(async () => {
    const { grants } = await authorize();
    const search = query.trim();
    const options: LineItemSourceOption[] = [];
    // Each source gets its own share of the list. One shared cut-off used to fill with the Library first, so a Library of
    // 80 or more items hid every Master Data price (the estimator's main source).
    const libraryOptions: LineItemSourceOption[] = [];

    const library = await bqPublicRead.listLibraryItems();
    for (const item of library) {
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) continue;
      if (libraryOptions.length >= SOURCE_SHARE) break;
      libraryOptions.push({
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

    options.push(...libraryOptions);

    /* Master Data access is a separate grant: an estimator without it still gets
       the Library, rather than an error that hides the half they may use. */
    if (hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead)) {
      const materials = await masterDataRead.listMaterialPriceOptions({ search, limit: SOURCE_SHARE });
      for (const option of materials) {
        if (option.currency.trim().toUpperCase() !== "IDR") continue;
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
      const works = await masterDataRead.listWorkPricesRead({ search, limit: SOURCE_SHARE });
      for (const option of works) {
        if (option.currency.trim().toUpperCase() !== "IDR") continue;
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

    return options;
  });
}

/**
 * Read-only preview for the Assembly picker: lets the estimator see the L2 +
 * L3 recipe (name, qty, koefisien, harga) before applying it, instead of
 * applying blind based on the assembly's name alone. Gated by the same
 * project read/manage check as the rest of this route rather than the
 * Library's `bq.library.read`, since it is reached from inside the project
 * editor.
 */
export async function getAssemblyLinesAction(assemblyId: string): Promise<ActionResult<BqAssemblyLineRead[]>> {
  return runSafeAction(async () => {
    await authorize();
    const detail = await bqPublicRead.getAssemblyTemplateDetail(assemblyId);
    if (!detail) {
      throw new AppError("NOT_FOUND", "BQ_ASSEMBLY_NOT_FOUND", "This assembly no longer exists.");
    }
    return detail.lines;
  });
}
