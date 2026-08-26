"use server";

import { revalidatePath } from "next/cache";

import { unitService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import { UNIT_USAGES } from "@/apps/masterdata/domain/unit-rules";
import type { UnitUsage } from "@/apps/masterdata/domain/unit-rules";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

function parseUsages(formData: FormData): readonly UnitUsage[] {
  return UNIT_USAGES.filter((u) => formData.get(`usage_${u}`) === "on");
}

export async function createUnitAction(formData: FormData) {
  await unitService.create(CTX, {
    code: formData.get("code") as string,
    label: formData.get("label") as string,
    symbol: (formData.get("symbol") as string) || null,
    usages: parseUsages(formData),
  });
  revalidatePath("/masterdata/settings/units");
}

export async function updateUnitAction(formData: FormData) {
  await unitService.update(CTX, {
    id: formData.get("id") as string,
    code: formData.get("code") as string,
    label: (formData.get("label") as string) || undefined,
    symbol: (formData.get("symbol") as string) || null,
    usages: parseUsages(formData),
  });
  revalidatePath("/masterdata/settings/units");
}

export async function deleteUnitAction(id: string) {
  await unitService.softDelete(CTX, id);
  revalidatePath("/masterdata/settings/units");
}

export async function restoreUnitAction(id: string) {
  await unitService.restore(CTX, id);
  revalidatePath("/masterdata/settings/units");
}
