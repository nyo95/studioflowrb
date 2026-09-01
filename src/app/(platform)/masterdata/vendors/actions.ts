"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePrincipalGrants } from "@platform/core/auth";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";
import { masterDataService } from "@/apps/masterdata/runtime";

function revalidateVendors(): void {
  revalidatePath("/masterdata/vendors");
  revalidatePath("/masterdata/brands");
  revalidatePath("/masterdata/pricing");
  revalidatePath("/masterdata");
}

const VendorInputSchema = z.object({
  name: z.string().min(1, "Vendor name is required").max(64, "Vendor name is too long"),
  legalName: z.string().max(128).optional().nullable().or(z.literal("")),
  address: z.string().max(256).optional().nullable().or(z.literal("")),
  notes: z.string().max(1000).optional().nullable().or(z.literal("")),
  vendorTypeIds: z.array(z.string().uuid()).optional(),
  contacts: z.array(z.object({
    id: z.string().uuid().optional(),
    personName: z.string().min(1, "Contact name is required"),
    jobTitle: z.string().max(64).optional().nullable().or(z.literal("")),
    email: z.string().email().optional().nullable().or(z.literal("")),
    phone: z.string().max(32).optional().nullable().or(z.literal("")),
    isPrimary: z.boolean().optional(),
    brandId: z.string().uuid().optional().nullable().or(z.literal("")),
    notes: z.string().max(500).optional().nullable().or(z.literal("")),
  })).optional(),
  links: z.array(z.object({
    kind: z.string().min(1),
    url: z.string().url("Must be a valid URL"),
    label: z.string().optional().nullable(),
    archiveUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal("")),
    sortOrder: z.number().int().min(0).optional(),
  })).optional(),
  brandSuppliers: z.array(z.object({
    brandId: z.string().uuid(),
    isAuthorized: z.boolean().optional(),
    notes: z.string().max(500).optional().nullable().or(z.literal("")),
  })).optional(),
});
const IdSchema = z.string().uuid();
const DeletionInputSchema = z.object({ id: IdSchema, reason: z.string().max(1000).optional(), notes: z.string().max(1000).optional() });

function parseId(value: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export async function createVendorAction(
  _prev: ActionResult<{ vendorId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ vendorId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();

    let contacts = [];
    try {
      contacts = JSON.parse(String(formData.get("contactsJson") ?? "[]"));
    } catch {
      // ignore
    }

    let links = [];
    try {
      links = JSON.parse(String(formData.get("linksJson") ?? "[]"));
    } catch {
      // ignore
    }

    const vendorTypeIds = formData.getAll("vendorTypeIds").map(String).filter(Boolean);

    let brandSuppliers = [];
    try {
      brandSuppliers = JSON.parse(String(formData.get("brandSuppliersJson") ?? "[]"));
    } catch {
      // ignore
    }

    const parsed = VendorInputSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      legalName: formData.get("legalName") ? String(formData.get("legalName")) : null,
      address: formData.get("address") ? String(formData.get("address")) : null,
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
      vendorTypeIds,
      contacts,
      links,
      brandSuppliers,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.createVendor({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      name: parsed.data.name,
      legalName: parsed.data.legalName || undefined,
      address: parsed.data.address || undefined,
      notes: parsed.data.notes || undefined,
      vendorTypeIds: parsed.data.vendorTypeIds,
      contacts: parsed.data.contacts?.map((c) => ({
        personName: c.personName,
        jobTitle: c.jobTitle || undefined,
        email: c.email || undefined,
        phone: c.phone || undefined,
        isPrimary: c.isPrimary ?? false,
        notes: c.notes || undefined,
        brandId: c.brandId || undefined,
      })),
      links: (parsed.data.links ?? []).map((l, idx) => ({ kind: l.kind, url: l.url, label: l.label ?? undefined, archiveUrl: l.archiveUrl || undefined, sortOrder: l.sortOrder ?? idx })),
      brandSuppliers: (parsed.data.brandSuppliers ?? []).map((bs) => ({ brandId: bs.brandId, isAuthorized: bs.isAuthorized ?? false, notes: bs.notes || undefined })),
    });
    revalidateVendors();
    return result;
  });
}

export async function updateVendorAction(
  _prev: ActionResult<{ vendorId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ vendorId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();

    let contacts = [];
    try {
      contacts = JSON.parse(String(formData.get("contactsJson") ?? "[]"));
    } catch {
      // ignore
    }

    let links = [];
    try {
      links = JSON.parse(String(formData.get("linksJson") ?? "[]"));
    } catch {
      // ignore
    }

    const vendorTypeIds = formData.getAll("vendorTypeIds").map(String).filter(Boolean);

    let brandSuppliers = [];
    try {
      brandSuppliers = JSON.parse(String(formData.get("brandSuppliersJson") ?? "[]"));
    } catch {
      // ignore
    }

    const parsed = VendorInputSchema.extend({ vendorId: z.string().uuid() }).safeParse({
      vendorId: String(formData.get("vendorId") ?? ""),
      name: String(formData.get("name") ?? ""),
      legalName: formData.get("legalName") ? String(formData.get("legalName")) : null,
      address: formData.get("address") ? String(formData.get("address")) : null,
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
      vendorTypeIds,
      contacts,
      links,
      brandSuppliers,
    });
    if (!parsed.success) throw validationError(parsed.error);

    const result = await masterDataService.updateVendor({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      vendorId: parsed.data.vendorId,
      name: parsed.data.name,
      legalName: parsed.data.legalName,
      address: parsed.data.address,
      notes: parsed.data.notes,
      vendorTypeIds: parsed.data.vendorTypeIds,
      contacts: parsed.data.contacts?.map((c) => ({
        id: c.id,
        personName: c.personName,
        jobTitle: c.jobTitle || undefined,
        email: c.email || undefined,
        phone: c.phone || undefined,
        isPrimary: c.isPrimary ?? false,
        notes: c.notes || undefined,
        brandId: c.brandId || undefined,
      })),
      links: (parsed.data.links ?? []).map((l, idx) => ({ kind: l.kind, url: l.url, label: l.label ?? undefined, archiveUrl: l.archiveUrl || undefined, sortOrder: l.sortOrder ?? idx })),
      brandSuppliers: parsed.data.brandSuppliers?.map((bs) => ({ brandId: bs.brandId, isAuthorized: bs.isAuthorized ?? false, notes: bs.notes || undefined })),
    });
    revalidateVendors();
    return result;
  });
}

export async function archiveVendorAction(vendorId: string): Promise<ActionResult<{ vendorId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = parseId(vendorId);
    const result = await masterDataService.archiveVendor({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      vendorId: id,
    });
    revalidateVendors();
    return result;
  });
}

export async function restoreVendorAction(vendorId: string): Promise<ActionResult<{ vendorId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const id = parseId(vendorId);
    const result = await masterDataService.restoreVendor({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      vendorId: id,
    });
    revalidateVendors();
    return result;
  });
}

export async function requestVendorDeletionAction(
  vendorId: string,
  reason?: string,
  notes?: string,
): Promise<ActionResult<{ requestId: string }>> {
  return runSafeAction(async () => {
    const { principal, grants } = await requirePrincipalGrants();
    const parsed = DeletionInputSchema.safeParse({ id: vendorId, reason, notes });
    if (!parsed.success) throw validationError(parsed.error);
    const result = await masterDataService.requestVendorDeletion({
      grants,
      actor: { kind: "USER", userId: principal.userId, label: principal.displayName },
      vendorId: parsed.data.id,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });
    revalidateVendors();
    revalidatePath("/masterdata/deletions");
    return result;
  });
}
