"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { hasPermission } from "@platform/core/rbac";
import { masterDataService } from "@/apps/masterdata/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

function refresh() {
  revalidatePath("/settings/general/masterdata");
  revalidatePath("/masterdata/vendors");
}
function actor(principal: { userId: string; displayName: string }) {
  return { kind: "USER" as const, userId: principal.userId, label: principal.displayName };
}
const formSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
});
const idSchema = z.string().uuid();
function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function saveSupplierCategoryAction(
  id: string | null,
  formData: FormData,
): Promise<ActionResult<{ supplierCategoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = formSchema.safeParse({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const supplierCategoryId = id === null ? null : parseId(id);
    const result = supplierCategoryId
      ? await masterDataService.updateSupplierCategory({
          grants,
          actor: actor(principal),
          supplierCategoryId,
          name: parsed.data.name,
        })
      : await masterDataService.createSupplierCategory({
          grants,
          actor: actor(principal),
          code: parsed.data.code,
          name: parsed.data.name,
        });
    refresh();
    return result;
  });
}

export async function archiveSupplierCategoryAction(id: string): Promise<ActionResult<{ supplierCategoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const supplierCategoryId = parseId(id);
    const result = await masterDataService.archiveSupplierCategory({ grants, actor: actor(principal), supplierCategoryId });
    refresh();
    return result;
  });
}

export async function restoreSupplierCategoryAction(id: string): Promise<ActionResult<{ supplierCategoryId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const supplierCategoryId = parseId(id);
    const result = await masterDataService.restoreSupplierCategory({ grants, actor: actor(principal), supplierCategoryId });
    refresh();
    return result;
  });
}

export async function requestSupplierCategoryDeletionAction(id: string): Promise<ActionResult<unknown>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const supplierCategoryId = parseId(id);
    const result = hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove)
      ? await masterDataService.hardDeleteArchived({ grants, actor: actor(principal), targetType: "supplier_category", targetId: supplierCategoryId })
      : await masterDataService.requestSupplierCategoryDeletion({ grants, actor: actor(principal), supplierCategoryId });
    refresh();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}