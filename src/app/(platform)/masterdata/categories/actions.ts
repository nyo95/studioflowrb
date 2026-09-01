"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { masterDataService } from "@/apps/masterdata/runtime";

function revalidateCategories(): void {
  revalidatePath("/masterdata/categories");
  revalidatePath("/settings/general/masterdata");
  revalidatePath("/masterdata");
}

const CategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(64, "Category name is too long"),
  kind: z.enum(["PRODUCT", "WORK"]),
});

export async function createCategoryAction(
  _prev: ActionResult<{ categoryId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ categoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = CategorySchema.safeParse({
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.createCategory({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      name: parsed.data.name,
      kind: parsed.data.kind,
    });
    revalidateCategories();
    return result;
  });
}

export async function updateCategoryAction(
  _prev: ActionResult<{ categoryId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ categoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = z
      .object({
        categoryId: z.string().uuid(),
        name: z.string().min(1, "Category name is required").max(64),
      })
      .safeParse({
        categoryId: String(formData.get("categoryId") ?? ""),
        name: String(formData.get("name") ?? ""),
      });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.updateCategory({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
    });
    revalidateCategories();
    return result;
  });
}

export async function deactivateCategoryAction(categoryId: string): Promise<ActionResult<{ categoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await masterDataService.deactivateCategory({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      categoryId,
    });
    revalidateCategories();
    return result;
  });
}

export async function mergeCategoryAction(
  sourceCategoryId: string,
  targetCategoryId: string,
): Promise<ActionResult<{ sourceCategoryId: string; targetCategoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await masterDataService.mergeCategory({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      sourceCategoryId,
      targetCategoryId,
    });
    revalidateCategories();
    return result;
  });
}

export async function requestCategoryDeletionAction(
  categoryId: string,
  reason?: string,
  notes?: string,
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await masterDataService.requestCategoryDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      categoryId,
      reason,
      notes,
    });
    revalidateCategories();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
