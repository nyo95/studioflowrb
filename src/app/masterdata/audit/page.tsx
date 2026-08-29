import {
  DataTable,
  PageHeader,
  PageShell,
  SectionCard,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
} from "@/platform/ui_engine";
import { auditQueryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import { SortableTableHead } from "../sortable-table-head";

/**
 * Development execution context.
 * Replaced by the real request identity during locked Foundation F0.
 */
const DEV_CONTEXT = MASTER_DATA_REQUEST_CONTEXT;

type Props = {
  searchParams: Promise<{ entity?: string; action?: string; limit?: string; sort?: string; dir?: string }>;
};

export const metadata = { title: "Audit log — Master Data" };

export default async function AuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const entityType = params.entity ?? undefined;
  const action = params.action ?? undefined;
  const limit = Math.min(parseInt(params.limit ?? "100", 10) || 100, 500);

  const sort = params.sort ?? "occurred"; const direction = params.dir === "asc" ? 1 : -1;
  const events = (await auditQueryService.list(DEV_CONTEXT, {
    entityType,
    action,
    limit,
  })).toSorted((a, b) => direction * String(sort === "action" ? a.action : sort === "entity" ? a.entityType : sort === "id" ? a.entityId : sort === "actor" ? a.actorLabel : a.occurredAt.toISOString()).localeCompare(String(sort === "action" ? b.action : sort === "entity" ? b.entityType : sort === "id" ? b.entityId : sort === "actor" ? b.actorLabel : b.occurredAt.toISOString()), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Audit log"
        description="Append-only record of every mutation in the Master Data application."
      />

      <SectionCard>
        <TableToolbar />
        <DataTable aria-label="Audit events">
          <TableHeader>
            <TableRow>
              <SortableTableHead column="occurred">Occurred at</SortableTableHead>
              <SortableTableHead column="action">Action</SortableTableHead>
              <SortableTableHead column="entity">Entity</SortableTableHead>
              <SortableTableHead column="id">Entity ID</SortableTableHead>
              <SortableTableHead column="actor">Actor</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Text tone="secondary" as="span">No audit events found.</Text>
                </TableCell>
              </TableRow>
            )}
            {events.map((ev) => (
              <TableRow key={ev.id}>
                <TableCell>
                  <TableCellContent
                    primary={ev.occurredAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                  />
                </TableCell>
                <TableCell>
                  <TableCellContent primary={ev.action} />
                </TableCell>
                <TableCell>
                  <TableCellContent primary={ev.entityType} />
                </TableCell>
                <TableCell>
                  <TableCellContent primary={ev.entityId} secondary="UUID" />
                </TableCell>
                <TableCell>
                  <TableCellContent
                    primary={ev.actorLabel}
                    secondary={ev.actorUserId ?? ev.actorKind}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </SectionCard>
    </PageShell>
  );
}
