"use server";

import { revalidatePath } from "next/cache";

import { unitService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import { UNIT_USAGES } from "@/apps/masterdata/domain/unit-rules";
import type { UnitUsage } from "@/apps/masterdata/domain/unit-rules";


function parseUsages(formData: FormData): readonly UnitUsage[] {
  return UNIT_USAGES.filter((u) => formData.get(`usage_${u}`) === "on");
}

export async function createUnitAction(formData: FormData) {
  await unitService.create((await requireMasterDataRequestContext()), {
    code: formData.get("code") as string,
    label: formData.get("label") as string,
    symbol: (formData.get("symbol") as string) || null,
    usages: parseUsages(formData),
  });
  revalidatePath("/masterdata/settings/units");
}

export async function updateUnitAction(formData: FormData) {
  await unitService.update((await requireMasterDataRequestContext()), {
    id: formData.get("id") as string,
    code: formData.get("code") as string,
    label: (formData.get("label") as string) || undefined,
    symbol: (formData.get("symbol") as string) || null,
    usages: parseUsages(formData),
  });
  revalidatePath("/masterdata/settings/units");
}

export async function deleteUnitAction(id: string) {
  await unitService.softDelete((await requireMasterDataRequestContext()), id);
  revalidatePath("/masterdata/settings/units");
}

export async function restoreUnitAction(id: string) {
  await unitService.restore((await requireMasterDataRequestContext()), id);
  revalidatePath("/masterdata/settings/units");
}
