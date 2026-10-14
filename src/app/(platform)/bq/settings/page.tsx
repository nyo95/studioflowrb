import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { objectStorage, prisma } from "@platform/runtime";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { brandMarkStorage } from "@platform/runtime";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqService } from "@/apps/bq/runtime";
import { QuotationSettingsForm } from "./quotation-settings-form";

export const dynamic = "force-dynamic";

export default async function BqSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, BQ_PERMISSIONS.projectManage)) {
    return (
      <>
        <PageHeader eyebrow="Bill of Quantity" title="Quotation settings" divider />
        <SectionCard><ErrorState title="Access denied" description="Only people who manage BQ projects can change the quotation letterhead." /></SectionCard>
      </>
    );
  }
  const [settings, platform] = await Promise.all([
    bqService.getQuotationSettings(),
    readPlatformGeneralSettings(prisma, (key) => brandMarkStorage.createPublicReadUrl(key)),
  ]);
  const signatureUrl = settings.signatureKey ? await objectStorage.createSignedReadUrl(settings.signatureKey, 600).catch(() => null) : null;

  return (
    <>
      <PageHeader eyebrow="Bill of Quantity" title="Quotation settings" description="The letterhead and defaults printed on every quotation. Each project can change its own payment terms and PPN under Detail quotation." divider />
      <QuotationSettingsForm settings={settings} signatureUrl={signatureUrl} organizationName={platform.organizationName} hasLogo={Boolean(platform.brandMarkUrl)} />
    </>
  );
}
