"use server";

import { revalidatePath } from "next/cache";

import { partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import type { PartyRole } from "@/apps/masterdata/domain/party-rules";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

const ALL_ROLES: readonly PartyRole[] = ["MATERIAL_SUPPLIER", "WORK_VENDOR"];

function parseRoles(formData: FormData): readonly PartyRole[] {
  return ALL_ROLES.filter((r) => formData.get(`role_${r}`) === "on");
}

export async function createPartyAction(formData: FormData) {
  await partyService.create(CTX, {
    name: formData.get("name") as string,
    type: formData.get("type") as "ORGANIZATION" | "INDIVIDUAL",
    legalName: (formData.get("legalName") as string) || null,
    address: (formData.get("address") as string) || null,
    notes: (formData.get("notes") as string) || null,
    roles: parseRoles(formData),
    businessTypeIds: [],
    contacts: [],
    links: [],
  });
  revalidatePath("/masterdata/parties");
}

export async function updatePartyAction(formData: FormData) {
  await partyService.update(CTX, {
    id: formData.get("id") as string,
    name: formData.get("name") as string,
    type: formData.get("type") as "ORGANIZATION" | "INDIVIDUAL",
    legalName: (formData.get("legalName") as string) || null,
    address: (formData.get("address") as string) || null,
    notes: (formData.get("notes") as string) || null,
    roles: parseRoles(formData),
  });
  revalidatePath("/masterdata/parties");
}

export async function deletePartyAction(id: string) {
  await partyService.softDelete(CTX, id);
  revalidatePath("/masterdata/parties");
}

export async function restorePartyAction(id: string) {
  await partyService.restore(CTX, id);
  revalidatePath("/masterdata/parties");
}
