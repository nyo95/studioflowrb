import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Badge,
  Heading,
  PageHeader,
  PageSection,
  SectionCard,
  Text,
} from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { key: "brands", label: "Brands", href: "/masterdata/brands", desc: "Catalog brands, discovery categories, and hashtags." },
  { key: "vendors", label: "Vendors", href: "/masterdata/vendors", desc: "Suppliers, subcontractors, and capability assignments." },
  { key: "skus", label: "SKUs", href: "/masterdata/skus", desc: "Product catalog items and purchase units." },
  { key: "materialPrices", label: "Material prices", href: "/masterdata/pricing", desc: "SKU supplier pricing." },
  { key: "workPrices", label: "Material + Labor / Labor", href: "/masterdata/pricing", desc: "Material + labor and labor-only unit prices." },
  { key: "units", label: "Units", href: "/masterdata/units", desc: "Standard measurement units." },
  { key: "categories", label: "Categories", href: "/masterdata/categories", desc: "Product & work categorization tree." },
  { key: "deletionRequests", label: "Deletion requests", href: "/masterdata/deletions", desc: "Two-step permanent purge approvals." },
] as const;

export default async function MasterDataPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, MASTERDATA_PERMISSIONS.access)) redirect("/");

  const summary = await masterDataService.summary({ grants: principalGrants.grants });

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Operational Catalog"
        description="Manage the shared product, vendor, unit, category, and pricing vocabulary used by downstream workflows."
        actions={<Badge tone="success">Connected</Badge>}
      />

      <PageSection title="Summary" description="Live catalog assets and dictionary entries.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((section) => (
            <Link key={section.key} href={section.href} className="group block focus-visible:outline-none">
              <SectionCard className="h-full transition-all group-hover:border-action/60 group-hover:shadow-sm">
                <div className="flex items-baseline justify-between mb-1">
                  <Text meta>{section.label}</Text>
                  <Heading level={3} className="text-ink group-hover:text-action">
                    {summary[section.key as keyof typeof summary]}
                  </Heading>
                </div>
                <Text tone="tertiary" size="sm" className="line-clamp-2">
                  {section.desc}
                </Text>
              </SectionCard>
            </Link>
          ))}
        </div>
      </PageSection>
    </div>
  );
}
