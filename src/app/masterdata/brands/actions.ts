"use server";

import { revalidatePath } from "next/cache";

import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

function parseCategories(formData: FormData): { categoryId: string; sortOrder: number }[] {
  return formData.getAll("categoryIds").map(String).map((categoryId) => categoryId.trim()).filter(Boolean).map((categoryId, sortOrder) => ({ categoryId, sortOrder }));
}

export async function createBrandAction(formData: FormData) {
  await brandService.create(CTX, {
    name: formData.get("name") as string,
    ownerPartyId: (formData.get("ownerPartyId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    categories: parseCategories(formData),
    suppliers: [],
    links: [],
  });
  revalidatePath("/masterdata/brands");
}

export async function updateBrandAction(formData: FormData) {
  await brandService.update(CTX, {
    id: formData.get("id") as string,
    name: formData.get("name") as string,
    ownerPartyId: (formData.get("ownerPartyId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    categories: parseCategories(formData),
  });
  revalidatePath("/masterdata/brands");
}

export async function deleteBrandAction(id: string) {
  await brandService.softDelete(CTX, id);
  revalidatePath("/masterdata/brands");
}

export async function restoreBrandAction(id: string) {
  await brandService.restore(CTX, id);
  revalidatePath("/masterdata/brands");
}
