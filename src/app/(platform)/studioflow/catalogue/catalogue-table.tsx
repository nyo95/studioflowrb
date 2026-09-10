"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable, EntityPrimaryCell, Pagination, TableBody, TableCell, TableHead, TableHeader, TableRow, usePagination, type SortDirection } from "@/platform/ui_engine";

export type CatalogueRow = { id: string; product_name: string; brand_name: string | null; colour: string | null; finishing: string | null; unit: string | null; deleted_at: Date | null; updated_at: Date };

export function CatalogueTable({ products }: { products: CatalogueRow[] }) {
  const [sort, setSort] = useState<{ key: "product" | "brand" | "updated"; direction: SortDirection }>({ key: "product", direction: "asc" });
  const ordered = useMemo(() => [...products].sort((left, right) => {
    const first = sort.key === "product" ? left.product_name : sort.key === "brand" ? left.brand_name ?? "" : left.updated_at.toISOString();
    const second = sort.key === "product" ? right.product_name : sort.key === "brand" ? right.brand_name ?? "" : right.updated_at.toISOString();
    const result = first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" }) || left.id.localeCompare(right.id);
    return sort.direction === "asc" ? result : -result;
  }), [products, sort]);
  const pageSize = 25;
  const paging = usePagination(ordered.length, pageSize, `${products.length}:${sort.key}:${sort.direction}`);
  const pageRows = ordered.slice(paging.offset, paging.offset + pageSize);
  const changeSort = (key: typeof sort.key, direction: SortDirection) => { setSort({ key, direction }); paging.setPage(1); };

  return <><DataTable framed={false} density="compact" stickyHeader fill minWidth={760}>
    <TableHeader><TableRow>
      <TableHead sortable sortDirection={sort.key === "product" ? sort.direction : null} onSortChange={(direction) => changeSort("product", direction)} sortLabel={(direction) => `Sort product ${direction}`}>Product</TableHead>
      <TableHead sortable sortDirection={sort.key === "brand" ? sort.direction : null} onSortChange={(direction) => changeSort("brand", direction)} sortLabel={(direction) => `Sort brand ${direction}`}>Brand</TableHead>
      <TableHead>Colour</TableHead><TableHead>Finishing</TableHead><TableHead>Unit</TableHead>
      <TableHead sortable sortDirection={sort.key === "updated" ? sort.direction : null} onSortChange={(direction) => changeSort("updated", direction)} sortLabel={(direction) => `Sort updated date ${direction}`}>Updated</TableHead>
    </TableRow></TableHeader>
    <TableBody>{pageRows.map((product) => <TableRow key={product.id}><TableCell><EntityPrimaryCell tone={product.deleted_at ? "danger" : "success"} statusLabel={product.deleted_at ? "Archived" : "Active"} name={<Link href={`/studioflow/catalogue/${product.id}`} className="font-medium text-action hover:underline">{product.product_name}</Link>} /></TableCell><TableCell>{product.brand_name ?? "—"}</TableCell><TableCell>{product.colour ?? "—"}</TableCell><TableCell>{product.finishing ?? "—"}</TableCell><TableCell>{product.unit ?? "—"}</TableCell><TableCell>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(product.updated_at)}</TableCell></TableRow>)}</TableBody>
  </DataTable><Pagination page={paging.page} pageCount={paging.pageCount} total={ordered.length} pageSize={pageSize} onPageChange={paging.setPage} label="Catalogue pages" /></>;
}
