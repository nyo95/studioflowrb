import Link from "next/link";

import { redirect } from "next/navigation";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import { DataTable,PageHeader,TableBody,TableCell,TableHead,TableHeader,TableRow,Text } from "@/platform/ui_engine";


import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { masterDataService } from "@/apps/masterdata/runtime";


export const dynamic = "force-dynamic";

const SECTIONS = [
  { key: "brands", label: "Brands", href: "/masterdata/brands", desc: "Catalog brands, discovery categories, and hashtags." },
  { key: "vendors", label: "Vendors", href: "/masterdata/vendors", desc: "Suppliers, subcontractors, and capability assignments." },
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

  return <div className="grid gap-4">
    <PageHeader title="Operational Catalog" />
    <DataTable density="compact" minWidth={520}>
      <TableHeader><TableRow><TableHead>Area</TableHead><TableHead align="end">Records</TableHead><TableHead align="end">Open</TableHead></TableRow></TableHeader>
      <TableBody>{SECTIONS.map(section => <TableRow key={section.key}>
        <TableCell><Text weight="semibold">{section.key === "materialPrices" ? "Pricing" : section.label}</Text></TableCell>
        <TableCell align="end">{section.key === "materialPrices" ? <span>{summary.materialPrices} material · {summary.workPrices} work</span> : summary[section.key]}</TableCell>
        <TableCell align="end"><Link className="rounded-action px-2 py-1 text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-line-focus" href={section.href} aria-label={`Open ${section.key === "materialPrices" ? "Pricing" : section.label}`}>Open</Link></TableCell>
      </TableRow>)}</TableBody>
    </DataTable>
  </div>;
}
