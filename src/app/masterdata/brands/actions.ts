"use server";

import { revalidatePath } from "next/cache";

import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";


function parseCategories(formData: FormData): { categoryId: string; sortOrder: number }[] {
  return formData.getAll("categoryIds").map(String).map((categoryId) => categoryId.trim()).filter(Boolean).map((categoryId, sortOrder) => ({ categoryId, sortOrder }));
}

export async function createBrandAction(formData: FormData) {
  await brandService.create((await requireMasterDataRequestContext()), {
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
  await brandService.update((await requireMasterDataRequestContext()), {
    id: formData.get("id") as string,
    name: formData.get("name") as string,
    ownerPartyId: (formData.get("ownerPartyId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    categories: parseCategories(formData),
  });
  revalidatePath("/masterdata/brands");
}

export async function deleteBrandAction(id: string) {
  await brandService.softDelete((await requireMasterDataRequestContext()), id);
  revalidatePath("/masterdata/brands");
}

export async function restoreBrandAction(id: string) {
  await brandService.restore((await requireMasterDataRequestContext()), id);
  revalidatePath("/masterdata/brands");
}
