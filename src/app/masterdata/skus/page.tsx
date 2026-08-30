import Link from "next/link";
import { skuService } from "@/apps/masterdata/infrastructure/runtime";
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
import { activateSkuAction, discontinueSkuAction, deleteSkuAction, restoreSkuAction } from "./actions";
import { SortableTableHead } from "../sortable-table-head";


export default async function SkusPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; sort?: string; dir?: string }>;
}) {
  const { archived, sort = "name", dir } = await searchParams;
  const showArchived = archived === "1";

  const direction = dir === "desc" ? -1 : 1;
  const skus = (await skuService.list((await requireMasterDataRequestContext()), { includeDeleted: showArchived })).toSorted((a, b) => direction * String(sort === "code" ? a.code ?? "" : sort === "kind" ? a.kind : sort === "status" ? a.status : a.name).localeCompare(String(sort === "code" ? b.code ?? "" : sort === "kind" ? b.kind : sort === "status" ? b.status : b.name), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        title="SKUs"
        description="Materials, furniture, and fixtures with pricing."
        actions={
          <Link href="/masterdata/skus/new" className={buttonClasses("primary", "md")}>
            <span>New SKU</span>
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link
          href="/masterdata/skus"
          className={buttonClasses(showArchived ? "secondary" : "primary", "sm")}
        >
          <span>Active</span>
        </Link>
        <Link
          href="/masterdata/skus?archived=1"
          className={buttonClasses(showArchived ? "primary" : "secondary", "sm")}
        >
          <span>Archived</span>
        </Link>
      </div>

      <DataTable state={skus.length === 0 ? <EmptyState title="No SKUs found." /> : undefined}>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="name">Name</SortableTableHead>
            <SortableTableHead column="code">Code</SortableTableHead>
            <SortableTableHead column="kind">Kind</SortableTableHead>
            <SortableTableHead column="status">Status</SortableTableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.map((sku) => (
            <TableRow key={sku.id}>
              <TableCell>
                <TableCellContent primary={sku.name} secondary={sku.slug} />
              </TableCell>
              <TableCell>
                <Text tone="secondary">{sku.code ?? "—"}</Text>
              </TableCell>
              <TableCell>
                <Badge>{sku.kind}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  tone={
                    sku.deletedAt
                      ? "neutral"
                      : sku.status === "ACTIVE"
                      ? "success"
                      : sku.status === "DISCONTINUED"
                      ? "warning"
                      : "neutral"
                  }
                >
                  {sku.deletedAt ? "Archived" : sku.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  {!sku.deletedAt && (
                    <Link href={`/masterdata/skus/${sku.id}/edit`} className={buttonClasses("secondary", "sm")}>
                      <span>Edit</span>
                    </Link>
                  )}
                  {!sku.deletedAt && sku.status === "DRAFT" && (
                    <form action={activateSkuAction.bind(null, sku.id)}>
                      <Button type="submit" variant="secondary" size="sm">Activate</Button>
                    </form>
                  )}
                  {!sku.deletedAt && sku.status === "ACTIVE" && (
                    <form action={discontinueSkuAction.bind(null, sku.id)}>
                      <Button type="submit" variant="secondary" size="sm">Discontinue</Button>
                    </form>
                  )}
                  {!sku.deletedAt && sku.status === "DISCONTINUED" && (
                    <form action={activateSkuAction.bind(null, sku.id)}>
                      <Button type="submit" variant="secondary" size="sm">Reactivate</Button>
                    </form>
                  )}
                  {!sku.deletedAt && (
                    <form action={deleteSkuAction.bind(null, sku.id)}>
                      <Button type="submit" variant="danger" size="sm">Archive</Button>
                    </form>
                  )}
                  {sku.deletedAt && (
                    <form action={restoreSkuAction.bind(null, sku.id)}>
                      <Button type="submit" variant="secondary" size="sm">Restore</Button>
                    </form>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </PageShell>
  );
}
