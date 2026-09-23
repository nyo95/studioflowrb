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
      <DataTable minWidth={760}>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Owner vendor</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Links</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>
                <EmptyState title={brands.length === 0 ? "No brands in Master Data yet" : "No brands match"} />
              </TableCell>
            </TableRow>
          ) : rows.map((brand) => (
            <TableRow key={brand.id}>
              <TableCell>
                <div className="grid gap-1 py-1">
                  <Text weight="medium">{brand.name}</Text>
                  {brand.notes ? <Text tone="tertiary" size="sm" className="whitespace-pre-wrap">{brand.notes}</Text> : null}
                  {brand.hashtags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {brand.hashtags.map((hashtag) => <Badge key={hashtag.id}>#{hashtag.label}</Badge>)}
                    </div>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>{brand.ownerVendor?.name ?? <Text tone="tertiary">—</Text>}</TableCell>
              <TableCell>
                {brand.categories.length === 0 ? <Text tone="tertiary">—</Text> : (
                  <div className="flex flex-wrap gap-1">
                    {brand.categories.map((category) => <Badge key={category.id}>{category.name}</Badge>)}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {brand.links.length === 0 ? <Text tone="tertiary">—</Text> : (
                  <div className="grid gap-0.5">
                    {brand.links.map((link) => (
                      <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="text-sm text-ink-secondary hover:text-ink hover:underline">
                        {link.label ?? link.kind}
                      </a>
                    ))}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );
}
