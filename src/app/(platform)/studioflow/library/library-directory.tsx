"use client";

import { useState } from "react";

import {
  Badge,
  DataTable,
  EmptyState,
  SearchField,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
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
};

/** Read-only Brand discovery over Master Data (owner, 2026-09-23). Filters client-side — the catalog is small enough not to need a server round trip per keystroke. */
export function LibraryDirectory({ brands }: { brands: LibraryBrand[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = q === "" ? brands : brands.filter((brand) =>
    brand.name.toLowerCase().includes(q)
    || brand.categories.some((category) => category.name.toLowerCase().includes(q))
    || brand.hashtags.some((hashtag) => hashtag.label.toLowerCase().includes(q))
    || (brand.ownerVendor?.name.toLowerCase().includes(q) ?? false),
  );

  return (
    <div className="grid gap-3">
      <TableToolbar search={<SearchField value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search brand, category, vendor, or hashtag…" />} />
      {rows.length === 0 ? <EmptyState title={brands.length === 0 ? "No brands in Master Data yet" : "No brands match"} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((brand) => {
            const initials = brand.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
            return (
              <article key={brand.id} className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
                <div className="relative aspect-[16/9] overflow-hidden bg-surface-muted">
                  {brand.imageUrl ? (
                    // External website metadata is not a fixed image host, so Next Image optimization is intentionally skipped.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.imageUrl} alt={`${brand.name} logo`} className="h-full w-full object-contain p-8" />
                  ) : (
                    <div role="img" className="grid h-full place-items-center bg-gradient-to-br from-action/15 via-surface-muted to-surface text-4xl font-semibold tracking-[0.2em] text-action/70" aria-label="Brand image unavailable">
                      {initials || "?"}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 p-4">
                  <div className="grid gap-1">
                    <Text weight="medium" size="md">{brand.name}</Text>
                    {brand.ownerVendor ? <Text tone="tertiary" size="sm">Owner vendor: {brand.ownerVendor.name}</Text> : null}
                  </div>
                  {brand.notes ? <Text tone="secondary" size="sm" className="line-clamp-3 whitespace-pre-wrap">{brand.notes}</Text> : null}
                  {brand.categories.length > 0 || brand.hashtags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {brand.categories.map((category) => <Badge key={category.id}>{category.name}</Badge>)}
                      {brand.hashtags.map((hashtag) => <Badge key={hashtag.id}>#{hashtag.label}</Badge>)}
                    </div>
                  ) : null}
                  {brand.links.length > 0 ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
                      {brand.links.map((link) => (
                        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-action hover:underline">
                          {link.label ?? link.kind}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
