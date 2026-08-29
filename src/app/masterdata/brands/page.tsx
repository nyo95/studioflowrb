import Link from "next/link";
import { Tag } from "lucide-react";

import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  PageShell,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  buttonClasses,
} from "@/platform/ui_engine";

import { deleteBrandAction, restoreBrandAction } from "./actions";
import { SortableTableHead } from "../sortable-table-head";


export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";
  const query = typeof sp["q"] === "string" ? sp["q"].trim() : "";
  const sort = typeof sp["sort"] === "string" ? sp["sort"] : "name"; const direction = sp["dir"] === "desc" ? -1 : 1;
  const brands = (await brandService.list((await requireMasterDataRequestContext()), { includeDeleted: showDeleted, query: query || undefined })).toSorted((a, b) => direction * String(sort === "categories" ? a.categories.length : sort === "suppliers" ? a.suppliers.length : sort === "status" ? Boolean(a.deletedAt) : a.name).localeCompare(String(sort === "categories" ? b.categories.length : sort === "suppliers" ? b.suppliers.length : sort === "status" ? Boolean(b.deletedAt) : b.name), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Brands"
        description="Brand identities with explicit category associations. Brand creation requires at least one live PRODUCT category."
        actions={
          <Link href="/masterdata/brands/new" className={buttonClasses("primary", "md")}>
            <span>New brand</span>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/masterdata/brands?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(showDeleted ? {} : { deleted: "1" }) })}`} className={buttonClasses("secondary", "sm")}>
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="name">Name</SortableTableHead>
            <SortableTableHead column="categories">Categories</SortableTableHead>
            <SortableTableHead column="suppliers">Suppliers</SortableTableHead>
            <SortableTableHead column="status">Status</SortableTableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {brands.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Tag} title={query ? `No brands match “${query}”` : "No brands"} />
              </TableCell>
            </TableRow>
          ) : (
            brands.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <TableCellContent primary={b.name} secondary={b.slug} />
                </TableCell>
                <TableCell>
                  <Text as="span" size="sm">{b.categories.length} categor{b.categories.length === 1 ? "y" : "ies"}</Text>
                </TableCell>
                <TableCell>
                  <Text as="span" size="sm">{b.suppliers.length} supplier{b.suppliers.length !== 1 ? "s" : ""}</Text>
                </TableCell>
                <TableCell>
                  <Badge tone={b.deletedAt ? "warning" : "success"}>{b.deletedAt ? "Archived" : "Active"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {!b.deletedAt && (
                      <Link href={`/masterdata/brands/${b.id}/edit`} className={buttonClasses("ghost", "sm")}><span>Edit</span></Link>
                    )}
                    {b.deletedAt ? (
                      <form action={restoreBrandAction.bind(null, b.id)}>
                        <Button type="submit" variant="ghost" size="sm">Restore</Button>
                      </form>
                    ) : (
                      <form action={deleteBrandAction.bind(null, b.id)}>
                        <Button type="submit" variant="danger" size="sm">Archive</Button>
                      </form>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
    </PageShell>
  );
}
