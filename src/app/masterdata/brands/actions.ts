"use server";

import { revalidatePath } from "next/cache";

import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

/** categoryIds is a newline-separated list of IDs from the form textarea */
function parseCategories(raw: string): { categoryId: string; sortOrder: number }[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean).map((categoryId, i) => ({ categoryId, sortOrder: i }));
}

export async function createBrandAction(formData: FormData) {
  const categoriesRaw = formData.get("categoryIds") as string;
  await brandService.create(CTX, {
    name: formData.get("name") as string,
    ownerPartyId: (formData.get("ownerPartyId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    categories: parseCategories(categoriesRaw),
    suppliers: [],
    links: [],
  });
  revalidatePath("/masterdata/brands");
}

export async function updateBrandAction(formData: FormData) {
  const categoriesRaw = formData.get("categoryIds") as string;
  await brandService.update(CTX, {
    id: formData.get("id") as string,
    name: formData.get("name") as string,
    ownerPartyId: (formData.get("ownerPartyId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    categories: parseCategories(categoriesRaw),
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
