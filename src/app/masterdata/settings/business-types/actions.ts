"use server";
import { revalidatePath } from "next/cache";
import { businessTypeService } from "@masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT as CTX } from "@masterdata/infrastructure/request-context";
export async function createBusinessTypeAction(formData: FormData) { await businessTypeService.create(CTX, { code: String(formData.get("code") ?? ""), label: String(formData.get("label") ?? ""), description: String(formData.get("description") ?? "") || null, sortOrder: Number(formData.get("sortOrder") ?? 0) }); revalidatePath("/masterdata/settings/business-types"); }
export async function updateBusinessTypeAction(formData: FormData) { await businessTypeService.update(CTX, { id: String(formData.get("id") ?? ""), code: String(formData.get("code") ?? ""), label: String(formData.get("label") ?? ""), description: String(formData.get("description") ?? "") || null, sortOrder: Number(formData.get("sortOrder") ?? 0) }); revalidatePath("/masterdata/settings/business-types"); }
export async function deleteBusinessTypeAction(id: string) { await businessTypeService.softDelete(CTX, id); revalidatePath("/masterdata/settings/business-types"); }
export async function restoreBusinessTypeAction(id: string) { await businessTypeService.restore(CTX, id); revalidatePath("/masterdata/settings/business-types"); }
