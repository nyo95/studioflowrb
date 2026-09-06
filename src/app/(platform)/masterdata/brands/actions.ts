"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { masterDataService } from "@/apps/masterdata/runtime";

function revalidateBrands(): void {
  revalidatePath("/masterdata/brands");
  revalidatePath("/masterdata/skus");
  revalidatePath("/masterdata");
}

const HttpUrlSchema = z.string().url("Must be a valid URL").refine(
  (value) => {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  },
  "Must be an HTTP(S) URL",
);

const BrandInputSchema = z.object({
  name: z.string().min(1, "Brand name is required").max(64, "Brand name is too long"),
  ownerVendorId: z.string().uuid("Owner vendor is required"),
  notes: z.string().max(1000).optional().nullable().or(z.literal("")),
  categoryIds: z.array(z.string().uuid()).optional(),
  hashtags: z.array(z.string()).optional(),
  links: z.array(z.object({ kind: z.string().min(1), url: HttpUrlSchema, label: z.string().optional().nullable() })).optional(),
  suppliers: z.array(z.object({ vendorId: z.string().uuid() })).optional(),
});
const IdSchema = z.string().uuid();
const DeletionInputSchema = z.object({ id: IdSchema, reason: z.string().max(1000).optional(), notes: z.string().max(1000).optional() });

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function createOwnerVendorQuickAction(name: string): Promise<ActionResult<{ vendorId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = z.string().min(1, "Supplier name is required").max(64, "Supplier name is too long").safeParse(name);
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.createVendor({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      name: parsed.data,
    });
    revalidateBrands();
    revalidatePath("/masterdata/vendors");
    return result;
  });
}

export async function createBrandAction(
  _prev: ActionResult<{ brandId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ brandId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const rawLinksJson = String(formData.get("linksJson") ?? "[]");
    let links: unknown;
    try {
      links = JSON.parse(rawLinksJson);
    } catch {
      throw validationError(BrandInputSchema.shape.links.safeParse(null).error!);
    }

    const rawHashtags = String(formData.get("hashtags") ?? "")
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
    const supplierIds = formData.getAll("supplierIds").map(String).filter(Boolean);

    const parsed = BrandInputSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      ownerVendorId: String(formData.get("ownerVendorId") ?? ""),
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
      categoryIds,
      suppliers: supplierIds.map((vendorId) => ({ vendorId })),
      hashtags: rawHashtags,
      links,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.createBrand({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      name: parsed.data.name,
      ownerVendorId: parsed.data.ownerVendorId,
      notes: parsed.data.notes || undefined,
      categoryIds: parsed.data.categoryIds,
      hashtags: parsed.data.hashtags,
      links: (parsed.data.links ?? []).map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? undefined })),
      suppliers: parsed.data.suppliers,
    });
    revalidateBrands();
    return result;
  });
}

export async function updateBrandAction(
  _prev: ActionResult<{ brandId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ brandId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const rawLinksJson = String(formData.get("linksJson") ?? "[]");
    let links: unknown;
    try {
      links = JSON.parse(rawLinksJson);
    } catch {
      throw validationError(BrandInputSchema.shape.links.safeParse(null).error!);
    }

    const rawHashtags = String(formData.get("hashtags") ?? "")
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
    const supplierIds = formData.getAll("supplierIds").map(String).filter(Boolean);

    const parsed = BrandInputSchema.extend({ brandId: z.string().uuid() }).safeParse({
      brandId: String(formData.get("brandId") ?? ""),
      name: String(formData.get("name") ?? ""),
      ownerVendorId: String(formData.get("ownerVendorId") ?? ""),
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
      categoryIds,
      suppliers: supplierIds.map((vendorId) => ({ vendorId })),
      hashtags: rawHashtags,
      links,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.updateBrand({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      brandId: parsed.data.brandId,
      name: parsed.data.name,
      ownerVendorId: parsed.data.ownerVendorId,
      notes: parsed.data.notes,
      categoryIds: parsed.data.categoryIds,
      hashtags: parsed.data.hashtags,
      links: (parsed.data.links ?? []).map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? undefined })),
      suppliers: parsed.data.suppliers,
    });
    revalidateBrands();
    return result;
  });
}

export async function archiveBrandAction(brandId: string): Promise<ActionResult<{ brandId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = parseId(brandId);
    const result = await masterDataService.archiveBrand({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      brandId: id,
    });
    revalidateBrands();
    return result;
  });
}

export async function restoreBrandAction(brandId: string): Promise<ActionResult<{ brandId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = parseId(brandId);
    const result = await masterDataService.restoreBrand({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      brandId: id,
    });
    revalidateBrands();
    return result;
  });
}

export async function requestBrandDeletionAction(
  brandId: string,
  reason?: string,
  notes?: string,
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = DeletionInputSchema.safeParse({ id: brandId, reason, notes });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.requestBrandDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      brandId: parsed.data.id,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });
    revalidateBrands();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
