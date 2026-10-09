"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { masterDataService } from "@/apps/masterdata/runtime";

async function upload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "SKU_PRICE_WORKBOOK_REQUIRED", "Choose an .xlsx or .csv file first.");
  return { data: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type };
}

type DownloadFile = { filename: string; mimeType: string; base64: string };

export async function exportSkuPriceWorkbookAction(format: "xlsx" | "csv" | "pdf" = "xlsx"): Promise<ActionResult<DownloadFile>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    if (format !== "xlsx" && format !== "csv" && format !== "pdf") throw new AppError("VALIDATION", "EXPORT_FORMAT_INVALID", "Choose Excel, CSV or PDF.");
    const file = await masterDataService.exportSkuPriceList({ grants, format });
    return { filename: file.filename, mimeType: file.mimeType, base64: file.data.toString("base64") };
  });
}

export async function skuPriceImportTemplateAction(format: "xlsx" | "csv" = "xlsx"): Promise<ActionResult<DownloadFile>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    if (format !== "xlsx" && format !== "csv") throw new AppError("VALIDATION", "EXPORT_FORMAT_INVALID", "Choose Excel or CSV.");
    const file = await masterDataService.skuPriceImportTemplate({ grants, format });
    return { filename: file.filename, mimeType: file.mimeType, base64: file.data.toString("base64") };
  });
}

export async function previewSkuPriceImportAction(formData: FormData): Promise<ActionResult<Awaited<ReturnType<typeof masterDataService.previewSkuPriceImport>>>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    return masterDataService.previewSkuPriceImport({ grants, file: await upload(formData) });
  });
}

export async function applySkuPriceImportAction(formData: FormData): Promise<ActionResult<Awaited<ReturnType<typeof masterDataService.applySkuPriceImport>>>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const hash = String(formData.get("hash") ?? "").trim();
    if (!hash) throw new AppError("VALIDATION", "SKU_PRICE_WORKBOOK_HASH_REQUIRED", "Preview the workbook before applying it.");
    const result = await masterDataService.applySkuPriceImport({ grants, actor: { kind: "USER", userId: principal.userId, label: principal.displayName }, file: await upload(formData), hash });
    revalidatePath("/masterdata"); revalidatePath("/masterdata/skus"); revalidatePath("/masterdata/pricing");
    return result;
  });
}

function databaseOptions(formData: FormData) {
  return { priceKind: formData.get("priceKind") === "material-labor" ? ("material-labor" as const) : ("labor" as const), defaultUnitId: String(formData.get("defaultUnitId") ?? "") || null };
}

/** The current suppliers and work prices (one price kind) in the template's own flat shape, ready to edit and import back. */
export async function exportPriceDatabaseAction(formData?: { priceKind?: string; format?: string }): Promise<ActionResult<DownloadFile>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    const file = await masterDataService.exportPriceDatabase({ grants, priceKind: formData?.priceKind === "material-labor" ? "material-labor" : "labor", format: formData?.format === "csv" ? "csv" : "xlsx" });
    return { filename: file.filename, mimeType: file.mimeType, base64: file.data.toString("base64") };
  });
}

/** The blank, filled-by-hand file: one example row, instructions on a Notes sheet. */
export async function priceDatabaseTemplateAction(format: "xlsx" | "csv" = "xlsx"): Promise<ActionResult<DownloadFile>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    if (format !== "xlsx" && format !== "csv") throw new AppError("VALIDATION", "EXPORT_FORMAT_INVALID", "Choose Excel or CSV.");
    const file = await masterDataService.priceDatabaseTemplate({ grants, format });
    return { filename: file.filename, mimeType: file.mimeType, base64: file.data.toString("base64") };
  });
}

export async function previewPriceDatabaseImportAction(formData: FormData): Promise<ActionResult<Awaited<ReturnType<typeof masterDataService.previewPriceDatabaseImport>>>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    return masterDataService.previewPriceDatabaseImport({ grants, actor: { kind: "USER", userId: principal.userId, label: principal.displayName }, file: await upload(formData), options: databaseOptions(formData) });
  });
}

export async function applyPriceDatabaseImportAction(formData: FormData): Promise<ActionResult<Awaited<ReturnType<typeof masterDataService.applyPriceDatabaseImport>>>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const hash = String(formData.get("hash") ?? "").trim();
    if (!hash) throw new AppError("VALIDATION", "PRICE_DATABASE_WORKBOOK_HASH_REQUIRED", "Check the file before importing it.");
    const result = await masterDataService.applyPriceDatabaseImport({ grants, actor: { kind: "USER", userId: principal.userId, label: principal.displayName }, file: await upload(formData), hash, options: databaseOptions(formData) });
    revalidatePath("/masterdata"); revalidatePath("/masterdata/vendors"); revalidatePath("/masterdata/pricing"); revalidatePath("/masterdata/categories");
    return result;
  });
}
