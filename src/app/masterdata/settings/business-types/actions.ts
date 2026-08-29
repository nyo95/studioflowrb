"use server";
import { revalidatePath } from "next/cache";
import { businessTypeService } from "@masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@masterdata/infrastructure/request-context";
export async function createBusinessTypeAction(formData: FormData) { await businessTypeService.create((await requireMasterDataRequestContext()), { code: String(formData.get("code") ?? ""), label: String(formData.get("label") ?? ""), description: String(formData.get("description") ?? "") || null, sortOrder: Number(formData.get("sortOrder") ?? 0) }); revalidatePath("/masterdata/settings/business-types"); }
export async function updateBusinessTypeAction(formData: FormData) { await businessTypeService.update((await requireMasterDataRequestContext()), { id: String(formData.get("id") ?? ""), code: String(formData.get("code") ?? ""), label: String(formData.get("label") ?? ""), description: String(formData.get("description") ?? "") || null, sortOrder: Number(formData.get("sortOrder") ?? 0) }); revalidatePath("/masterdata/settings/business-types"); }
export async function deleteBusinessTypeAction(id: string) { await businessTypeService.softDelete((await requireMasterDataRequestContext()), id); revalidatePath("/masterdata/settings/business-types"); }
export async function restoreBusinessTypeAction(id: string) { await businessTypeService.restore((await requireMasterDataRequestContext()), id); revalidatePath("/masterdata/settings/business-types"); }
