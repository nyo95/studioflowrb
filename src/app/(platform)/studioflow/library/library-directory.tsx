"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Badge,
  Checkbox,
  EmptyState,
  SearchField,
  Select,
  Surface,
  Tabs,
  Text,
  initialsOf,
} from "@/platform/ui_engine";
import { expandLibrarySearchTerms, relatedLibraryTerms } from "@/apps/studioflow/library/semantic-terms";

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
};

type FilterOption = { id: string; label: string };

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

function BrandCard({ brand }: { brand: LibraryBrand }) {
  const semanticHints = [...new Set(brand.hashtags.flatMap((hashtag) => relatedLibraryTerms(hashtag.label)))];

  return (
    <Surface as="article" className="overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
        {brand.imageUrl ? (
          // External website metadata is not a fixed image host, so Next Image optimization is intentionally skipped.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.imageUrl} alt={`${brand.name} logo`} className="h-full w-full object-contain p-6" />
        ) : (
          <div role="img" aria-label="Brand image unavailable" className="grid h-full place-items-center text-ink-tertiary">
            <Text size="md" weight="semibold">{initialsOf(brand.name)}</Text>
          </div>
        )}
      </div>
      <div className="grid gap-3 p-3">
        <div className="grid gap-1">
          <Text weight="semibold">{brand.name}</Text>
          {brand.ownerVendor ? <Text tone="secondary" size="sm">{brand.ownerVendor.name}</Text> : null}
        </div>
        {brand.notes ? <Text tone="secondary" size="sm" className="line-clamp-3 whitespace-pre-wrap">{brand.notes}</Text> : null}
        {brand.categories.length > 0 || brand.hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {brand.categories.map((category) => <Badge key={category.id}>{category.name}</Badge>)}
            {brand.hashtags.map((hashtag) => <Badge key={hashtag.id}>#{hashtag.label}</Badge>)}
          </div>
        ) : null}
        {semanticHints.length > 0 ? (
          <div className="grid gap-1">
            <Text tone="secondary" size="sm">Related terms</Text>
            <div className="flex flex-wrap gap-1.5">
              {semanticHints.map((term) => <Badge key={term}>{term}</Badge>)}
            </div>
          </div>
        ) : null}
        {brand.links.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line-subtle pt-3">
            {brand.links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-action hover:underline">
                {link.label ?? link.kind}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

/** Read-only Brand discovery over Master Data. The layout mirrors a catalogue without inventing product-only fields. */
export function LibraryDirectory({ brands }: { brands: LibraryBrand[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [categoryIds, setCategoryIds] = useState<Set<string>>(new Set());
  const [vendorIds, setVendorIds] = useState<Set<string>>(new Set());
  const [hashtags, setHashtags] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const searchTerms = useMemo(() => expandLibrarySearchTerms(q), [q]);

  const filterOptions = useMemo(() => ({
    categories: [...new Map(brands.flatMap((brand) => brand.categories.map((category) => [category.id, { id: category.id, label: category.name }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label)),
    vendors: [...new Map(brands.flatMap((brand) => brand.ownerVendor ? [[brand.ownerVendor.id, { id: brand.ownerVendor.id, label: brand.ownerVendor.name }] as const] : [])).values()].sort((a, b) => a.label.localeCompare(b.label)),
    hashtags: [...new Map(brands.flatMap((brand) => brand.hashtags.map((hashtag) => [hashtag.normalized, { id: hashtag.normalized, label: `#${hashtag.label}` }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label)),
  }), [brands]);

  const rows = useMemo(() => {
    const filtered = brands.filter((brand) => {
      const searchableValues = [
        brand.name,
        ...brand.categories.map((category) => category.name),
        ...brand.hashtags.map((hashtag) => hashtag.label),
        ...(brand.ownerVendor ? [brand.ownerVendor.name] : []),
      ].map((value) => value.toLowerCase());
      const matchesQuery = searchTerms.length === 0 || searchTerms.some((term) => searchableValues.some((value) => value.includes(term)));
      const matchesCategory = categoryIds.size === 0 || brand.categories.some((category) => categoryIds.has(category.id));
      const matchesVendor = vendorIds.size === 0 || (brand.ownerVendor ? vendorIds.has(brand.ownerVendor.id) : false);
      const matchesHashtag = hashtags.size === 0 || brand.hashtags.some((hashtag) => hashtags.has(hashtag.normalized));
      return matchesQuery && matchesCategory && matchesVendor && matchesHashtag;
    });
    return filtered.sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "vendor") return (a.ownerVendor?.name ?? "").localeCompare(b.ownerVendor?.name ?? "") || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [brands, categoryIds, hashtags, q, sort, vendorIds]);

  const toggle = (current: Set<string>, setCurrent: (value: Set<string>) => void, id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCurrent(next);
  };

  const content = (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text tone="secondary" size="sm">Showing {rows.length ? `1–${rows.length}` : "0"} of {brands.length} brands</Text>
        <div className="flex items-center gap-2">
          <Text tone="secondary" size="sm">Sort</Text>
          <Select aria-label="Sort brands" density="compact" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
            <option value="vendor">Owner vendor</option>
          </Select>
        </div>
      </div>
      {rows.length === 0 ? <EmptyState title={brands.length === 0 ? "No brands in Master Data yet" : "No brands match"} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((brand) => <BrandCard key={brand.id} brand={brand} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="grid gap-3 lg:sticky lg:top-4">
        <Text weight="semibold">Filter</Text>
        <Surface as="section" className="overflow-hidden">
          <FilterSection title="Category" options={filterOptions.categories} selected={categoryIds} onToggle={(id) => toggle(categoryIds, setCategoryIds, id)} />
          <FilterSection title="Owner vendor" options={filterOptions.vendors} selected={vendorIds} onToggle={(id) => toggle(vendorIds, setVendorIds, id)} />
          <FilterSection title="Hashtag" options={filterOptions.hashtags} selected={hashtags} onToggle={(id) => toggle(hashtags, setHashtags, id)} />
        </Surface>
      </aside>
      <section className="grid min-w-0 gap-4" aria-label="Brand catalogue">
        <SearchField label="Search brands" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search brand, category, vendor, or hashtag…" />
        <Tabs label="Library views" items={[{ value: "brands", label: "Brands", content }]} />
      </section>
    </div>
  );
}
