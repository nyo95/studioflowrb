import type { PrismaClient } from "@/generated/prisma/client";

export type StudioFlowDocumentIdentity = { companyName: string | null; logoKey: string | null; companyAddress: string | null; companyEmail: string | null };

/** Public composition read: the StudioFlow document letterhead has no business-data grant. */
export async function readStudioFlowDocumentIdentity(db: PrismaClient): Promise<StudioFlowDocumentIdentity> {
  const row = await db.sfSettings.findUnique({ where: { id: "studio" } });
  return { companyName: row?.company_name ?? null, logoKey: row?.logo_key ?? null, companyAddress: row?.company_address ?? null, companyEmail: row?.company_email ?? null };
}
