"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TableHead, type SortDirection, type TableHeadProps } from "@/platform/ui_engine";

export function SortableTableHead({ column, children, ...props }: Omit<TableHeadProps, "sortable" | "sortDirection" | "onSortChange"> & { column: string }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const active = params.get("sort") === column;
  const direction = active && params.get("dir") === "desc" ? "desc" : active ? "asc" : null;
  function update(next: SortDirection) {
    const query = new URLSearchParams(params.toString()); query.set("sort", column); query.set("dir", next);
    router.replace(`${pathname}?${query}`, { scroll: false });
  }
  return <TableHead sortable sortDirection={direction} onSortChange={update} sortLabel={(next) => `${String(children)}, sort ${next === "asc" ? "ascending" : "descending"}`} {...props}>{children}</TableHead>;
}
