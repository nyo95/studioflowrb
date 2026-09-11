"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { hasPermission } from "@platform/core/rbac";
import { masterDataService } from "@/apps/masterdata/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

function refresh() { revalidatePath("/settings/general/masterdata"); revalidatePath("/masterdata/vendors"); }
function actor(principal: { userId: string; displayName: string }) { return { kind: "USER" as const, userId: principal.userId, label: principal.displayName }; }
const formSchema = z.object({ code: z.string().min(1).max(32), name: z.string().min(1).max(64), material: z.boolean(), labor: z.boolean() });
const idSchema = z.string().uuid();
function parseId(value: string): string { const parsed = idSchema.safeParse(value); if (!parsed.success) throw validationError(parsed.error); return parsed.data; }

export async function saveVendorTypeAction(id: string | null, formData: FormData): Promise<ActionResult<{ vendorTypeId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = formSchema.safeParse({ code: String(formData.get("code") ?? ""), name: String(formData.get("name") ?? ""), material: formData.get("material") === "on", labor: formData.get("labor") === "on" });
    if (!parsed.success) throw validationError(parsed.error);
    const vendorTypeId = id === null ? null : parseId(id);
    const result = vendorTypeId ? await masterDataService.updateVendorType({ grants, actor: actor(principal), vendorTypeId, name: parsed.data.name, canSupplyMaterial: parsed.data.material, canSupplyLabor: parsed.data.labor }) : await masterDataService.createVendorType({ grants, actor: actor(principal), code: parsed.data.code, name: parsed.data.name, canSupplyMaterial: parsed.data.material, canSupplyLabor: parsed.data.labor });
    refresh(); return result;
  });
}
export async function archiveVendorTypeAction(id: string): Promise<ActionResult<{ vendorTypeId: string }>> { return runSafeAction(async () => { const { principal, grants } = await requirePrincipalGrants(); const vendorTypeId = parseId(id); const result = await masterDataService.archiveVendorType({ grants, actor: actor(principal), vendorTypeId }); refresh(); return result; }); }
export async function restoreVendorTypeAction(id: string): Promise<ActionResult<{ vendorTypeId: string }>> { return runSafeAction(async () => { const { principal, grants } = await requirePrincipalGrants(); const vendorTypeId = parseId(id); const result = await masterDataService.restoreVendorType({ grants, actor: actor(principal), vendorTypeId }); refresh(); return result; }); }
export async function requestVendorTypeDeletionAction(id: string): Promise<ActionResult<unknown>> { return runSafeAction(async () => { const { principal, grants } = await requirePrincipalGrants(); const vendorTypeId = parseId(id); const result = hasPermission(grants, MASTERDATA_PERMISSIONS.deletionApprove) ? await masterDataService.hardDeleteArchived({ grants, actor: actor(principal), targetType: "vendor_type", targetId: vendorTypeId }) : await masterDataService.requestVendorTypeDeletion({ grants, actor: actor(principal), vendorTypeId }); refresh(); revalidatePath("/masterdata/deletions"); return result; }); }
