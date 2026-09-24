import Link from "next/link";
import { Banknote, Box, Plus, Ruler, Tags, TreePine, Truck, AlertCircle, ArrowUpRight } from "lucide-react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";
import { PageHeader, PageShell, SectionCard, MetricValue, Text, Heading, Badge, buttonClasses } from "@/platform/ui_engine";

export const dynamic = "force-dynamic";

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (min < 2) return "Just now";
  if (hours < 1) return `${min}m ago`;
  if (days < 1) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

const KIND_META = {
  brand: { label: "Brand", Icon: Tags, href: "/masterdata/brands" },
  vendor: { label: "Supplier", Icon: Truck, href: "/masterdata/vendors" },
  sku: { label: "SKU", Icon: Box, href: "/masterdata/skus" },
} as const;

export default async function MasterDataPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, MASTERDATA_PERMISSIONS.access)) redirect("/");

  const [summary, recent] = await Promise.all([
    masterDataService.summary({ grants: principalGrants.grants }),
    masterDataService.recentChanges({ grants: principalGrants.grants }),
  ]);

  const pricingTotal = summary.materialPrices + summary.workPrices;

  const tiles = [
    { key: "brands", label: "Brands", count: summary.brands, delta: summary.brandsThisMonth, href: "/masterdata/brands", Icon: Tags },
    { key: "vendors", label: "Suppliers", count: summary.vendors, delta: summary.vendorsThisMonth, href: "/masterdata/vendors", Icon: Truck },
    { key: "skus", label: "SKUs", count: summary.skus, delta: summary.skusThisMonth, href: "/masterdata/skus", Icon: Box },
    { key: "pricing", label: "Pricing", count: pricingTotal, delta: summary.pricingThisMonth, href: "/masterdata/pricing", Icon: Banknote },
  ] as const;

  return (
    <PageShell size="wide">
      <PageHeader
        eyebrow="Operational catalog"
        title="What the studio specifies"
        description="Brands, suppliers, SKUs, and pricing catalog for operational work"
        actions={
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/masterdata/brands" className={buttonClasses("secondary")}>
              <Tags size={15} aria-hidden="true" />
              <span>Brand</span>
            </Link>
            <Link href="/masterdata/pricing" className={buttonClasses("primary")}>
              <Plus size={15} aria-hidden="true" />
              <span>Price</span>
            </Link>
          </div>
        }
        divider
      />

      {/* ── Count tiles ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ key, label, count, delta, href, Icon }) => (
          <Link key={key} href={href} className="rounded-card text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus">
            <SectionCard className="group h-full transition-colors hover:bg-surface-muted">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-action bg-surface-muted text-ink-secondary">
                  <Icon size={16} aria-hidden="true" />
                </span>
                {delta > 0 && (
                  <Badge tone="neutral">
                    <Plus size={10} aria-hidden="true" />
                    <span>{delta}</span>
                  </Badge>
                )}
              </div>
              <div className="mt-3">
                <MetricValue size="lg">{formatCount(count)}</MetricValue>
                <Text as="p" tone="secondary" size="sm" className="mt-1 flex items-center gap-1">
                  {label}
                  <ArrowUpRight size={13} aria-hidden="true" className="text-ink-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Text>
              </div>
            </SectionCard>
          </Link>
        ))}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

        {/* Recent changes */}
        <SectionCard>
          <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
            <Heading level={3}>Recent changes</Heading>
          </div>
          {recent.length === 0 ? (
            <div className="px-5 py-6">
              <Text tone="tertiary" size="sm">No recent activity.</Text>
            </div>
          ) : (
            <div className="divide-y divide-line-subtle">
              {recent.map((item) => {
                const meta = KIND_META[item.kind];
                return (
                  <Link
                    key={item.id}
                    href={meta.href}
                    className="flex min-h-[56px] items-center gap-3 px-5 py-3 text-inherit no-underline transition-colors hover:bg-surface-muted"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-action bg-surface-muted text-ink-tertiary">
                      <meta.Icon size={14} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Text weight="medium" size="sm" className="block truncate">{item.label}</Text>
                      <Text tone="tertiary" size="sm">{meta.label}</Text>
                    </div>
                    <Badge tone="neutral">{item.isNew ? "Added" : "Updated"}</Badge>
                    <Text tone="tertiary" size="sm" className="w-14 shrink-0 text-right">
                      {relativeTime(item.updatedAt)}
                    </Text>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Waiting on you */}
          {summary.deletionRequests > 0 && (
            <SectionCard>
              <div className="border-b border-line-subtle px-5 py-4">
                <Heading level={3}>Waiting on you</Heading>
              </div>
              <div className="p-2">
                <Link
                  href="/masterdata/deletions"
                  className="flex items-center gap-3 rounded-action px-3 py-3 text-inherit no-underline transition-colors hover:bg-surface-muted"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-action bg-danger-surface text-danger">
                    <AlertCircle size={14} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Text weight="semibold" size="sm">Deletion requests</Text>
                    <Text tone="tertiary" size="sm">Pending approval</Text>
                  </div>
                  <Badge tone="danger">
                    <span className="font-bold">{summary.deletionRequests}</span>
                  </Badge>
                </Link>
              </div>
            </SectionCard>
          )}

          {/* Reference */}
          <SectionCard>
            <div className="border-b border-line-subtle px-5 py-4">
              <Heading level={3}>Reference</Heading>
            </div>
            <div className="grid grid-cols-3 divide-x divide-line-subtle">
              {[
                { href: "/masterdata/units", Icon: Ruler, count: summary.units, label: "Units" },
                { href: "/masterdata/categories", Icon: TreePine, count: summary.categories, label: "Categories" },
                { href: "/masterdata/vendors", Icon: Truck, count: summary.vendorTypes, label: "Vendor types" },
              ].map(({ href, Icon, count, label }) => (
                <Link
                  key={href + label}
                  href={href}
                  className="flex flex-col items-center gap-1.5 px-3 py-5 text-inherit no-underline transition-colors hover:bg-surface-muted"
                >
                  <Icon size={16} className="text-ink-tertiary" aria-hidden="true" />
                  <MetricValue size="sm">{count}</MetricValue>
                  <Text tone="tertiary" size="sm" className="text-center">{label}</Text>
                </Link>
              ))}
            </div>
          </SectionCard>

        </div>
      </div>
    </PageShell>
  );
}
