"use server";

import { revalidatePath } from "next/cache";

import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";


export async function createCategoryAction(formData: FormData) {
  await categoryService.create((await requireMasterDataRequestContext()), {
    kind: formData.get("kind") as "PRODUCT" | "WORK",
    name: formData.get("name") as string,
    parentId: (formData.get("parentId") as string) || null,
    description: (formData.get("description") as string) || null,
  });
  revalidatePath("/masterdata/categories");
}

export async function updateCategoryAction(formData: FormData) {
  await categoryService.update((await requireMasterDataRequestContext()), {
    id: formData.get("id") as string,
    name: (formData.get("name") as string) || undefined,
    description: (formData.get("description") as string) || null,
  });
  revalidatePath("/masterdata/categories");
}

export async function deleteCategoryAction(id: string) {
  await categoryService.softDelete((await requireMasterDataRequestContext()), id);
  revalidatePath("/masterdata/categories");
}

export async function restoreCategoryAction(id: string) {
  await categoryService.restore((await requireMasterDataRequestContext()), id);
  revalidatePath("/masterdata/categories");
}
