import type { PrismaClient } from "@/generated/prisma/client";

const BQ_QUOTATION_SETTINGS_ID = "bq_quotation_settings";

export type BqIssuerIdentity = { companyName: string | null; logoKey: string | null; companyAddress: string | null; companyEmail: string | null };

/** Public composition read: the BQ issuer's document identity, without quotation-only fields. */
export async function readBqIssuerIdentity(db: PrismaClient): Promise<BqIssuerIdentity> {
  const row = await db.bqQuotationSettings.findUnique({ where: { id: BQ_QUOTATION_SETTINGS_ID } });
  return { companyName: row?.company_name ?? null, logoKey: row?.logo_key ?? null, companyAddress: row?.company_address ?? null, companyEmail: row?.company_email ?? null };
}
