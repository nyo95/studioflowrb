"use server";

import { revalidatePath } from "next/cache";

import { skuService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import type { SkuKind } from "@/apps/masterdata/domain/sku-rules";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export async function createSkuAction(formData: FormData) {
  await skuService.create(CTX, {
    name: formData.get("name") as string,
    kind: formData.get("kind") as SkuKind,
    baseUnitId: formData.get("baseUnitId") as string,
    code: (formData.get("code") as string) || null,
    brandId: (formData.get("brandId") as string) || null,
    categoryId: (formData.get("categoryId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/masterdata/skus");
}

export async function updateSkuAction(formData: FormData) {
  await skuService.update(CTX, {
    id: formData.get("id") as string,
    name: formData.get("name") as string,
    kind: formData.get("kind") as SkuKind,
    baseUnitId: formData.get("baseUnitId") as string,
    code: (formData.get("code") as string) || null,
    brandId: (formData.get("brandId") as string) || null,
    categoryId: (formData.get("categoryId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/masterdata/skus");
}

export async function activateSkuAction(id: string) {
  await skuService.activate(CTX, id);
  revalidatePath("/masterdata/skus");
}

export async function discontinueSkuAction(id: string) {
  await skuService.discontinue(CTX, id);
  revalidatePath("/masterdata/skus");
}

export async function deleteSkuAction(id: string) {
  await skuService.softDelete(CTX, id);
  revalidatePath("/masterdata/skus");
}

export async function restoreSkuAction(id: string) {
  await skuService.restore(CTX, id);
  revalidatePath("/masterdata/skus");
}
