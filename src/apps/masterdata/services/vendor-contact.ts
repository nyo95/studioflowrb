import { randomUUID } from "node:crypto";

import { AppError } from "@platform/core/errors";

import { type TxClient, assertVendorMaterialCapable, requiredName } from "./shared";

/** A contact keeps its first phone number in `phone` and up to two more in `extra_phones`. */
export const MAX_CONTACT_PHONES = 3;
const MAX_PHONE_LENGTH = 32;

export type ContactInput = {
  id?: string;
  personName: string;
  jobTitle?: string | null;
  email?: string | null;
  /** Legacy single number; used only when `phones` is absent. */
  phone?: string | null;
  phones?: readonly string[] | null;
  isPrimary?: boolean;
  notes?: string | null;
  brandId?: string | null;
};

/** Trimmed, de-duplicated, non-empty phone numbers in the order given. */
export function contactPhones(input: { phone?: string | null; phones?: readonly string[] | null }): string[] {
  const raw = input.phones ?? (input.phone ? [input.phone] : []);
  const phones: string[] = [];
  for (const value of raw) {
    const phone = value.trim();
    if (!phone || phones.includes(phone)) continue;
    if (phone.length > MAX_PHONE_LENGTH) throw new AppError("VALIDATION", "CONTACT_PHONE_TOO_LONG", `A phone number can be at most ${MAX_PHONE_LENGTH} characters.`);
    phones.push(phone);
  }
  if (phones.length > MAX_CONTACT_PHONES) throw new AppError("VALIDATION", "CONTACT_PHONES_TOO_MANY", `A contact can have at most ${MAX_CONTACT_PHONES} phone numbers.`);
  return phones;
}

/** Column values for a contact row (everything except ids). */
export function contactColumns(input: ContactInput) {
  const phones = contactPhones(input);
  return {
    person_name: requiredName(input.personName, "CONTACT_NAME_REQUIRED"),
    job_title: input.jobTitle?.trim() || null,
    email: input.email?.trim() || null,
    phone: phones[0] ?? null,
    extra_phones: phones.slice(1),
    is_primary: input.isPrimary ?? false,
    notes: input.notes?.trim() || null,
    brand_id: input.brandId || null,
  };
}

export function sameContactColumns(existing: { person_name: string; job_title: string | null; email: string | null; phone: string | null; extra_phones: string[]; is_primary: boolean; notes: string | null; brand_id: string | null }, next: ReturnType<typeof contactColumns>): boolean {
  return existing.person_name === next.person_name
    && (existing.job_title || null) === next.job_title
    && (existing.email || null) === next.email
    && (existing.phone || null) === next.phone
    && existing.extra_phones.join("\u0000") === next.extra_phones.join("\u0000")
    && existing.is_primary === next.is_primary
    && (existing.notes || null) === next.notes
    && (existing.brand_id || null) === next.brand_id;
}

/**
 * A contact scoped to a Brand needs the supplier to own or supply that Brand. Instead of sending staff to another
 * screen to link them first, the missing relation is created here (not authorized, no notes), in the same
 * transaction. Returns true when a new relation was created.
 */
export async function ensureVendorBrandRelation(tx: TxClient, vendorId: string, brandId: string): Promise<boolean> {
  const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId } });
  if (brand.deleted_at !== null) throw new AppError("VALIDATION", "CONTACT_BRAND_ARCHIVED", "Brand is archived.");
  if (brand.owner_vendor_id === vendorId) return false;
  if (await tx.brandSupplier.findFirst({ where: { brand_id: brandId, vendor_id: vendorId } })) return false;
  try {
    await assertVendorMaterialCapable(tx, vendorId);
  } catch {
    throw new AppError("VALIDATION", "CONTACT_BRAND_NOT_RELATED", "This supplier is not a material supplier, so it cannot be linked to a Brand. Give it a material Supplier Type first.");
  }
  await tx.brandSupplier.create({ data: { id: randomUUID(), brand_id: brandId, vendor_id: vendorId, is_authorized: false, notes: null } });
  return true;
}
