"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { masterDataService } from "@/apps/masterdata/runtime";

function revalidateUnits(): void {
  revalidatePath("/masterdata/units");
  revalidatePath("/settings/general/masterdata");
  revalidatePath("/masterdata");
}

const UnitSchema = z.object({
  code: z.string().min(1, "Unit code is required").max(16, "Unit code is too long"),
  name: z.string().min(1, "Unit name is required").max(64, "Unit name is too long"),
});

export async function createUnitAction(
  _prev: ActionResult<{ unitId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ unitId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = UnitSchema.safeParse({
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.createUnit({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      code: parsed.data.code,
      name: parsed.data.name,
    });
    revalidateUnits();
    return result;
  });
}

export async function updateUnitAction(
  _prev: ActionResult<{ unitId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ unitId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = UnitSchema.extend({ unitId: z.string().uuid() }).safeParse({
      unitId: String(formData.get("unitId") ?? ""),
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.updateUnit({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      unitId: parsed.data.unitId,
      code: parsed.data.code,
      name: parsed.data.name,
    });
    revalidateUnits();
    return result;
  });
}

export async function archiveUnitAction(unitId: string): Promise<ActionResult<{ unitId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await masterDataService.archiveUnit({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      unitId,
    });
    revalidateUnits();
    return result;
  });
}

export async function restoreUnitAction(unitId: string): Promise<ActionResult<{ unitId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await masterDataService.restoreUnit({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      unitId,
    });
    revalidateUnits();
    return result;
  });
}

export async function requestUnitDeletionAction(
  unitId: string,
  reason?: string,
  notes?: string,
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const result = await masterDataService.requestUnitDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      unitId,
      reason,
      notes,
    });
    revalidateUnits();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
