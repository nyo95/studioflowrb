import Link from "next/link";
import { Ruler } from "lucide-react";

import { unitService } from "@/apps/masterdata/infrastructure/runtime";
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

import { deleteUnitAction, restoreUnitAction } from "./actions";
import { SortableTableHead } from "../../sortable-table-head";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";
  const sort = typeof sp["sort"] === "string" ? sp["sort"] : "code"; const direction = sp["dir"] === "desc" ? -1 : 1;
  const units = (await unitService.list(CTX, { includeDeleted: showDeleted })).toSorted((a, b) => direction * String(sort === "symbol" ? a.symbol ?? "" : sort === "usages" ? a.usages.join(" ") : sort === "status" ? Boolean(a.deletedAt) : a.code).localeCompare(String(sort === "symbol" ? b.symbol ?? "" : sort === "usages" ? b.usages.join(" ") : sort === "status" ? Boolean(b.deletedAt) : b.code), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Units"
        description="Controlled unit dictionary — codes and usages are locked after creation."
        actions={
          <Link href="/masterdata/settings/units/new" className="ui-button" data-variant="primary" data-size="md">
            <span>New unit</span>
          </Link>
        }
      />

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <Link href={`/masterdata/settings/units${showDeleted ? "" : "?deleted=1"}`} className="ui-button" data-variant="secondary" data-size="sm">
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="code">Code / Label</SortableTableHead>
            <SortableTableHead column="symbol">Symbol</SortableTableHead>
            <SortableTableHead column="usages">Usages</SortableTableHead>
            <SortableTableHead column="status">Status</SortableTableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Ruler} title="No units" />
              </TableCell>
            </TableRow>
          ) : (
            units.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <TableCellContent primary={u.code} secondary={u.label} />
                </TableCell>
                <TableCell>
                  <Text as="span" tone="secondary" size="sm">{u.symbol ?? "—"}</Text>
                </TableCell>
                <TableCell>
                  <Text as="span" size="sm">{u.usages.join(", ") || "—"}</Text>
                </TableCell>
                <TableCell>
                  <Badge tone={u.deletedAt ? "warning" : "success"}>{u.deletedAt ? "Archived" : "Active"}</Badge>
                </TableCell>
                <TableCell>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {!u.deletedAt && (
                      <Link href={`/masterdata/settings/units/${u.id}/edit`} className="ui-button" data-variant="ghost" data-size="sm"><span>Edit</span></Link>
                    )}
                    {u.deletedAt ? (
                      <form action={restoreUnitAction.bind(null, u.id)}>
                        <button type="submit" className="ui-button" data-variant="ghost" data-size="sm"><span>Restore</span></button>
                      </form>
                    ) : (
                      <form action={deleteUnitAction.bind(null, u.id)}>
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
