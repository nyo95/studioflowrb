"use server";

import { revalidatePath } from "next/cache";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { masterDataService } from "@/apps/masterdata/runtime";

async function upload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "SKU_PRICE_WORKBOOK_REQUIRED", "Choose an .xlsx workbook first.");
  return { data: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type };
}

export async function exportSkuPriceWorkbookAction(): Promise<ActionResult<{ filename: string; base64: string }>> {
  return runSafeAction(async () => {
    const { grants } = await requirePrincipalGrants();
    const workbook = await masterDataService.exportSkuPriceWorkbook({ grants });
    return { filename: "sku-prices.xlsx", base64: workbook.toString("base64") };
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

// Bare executor hooks; the Lead-owned UI consumes the typed actions above.
export async function exportSkuPriceWorkbookFormAction(_formData: FormData): Promise<void> { await exportSkuPriceWorkbookAction(); }
export async function previewSkuPriceImportFormAction(formData: FormData): Promise<void> { await previewSkuPriceImportAction(formData); }
export async function applySkuPriceImportFormAction(formData: FormData): Promise<void> { await applySkuPriceImportAction(formData); }
