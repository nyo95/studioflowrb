import Link from "next/link";
import { Banknote, Box, Plus, Ruler, Tags, TreePine, Truck, AlertCircle, ArrowUpRight } from "lucide-react";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

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
    <div className="flex flex-col gap-8">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-5 max-[560px]:flex-col max-[560px]:items-start">
        <div>
          <p className="text-label text-ink-tertiary">Operational catalog</p>
          <h1 className="mt-2 font-display text-display font-bold tracking-[-0.02em] text-ink">
            What the studio specifies
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/masterdata/brands"
            className="flex items-center gap-1.5 rounded-action border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
          >
            <Tags size={15} aria-hidden="true" />
            Brand
          </Link>
          <Link
            href="/masterdata/pricing"
            className="flex items-center gap-1.5 rounded-action border border-ink bg-ink px-3 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-action-hover"
          >
            <Plus size={15} aria-hidden="true" />
            Price
          </Link>
        </div>
      </div>

      {/* ── Count tiles ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ key, label, count, delta, href, Icon }) => (
          <Link
            key={key}
            href={href}
            className="group flex flex-col gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-action bg-surface-muted text-ink-secondary">
                <Icon size={16} aria-hidden="true" />
              </span>
              {delta > 0 && (
                <span className="flex items-center gap-0.5 text-micro font-semibold text-ink-secondary">
                  <Plus size={10} aria-hidden="true" />
                  {delta}
                </span>
              )}
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none tabular-nums text-ink">{formatCount(count)}</p>
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-secondary">
                {label}
                <ArrowUpRight size={13} aria-hidden="true" className="text-ink-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

        {/* Recent changes */}
        <section className="flex flex-col rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
            <h3 className="text-base font-semibold text-ink">Recent changes</h3>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-tertiary">No recent activity.</p>
          ) : (
            <div className="divide-y divide-line-subtle">
              {recent.map((item) => {
                const meta = KIND_META[item.kind];
                return (
                  <Link
                    key={item.id}
                    href={meta.href}
                    className="flex min-h-[56px] items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-action bg-surface-muted text-ink-tertiary">
                      <meta.Icon size={14} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{item.label}</p>
                      <p className="text-xs text-ink-tertiary">{meta.label}</p>
                    </div>
                    <span className="shrink-0 rounded-action border px-1.5 py-0.5 text-micro font-medium text-ink-tertiary"
                      style={{ borderColor: "var(--ui-border-subtle)" }}
                    >
                      {item.isNew ? "Added" : "Updated"}
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs text-ink-tertiary">
                      {relativeTime(item.updatedAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Waiting on you */}
          {summary.deletionRequests > 0 && (
            <section className="rounded-card border border-line bg-surface">
              <div className="border-b border-line-subtle px-5 py-4">
                <h3 className="text-base font-semibold text-ink">Waiting on you</h3>
              </div>
              <div className="p-2">
                <Link
                  href="/masterdata/deletions"
                  className="flex items-center gap-3 rounded-action px-3 py-3 transition-colors hover:bg-surface-muted"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-action bg-danger-surface text-danger">
                    <AlertCircle size={14} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">Deletion requests</p>
                    <p className="text-xs text-ink-tertiary">Pending approval</p>
                  </div>
                  <span className="flex h-6 min-w-[24px] items-center justify-center rounded-action bg-danger-surface px-1.5 text-xs font-bold text-danger">
                    {summary.deletionRequests}
                  </span>
                </Link>
              </div>
            </section>
          )}

          {/* Reference */}
          <section className="rounded-card border border-line bg-surface">
            <div className="border-b border-line-subtle px-5 py-4">
              <h3 className="text-base font-semibold text-ink">Reference</h3>
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
                  className="flex flex-col items-center gap-1.5 px-3 py-5 transition-colors hover:bg-surface-muted"
                >
                  <Icon size={16} className="text-ink-tertiary" aria-hidden="true" />
                  <span className="text-base font-semibold tabular-nums text-ink">{count}</span>
                  <span className="text-center text-xs text-ink-tertiary">{label}</span>
                </Link>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
