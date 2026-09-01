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
const IdSchema = z.string().uuid();
const DeletionInputSchema = z.object({ id: IdSchema, reason: z.string().max(1000).optional(), notes: z.string().max(1000).optional() });

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

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
    const id = parseId(categoryId);
    const result = await masterDataService.deactivateCategory({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      categoryId: id,
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
    const parsed = z.object({ sourceCategoryId: IdSchema, targetCategoryId: IdSchema }).safeParse({ sourceCategoryId, targetCategoryId });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.mergeCategory({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      sourceCategoryId: parsed.data.sourceCategoryId,
      targetCategoryId: parsed.data.targetCategoryId,
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
    const parsed = DeletionInputSchema.safeParse({ id: categoryId, reason, notes });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.requestCategoryDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      categoryId: parsed.data.id,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });
    revalidateCategories();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
