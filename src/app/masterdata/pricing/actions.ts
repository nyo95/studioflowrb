"use server";

import { revalidatePath } from "next/cache";
import { pricingService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import type { WorkPriceKind } from "@/apps/masterdata/domain/pricing-rules";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export async function setSkuPriceAction(formData: FormData) {
  await pricingService.setSkuPrice(CTX, {
    skuId: formData.get("skuId") as string,
    amount: formData.get("amount") as string,
    currency: formData.get("currency") as string,
    unitId: formData.get("unitId") as string,
    supplierPartyId: (formData.get("supplierPartyId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/masterdata/pricing");
  revalidatePath("/masterdata/skus");
}

export async function clearSkuPriceAction(skuId: string) {
  await pricingService.clearSkuPrice(CTX, skuId);
  revalidatePath("/masterdata/pricing");
  revalidatePath("/masterdata/skus");
}

export async function createWorkPriceAction(formData: FormData) {
  await pricingService.createWorkPrice(CTX, {
    code: formData.get("code") as string,
    name: formData.get("name") as string,
    categoryId: formData.get("categoryId") as string,
    unitId: formData.get("unitId") as string,
    amount: formData.get("amount") as string,
    kind: formData.get("kind") as WorkPriceKind,
    currency: formData.get("currency") as string,
    vendorPartyId: (formData.get("vendorPartyId") as string) || null,
    scopeNote: (formData.get("scopeNote") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/masterdata/pricing");
}

export async function updateWorkPriceAction(formData: FormData) {
  await pricingService.updateWorkPrice(CTX, {
    id: formData.get("id") as string,
    code: formData.get("code") as string,
    name: formData.get("name") as string,
    categoryId: formData.get("categoryId") as string,
    unitId: formData.get("unitId") as string,
    amount: formData.get("amount") as string,
    kind: formData.get("kind") as WorkPriceKind,
    currency: formData.get("currency") as string,
    vendorPartyId: (formData.get("vendorPartyId") as string) || null,
    scopeNote: (formData.get("scopeNote") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/masterdata/pricing");
}

export async function deleteWorkPriceAction(id: string) {
  await pricingService.softDeleteWorkPrice(CTX, id);
  revalidatePath("/masterdata/pricing");
}

export async function restoreWorkPriceAction(id: string) {
  await pricingService.restoreWorkPrice(CTX, id);
  revalidatePath("/masterdata/pricing");
}
