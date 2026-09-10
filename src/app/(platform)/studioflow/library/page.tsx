import { BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { EmptyState, PageHeader, SectionCard, Text } from "@/platform/ui_engine";
import { ResourceLinksDialog } from "./resource-links-dialog";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

export default async function StudioFlowLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  if (!hasPermission(principalGrants.grants, STUDIOFLOW_PERMISSIONS.projectRead)) redirect("/");

  const query = firstParam((await searchParams).q);
  const brands = await createMasterDataPublicRead(prisma).listBrandLibraryReads({ search: query || undefined });

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow · Global"
        title="Library"
        description="Cari brand dan katalog dari Master Data berdasarkan nama, hashtag, atau kategori."
        divider
      />
      <SectionCard padded={false}>
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-line-subtle p-(--ui-section-px)">
          <label className="sr-only" htmlFor="library-search">Cari Library</label>
          <div className="relative min-w-[min(100%,320px)] flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input id="library-search" name="q" defaultValue={query} placeholder="Brand, hashtag, atau kategori" className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-ink-tertiary" />
          </div>
          <button type="submit" className="rounded-control bg-ink px-3 py-2 text-sm font-medium text-surface">Cari</button>
          {query ? <Link href="/studioflow/library" className="rounded-control border border-line px-3 py-2 text-sm text-ink-secondary">Reset</Link> : null}
        </form>
        {brands.length === 0 ? (
          <div className="p-(--ui-section-px)"><EmptyState icon={BookOpen} title={query ? "No results" : "Library has no brands yet"} description={query ? `No brand, hashtag, or category matches “${query}”.` : "Brands and catalog links are provided by Master Data."} /></div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {brands.map((brand) => (
              <article key={brand.id} className="grid gap-2 p-(--ui-section-px) sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start">
                <div className="min-w-0"><ResourceLinksDialog brand={brand} /><Text as="p" tone="tertiary" size="sm">{brand.ownerVendor?.name ?? "Brand"}</Text></div>
                <div className="flex flex-wrap gap-1.5">{brand.categories.map((category) => <span key={category.id} className="rounded-full bg-surface-muted px-2 py-1 text-xs text-ink-secondary">{category.name}</span>)}{brand.hashtags.map((hashtag) => <span key={hashtag.id} className="rounded-full border border-line px-2 py-1 text-xs text-ink-tertiary">#{hashtag.label}</span>)}</div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
