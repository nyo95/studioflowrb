"use client";

import { BookOpenText, Camera, ChevronDown, Globe2, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Badge,
  Button,
  Checkbox,
  CountBadge,
  Dialog,
  DirectoryShell,
  Drawer,
  EmptyState,
  FilterBar,
  FilterChip,
  Pagination,
  SearchField,
  Select,
  Surface,
  Text,
  initialsOf,
  usePagination,
} from "@/platform/ui_engine";

type LibraryBrand = {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
  ownerVendor: { id: string; name: string } | null;
  categories: Array<{ id: string; name: string; slug: string }>;
  hashtags: Array<{ id: string; label: string; normalized: string }>;
  links: Array<{ id: string; kind: string; url: string; label: string | null }>;
  imageUrl: string | null;
  websiteCatalogue: { sourceUrl: string; offerings: string[] } | null;
};

type FilterOption = { id: string; label: string };
const PAGE_SIZE = 24;

const LINK_ICONS = {
  CATALOG: BookOpenText,
  WEBSITE: Globe2,
  INSTAGRAM: Camera,
} as const;

function linkLabel(link: LibraryBrand["links"][number]) {
  return link.label ?? link.kind;
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleOptions = expanded ? options : options.slice(0, 5);

  return (
    <details open className="group border-b border-line-subtle last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-tertiary transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-2 px-3 pb-3">
        {visibleOptions.map((option) => (
          <Checkbox
            key={option.id}
            checked={selected.has(option.id)}
            label={<Text size="sm">{option.label}</Text>}
            onCheckedChange={() => onToggle(option.id)}
          />
        ))}
        {options.length > 5 ? (
          <button type="button" className="w-fit text-left text-sm text-action hover:underline" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>
    </details>
  );
}

const MAX_VISIBLE_HASHTAGS = 3;

function BrandCard({ brand, websiteMatch, onOpen }: { brand: LibraryBrand; websiteMatch: string | null; onOpen: () => void }) {
  const hiddenHashtags = Math.max(0, brand.hashtags.length - MAX_VISIBLE_HASHTAGS);
  return (
    <Surface as="article" className="overflow-hidden">
      <button type="button" onClick={onOpen} aria-label={`View ${brand.name}`} className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
          {brand.imageUrl ? (
            // External website metadata is not a fixed image host, so Next Image optimization is intentionally skipped.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-contain p-6" />
          ) : (
            <div role="img" aria-label="Brand image unavailable" className="grid h-full place-items-center text-ink-tertiary">
              <Text size="md" weight="semibold">{initialsOf(brand.name)}</Text>
            </div>
          )}
        </div>
        <div className="grid gap-1 p-3 pb-0">
          <Text weight="semibold">{brand.name}</Text>
          {brand.ownerVendor ? <Text tone="secondary" size="sm">{brand.ownerVendor.name}</Text> : null}
        </div>
      </button>
      <div className="grid gap-3 p-3">
        {brand.notes ? <Text tone="secondary" size="sm" className="line-clamp-3 whitespace-pre-wrap">{brand.notes}</Text> : null}
        {websiteMatch ? <Badge tone="warning" title="Matched on the brand's public website">Website: {websiteMatch}</Badge> : null}
        {brand.categories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {brand.categories.map((category) => <Badge key={category.id}>{category.name}</Badge>)}
          </div>
        ) : null}
        {brand.hashtags.length > 0 ? (
          <Text tone="secondary" size="sm" className="line-clamp-1">
            {brand.hashtags.slice(0, MAX_VISIBLE_HASHTAGS).map((hashtag) => `#${hashtag.label}`).join("  ")}
            {hiddenHashtags > 0 ? `  +${hiddenHashtags}` : ""}
          </Text>
        ) : null}
        {brand.links.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line-subtle pt-3">
            {brand.links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={linkLabel(link)} title={linkLabel(link)} className="inline-grid size-8 pointer-coarse:size-11 place-items-center rounded-control text-action hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                {(() => {
                  const Icon = LINK_ICONS[link.kind.trim().toUpperCase() as keyof typeof LINK_ICONS] ?? Globe2;
                  return <Icon aria-hidden="true" size={16} />;
                })()}
                <span className="sr-only">{linkLabel(link)}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

function BrandDetail({ brand }: { brand: LibraryBrand }) {
  return (
    <div className="grid gap-4">
      <div className="aspect-[16/9] overflow-hidden rounded-card bg-surface-muted">
        {brand.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain p-6" />
        ) : (
          <div role="img" aria-label="Brand image unavailable" className="grid h-full place-items-center text-ink-tertiary">
            <Text size="md" weight="semibold">{initialsOf(brand.name)}</Text>
          </div>
        )}
      </div>
      {brand.notes ? <Text tone="secondary" className="whitespace-pre-wrap">{brand.notes}</Text> : null}
      {brand.categories.length > 0 ? (
        <div className="grid gap-1.5">
          <Text weight="semibold" size="sm">Categories</Text>
          <div className="flex flex-wrap gap-1.5">{brand.categories.map((category) => <Badge key={category.id}>{category.name}</Badge>)}</div>
        </div>
      ) : null}
      {brand.hashtags.length > 0 ? (
        <div className="grid gap-1.5">
          <Text weight="semibold" size="sm">Hashtags</Text>
          <Text tone="secondary" size="sm">{brand.hashtags.map((hashtag) => `#${hashtag.label}`).join("  ")}</Text>
        </div>
      ) : null}
      {brand.websiteCatalogue ? (
        <div className="grid gap-1.5">
          <Text weight="semibold" size="sm">From the brand&apos;s website</Text>
          <div className="flex flex-wrap gap-1.5">{brand.websiteCatalogue.offerings.map((offering) => <Badge key={offering}>{offering}</Badge>)}</div>
          <Text tone="secondary" size="sm">Read-only hints from public pages; not saved to Master Data.</Text>
        </div>
      ) : null}
      {brand.links.length > 0 ? (
        <div className="grid gap-1.5">
          <Text weight="semibold" size="sm">Resources</Text>
          <div className="flex flex-wrap gap-2">
            {brand.links.map((link) => {
              const Icon = LINK_ICONS[link.kind.trim().toUpperCase() as keyof typeof LINK_ICONS] ?? Globe2;
              return (
                <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-control border border-line px-3 text-sm text-action hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus">
                  <Icon aria-hidden="true" size={16} />
                  {linkLabel(link)}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Read-only Brand discovery over Master Data. The layout mirrors a catalogue without inventing product-only fields. */
export function LibraryDirectory({ brands }: { brands: LibraryBrand[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set());
  const [vendorIds, setVendorIds] = useState<Set<string>>(new Set());
  const [hashtags, setHashtags] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openBrandId, setOpenBrandId] = useState<string | null>(null);
  const openBrand = brands.find((brand) => brand.id === openBrandId) ?? null;
  // Hashtags are stored without "#", so a typed "#chair" must still find "chair".
  const q = query.trim().replace(/^#+/, "").toLowerCase();

  const filterOptions = useMemo(() => ({
    categories: [...new Map(brands.flatMap((brand) => brand.categories.map((category) => [category.id, { id: category.id, label: category.name }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label)),
    vendors: [...new Map(brands.flatMap((brand) => brand.ownerVendor ? [[brand.ownerVendor.id, { id: brand.ownerVendor.id, label: brand.ownerVendor.name }] as const] : [])).values()].sort((a, b) => a.label.localeCompare(b.label)),
    hashtags: [...new Map(brands.flatMap((brand) => brand.hashtags.map((hashtag) => [hashtag.normalized, { id: hashtag.normalized, label: `#${hashtag.label}` }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label)),
  }), [brands]);

  const rows = useMemo(() => {
    const matched: Array<{ brand: LibraryBrand; websiteMatch: string | null }> = [];
    for (const brand of brands) {
      const ownValues = [
        brand.name,
        ...brand.categories.map((category) => category.name),
        ...brand.hashtags.map((hashtag) => hashtag.label),
        ...(brand.ownerVendor ? [brand.ownerVendor.name] : []),
      ].map((value) => value.toLowerCase());
      const ownMatch = q === "" || ownValues.some((value) => value.includes(q));
      // Surface the website offering only when it is the sole reason the Brand matched.
      const websiteMatch = ownMatch ? null : (brand.websiteCatalogue?.offerings.find((offering) => offering.toLowerCase().includes(q)) ?? null);
      const matchesQuery = ownMatch || websiteMatch !== null;
      const matchesCategory = categoryIds.size === 0 || brand.categories.some((category) => categoryIds.has(category.id));
      const matchesVendor = vendorIds.size === 0 || (brand.ownerVendor ? vendorIds.has(brand.ownerVendor.id) : false);
      const matchesHashtag = hashtags.size === 0 || brand.hashtags.some((hashtag) => hashtags.has(hashtag.normalized));
      if (matchesQuery && matchesCategory && matchesVendor && matchesHashtag) matched.push({ brand, websiteMatch });
    }
    return matched.sort((a, b) => {
      if (sort === "name-desc") return b.brand.name.localeCompare(a.brand.name);
      if (sort === "vendor") return (a.brand.ownerVendor?.name ?? "").localeCompare(b.brand.ownerVendor?.name ?? "") || a.brand.name.localeCompare(b.brand.name);
      return a.brand.name.localeCompare(b.brand.name);
    });
  }, [brands, categoryIds, hashtags, q, sort, vendorIds]);
  const paging = usePagination(rows.length, PAGE_SIZE, JSON.stringify([q, [...categoryIds].sort(), [...vendorIds].sort(), [...hashtags].sort(), sort]));
  const visibleRows = rows.slice(paging.offset, paging.offset + PAGE_SIZE);

  const activeFilters = [
    ...filterOptions.categories.filter((option) => categoryIds.has(option.id)).map((option) => ({ key: `c:${option.id}`, label: option.label, remove: () => toggle(categoryIds, setCategoryIds, option.id) })),
    ...filterOptions.vendors.filter((option) => vendorIds.has(option.id)).map((option) => ({ key: `v:${option.id}`, label: option.label, remove: () => toggle(vendorIds, setVendorIds, option.id) })),
    ...filterOptions.hashtags.filter((option) => hashtags.has(option.id)).map((option) => ({ key: `h:${option.id}`, label: option.label, remove: () => toggle(hashtags, setHashtags, option.id) })),
  ];

  function toggle(current: Set<string>, setCurrent: (value: Set<string>) => void, id: string) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCurrent(next);
  }

  const clearFilters = () => {
    setCategoryIds(new Set());
    setVendorIds(new Set());
    setHashtags(new Set());
  };

  const filterPanel = (
    <Surface as="section" className="overflow-hidden" aria-label="Filters">
      <FilterSection title="Category" options={filterOptions.categories} selected={categoryIds} onToggle={(id) => toggle(categoryIds, setCategoryIds, id)} />
      <FilterSection title="Owner vendor" options={filterOptions.vendors} selected={vendorIds} onToggle={(id) => toggle(vendorIds, setVendorIds, id)} />
      <FilterSection title="Hashtag" options={filterOptions.hashtags} selected={hashtags} onToggle={(id) => toggle(hashtags, setHashtags, id)} />
    </Surface>
  );

  const toolbar = (
    <div className="grid gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <SearchField label="Search brands" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search brand, category, vendor, hashtag, or product…" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Text tone="secondary" size="sm" className="max-[420px]:sr-only">Sort</Text>
          <Select aria-label="Sort brands" density="compact" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="vendor">Owner vendor</option>
          </Select>
        </div>
      </div>
      <Button className="w-fit lg:hidden" leadingIcon={<SlidersHorizontal aria-hidden="true" />} onClick={() => setFiltersOpen(true)}>
        Filters{activeFilters.length > 0 ? <CountBadge>{activeFilters.length}</CountBadge> : null}
      </Button>
      {activeFilters.length > 0 ? (
        <FilterBar active onClear={clearFilters} className="w-fit max-w-full" aria-label="Active filters">
          {activeFilters.map((filter) => <FilterChip key={filter.key} selected onClick={filter.remove} title="Remove filter">{filter.label}</FilterChip>)}
        </FilterBar>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-x-6">
        <Text weight="semibold" className="hidden self-center lg:block">Filter</Text>
        {toolbar}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-4 lg:block" aria-label="Library filters">
          {filterPanel}
        </aside>
        <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} side="left" size="sm" title="Filters" footer={<Button variant="primary" onClick={() => setFiltersOpen(false)}>Show {rows.length} brands</Button>}>
          {filterPanel}
        </Drawer>
        <Dialog open={openBrand !== null} onOpenChange={(open) => { if (!open) setOpenBrandId(null); }} size="md" title={openBrand?.name ?? ""} description={openBrand?.ownerVendor?.name}>
          {openBrand ? <BrandDetail brand={openBrand} /> : null}
        </Dialog>
        <section className="min-w-0" aria-label="Brand catalogue">
          <DirectoryShell
            pagination={
              <div className="grid gap-3">
                <Text tone="secondary" size="sm" role="status">
                  {rows.length ? `${paging.offset + 1}–${Math.min(paging.offset + PAGE_SIZE, rows.length)} of ${rows.length}` : "0"} brands
                </Text>
                {rows.length > PAGE_SIZE ? <Pagination page={paging.page} pageCount={paging.pageCount} onPageChange={paging.setPage} label="Brand pages" /> : null}
              </div>
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                title={brands.length === 0 ? "No brands in Master Data yet" : "No brands match"}
                action={brands.length > 0 && (activeFilters.length > 0 || q !== "") ? <Button onClick={() => { clearFilters(); setQuery(""); }}>Clear search and filters</Button> : undefined}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleRows.map(({ brand, websiteMatch }) => <BrandCard key={brand.id} brand={brand} websiteMatch={websiteMatch} onOpen={() => setOpenBrandId(brand.id)} />)}
              </div>
            )}
          </DirectoryShell>
        </section>
      </div>
    </div>
  );
}
