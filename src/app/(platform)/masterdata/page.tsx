import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Badge,
  Heading,
  PageHeader,
  PageSection,
  PageShell,
  SectionCard,
  Text,
} from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

export const dynamic = "force-dynamic";

const METRICS = [
  ["brands", "Brands"],
  ["vendors", "Vendors"],
  ["skus", "SKUs"],
  ["categories", "Categories"],
  ["units", "Units"],
  ["materialPrices", "Material prices"],
  ["workPrices", "Work prices"],
] as const;

export default async function MasterDataPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, MASTERDATA_PERMISSIONS.access)) redirect("/");

  const summary = await masterDataService.summary({ grants: principalGrants.grants });

  return (
    <PageShell size="wide">
      <PageHeader
        eyebrow="Master Data"
        title="Operational catalog"
        description="Manage the shared product, vendor, unit, category, and pricing vocabulary used by downstream workflows."
        actions={<Badge tone="success">Connected</Badge>}
      />
      <PageSection title="Overview" description="Live records in the rebuild database." >
        <SectionCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map(([key, label]) => (
              <div key={key} className="grid gap-1 border-b border-line-subtle pb-3 last:border-0 sm:last:border-b lg:nth-last-1:border-b-0">
                <Text meta>{label}</Text>
                <Heading level={3}>{summary[key]}</Heading>
              </div>
            ))}
          </div>
        </SectionCard>
      </PageSection>
      <PageSection title="Next actions" description="The first application slice is being activated from the curated contracts." >
        <SectionCard>
          <Text tone="secondary">Directory, detail, lifecycle, and pricing workflows will use the shared UI Engine and the transactional Master Data service.</Text>
        </SectionCard>
      </PageSection>
    </PageShell>
  );
}
