import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { redirect } from "next/navigation";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import { PageHeader } from "@/platform/ui_engine";


import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { masterDataService } from "@/apps/masterdata/runtime";


export const dynamic = "force-dynamic";

const SECTIONS = [
  { key: "brands", label: "Brands", href: "/masterdata/brands", desc: "Catalog brands, discovery categories, and hashtags." },
  { key: "vendors", label: "Suppliers", href: "/masterdata/vendors", desc: "Suppliers, subcontractors, and capability assignments." },
  { key: "skus", label: "SKUs", href: "/masterdata/skus", desc: "Product catalog items and purchase units." },
  { key: "materialPrices", label: "Material prices", href: "/masterdata/pricing", desc: "SKU supplier pricing." },
  { key: "units", label: "Units", href: "/masterdata/units", desc: "Standard measurement units." },
  { key: "categories", label: "Categories", href: "/masterdata/categories", desc: "Product & work categorization tree." },
  { key: "deletionRequests", label: "Deletion requests", href: "/masterdata/deletions", desc: "Two-step permanent purge approvals." },
] as const;

export default async function MasterDataPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, MASTERDATA_PERMISSIONS.access)) redirect("/");

  const summary = await masterDataService.summary({ grants: principalGrants.grants });

  return <>
    <PageHeader title="Operational Catalog" divider />
    <div className="divide-y divide-line-subtle border-y border-line-subtle">
      {SECTIONS.map((section) => {
        const label = section.key === "materialPrices" ? "Pricing" : section.label;
        const count = section.key === "materialPrices"
          ? `${summary.materialPrices === 0 ? "—" : summary.materialPrices} material · ${summary.workPrices === 0 ? "—" : summary.workPrices} work`
          : (summary[section.key] === 0 ? "—" : summary[section.key]);
        return (
          <Link
            key={section.key}
            href={section.href}
            className="group flex w-full items-center justify-between gap-4 px-3 py-4 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus"
            aria-label={`Open ${label}`}
          >
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{label}</span>
              <span className="mt-0.5 block text-sm text-ink-tertiary">{section.desc}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm text-ink-secondary">
              <span>{count}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-ink-tertiary transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        );
      })}
    </div>
  </>;
}
