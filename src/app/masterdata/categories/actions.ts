"use server";

import { revalidatePath } from "next/cache";

import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";

const DEV_CONTEXT = MASTER_DATA_REQUEST_CONTEXT;

export async function createCategoryAction(formData: FormData) {
  await categoryService.create(DEV_CONTEXT, {
    kind: formData.get("kind") as "PRODUCT" | "WORK",
    name: formData.get("name") as string,
    parentId: (formData.get("parentId") as string) || null,
    description: (formData.get("description") as string) || null,
  });
  revalidatePath("/masterdata/categories");
}

export async function updateCategoryAction(formData: FormData) {
  await categoryService.update(DEV_CONTEXT, {
    id: formData.get("id") as string,
    name: (formData.get("name") as string) || undefined,
    description: (formData.get("description") as string) || null,
  });
  revalidatePath("/masterdata/categories");
}

export async function deleteCategoryAction(id: string) {
  await categoryService.softDelete(DEV_CONTEXT, id);
  revalidatePath("/masterdata/categories");
}

export async function restoreCategoryAction(id: string) {
  await categoryService.restore(DEV_CONTEXT, id);
  revalidatePath("/masterdata/categories");
}
