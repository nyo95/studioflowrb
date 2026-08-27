import Link from "next/link";
import { Tag } from "lucide-react";

import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import {
  Badge,
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
} from "@/platform/ui_engine";

import { deleteBrandAction, restoreBrandAction } from "./actions";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";
  const brands = await brandService.list(CTX, { includeDeleted: showDeleted });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Brands"
        description="Brand identities with explicit category associations. Brand creation requires at least one live PRODUCT category."
        actions={
          <Link href="/masterdata/brands/new" className="ui-button" data-variant="primary" data-size="md">
            <span>New brand</span>
          </Link>
        }
      />

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <Link href={`/masterdata/brands${showDeleted ? "" : "?deleted=1"}`} className="ui-button" data-variant="secondary" data-size="sm">
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Suppliers</TableHead>
            <TableHead>Status</TableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {brands.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Tag} title="No brands" />
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
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {!b.deletedAt && (
                      <Link href={`/masterdata/brands/${b.id}/edit`} className="ui-button" data-variant="ghost" data-size="sm"><span>Edit</span></Link>
                    )}
                    {b.deletedAt ? (
                      <form action={restoreBrandAction.bind(null, b.id)}>
                        <button type="submit" className="ui-button" data-variant="ghost" data-size="sm"><span>Restore</span></button>
                      </form>
                    ) : (
                      <form action={deleteBrandAction.bind(null, b.id)}>
                        <button type="submit" className="ui-button" data-variant="danger" data-size="sm"><span>Archive</span></button>
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
