import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

import { BQ_PERMISSIONS, type BqServiceContext } from "./context";
import { DEFAULT_PAYMENT_TERMS, DEFAULT_PPN_PCT, LETTER_TEXT_MAX } from "../lib/quotation-letter";

export const BQ_QUOTATION_SETTINGS_ID = "bq_quotation_settings";

export type BqQuotationSettingsRead = {
  /** The issuer printed on quotations; null prints the platform organisation name. */
  companyName: string | null;
  /** The issuer's logo; null prints the platform brand mark. */
  logoKey: string | null;
  companyAddress: string | null;
  companyEmail: string | null;
  signerName: string | null;
  signatureKey: string | null;
  defaultPaymentTerms: string;
  defaultPpnPct: string;
};

/** A percentage 0-100 with up to three decimals, as `bq_project.quotation_ppn_pct` / the settings default store it. */
export function requirePpnPct(value: string): string {
  let normalized;
  try { normalized = toDecimalString(value.trim().replace(",", ".")); } catch { normalized = null; }
  if (normalized === null || compareDecimals(normalized, toDecimalString("0")) < 0 || compareDecimals(normalized, toDecimalString("100")) > 0 || (normalized.split(".")[1]?.length ?? 0) > 3) {
    throw new AppError("VALIDATION", "bq.quotation.ppn-invalid", "PPN must be a percentage between 0 and 100.");
  }
  return normalized;
}

export type ImageChange = { kind: "keep" } | { kind: "remove" } | { kind: "set"; key: string };

function nextKey(change: ImageChange, current: string | null): string | null {
  return change.kind === "keep" ? current : change.kind === "set" ? change.key : null;
}

export function requireLetterText(value: string | null, field: string): string | null {
  const text = value?.trim() ?? "";
  if (text.length > LETTER_TEXT_MAX) throw new AppError("VALIDATION", "bq.quotation.text-too-long", `${field} can be at most ${LETTER_TEXT_MAX} characters.`);
  return text || null;
}

/**
 * The studio's letterhead and defaults for printed quotations (owner 2026-10-14): address and e-mail under the logo,
 * the signer and their signature image, the default payment terms and PPN. BQ-owned, one row; the logo itself stays
 * the platform brand mark.
 */
export function createQuotationSettingsService(ctx: BqServiceContext) {
  const { db, auditWriter } = ctx;

  async function getQuotationSettings(): Promise<BqQuotationSettingsRead> {
    const row = await db.bqQuotationSettings.findUnique({ where: { id: BQ_QUOTATION_SETTINGS_ID } });
    return {
      companyName: row?.company_name ?? null,
      logoKey: row?.logo_key ?? null,
      companyAddress: row?.company_address ?? null,
      companyEmail: row?.company_email ?? null,
      signerName: row?.signer_name ?? null,
      signatureKey: row?.signature_key ?? null,
      defaultPaymentTerms: row?.default_payment_terms ?? DEFAULT_PAYMENT_TERMS,
      defaultPpnPct: row ? row.default_ppn_pct.toString() : DEFAULT_PPN_PCT,
    };
  }

  /** Returns the image keys this change replaced or removed, for the caller to discard after the commit. */
  async function updateQuotationSettings(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    companyName: string | null;
    companyAddress: string | null;
    companyEmail: string | null;
    signerName: string | null;
    defaultPaymentTerms: string | null;
    defaultPpnPct: string;
    signature: ImageChange;
    logo: ImageChange;
  }): Promise<{ replacedSignatureKey: string | null; replacedLogoKey: string | null }> {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const email = requireLetterText(input.companyEmail, "E-mail");
    if (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new AppError("VALIDATION", "bq.quotation.email-invalid", "Enter a valid e-mail address.");
    }
    const signerName = requireLetterText(input.signerName, "Signer");
    if (signerName !== null && signerName.length > 120) throw new AppError("VALIDATION", "bq.quotation.signer-too-long", "Signer can be at most 120 characters.");
    const companyName = requireLetterText(input.companyName, "Company name");
    if (companyName !== null && companyName.length > 120) throw new AppError("VALIDATION", "bq.quotation.company-too-long", "Company name can be at most 120 characters.");
    const current = await db.bqQuotationSettings.findUnique({ where: { id: BQ_QUOTATION_SETTINGS_ID } });
    const signatureKey = nextKey(input.signature, current?.signature_key ?? null);
    const logoKey = nextKey(input.logo, current?.logo_key ?? null);
    const data = {
      company_name: companyName,
      logo_key: logoKey,
      company_address: requireLetterText(input.companyAddress, "Address"),
      company_email: email,
      signer_name: signerName,
      default_payment_terms: requireLetterText(input.defaultPaymentTerms, "Payment terms"),
      default_ppn_pct: requirePpnPct(input.defaultPpnPct),
      signature_key: signatureKey,
      updated_by_label: input.actor.label,
    };
    await db.bqQuotationSettings.upsert({ where: { id: BQ_QUOTATION_SETTINGS_ID }, create: { id: BQ_QUOTATION_SETTINGS_ID, ...data }, update: data });
    await auditWriter({ appId: "bq", action: "bq.quotation-settings.updated", entityType: "BqQuotationSettings", entityId: BQ_QUOTATION_SETTINGS_ID, actor: input.actor });
    const replaced = (previous: string | null | undefined, next: string | null) => (previous && previous !== next ? previous : null);
    return { replacedSignatureKey: replaced(current?.signature_key, signatureKey), replacedLogoKey: replaced(current?.logo_key, logoKey) };
  }

  return { getQuotationSettings, updateQuotationSettings };
}
