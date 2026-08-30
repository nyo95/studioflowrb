import Link from "next/link";
import { Users } from "lucide-react";

import { partyService } from "@/apps/masterdata/infrastructure/runtime";
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

import { deletePartyAction, restorePartyAction } from "./actions";
import { SortableTableHead } from "../sortable-table-head";


export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";
  const sort = typeof sp["sort"] === "string" ? sp["sort"] : "name"; const direction = sp["dir"] === "desc" ? -1 : 1;
  const parties = (await partyService.list((await requireMasterDataRequestContext()), { includeDeleted: showDeleted })).toSorted((a, b) => direction * String(sort === "type" ? a.type : sort === "roles" ? a.roles.join(" ") : sort === "status" ? Boolean(a.deletedAt) : a.name).localeCompare(String(sort === "type" ? b.type : sort === "roles" ? b.roles.join(" ") : sort === "status" ? Boolean(b.deletedAt) : b.name), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Parties"
        description="Suppliers, vendors, and other business entities."
        actions={
          <Link href="/masterdata/parties/new" className={buttonClasses("primary", "md")}>
            <span>New party</span>
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/masterdata/parties${showDeleted ? "" : "?deleted=1"}`} className={buttonClasses("secondary", "sm")}>
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="name">Name</SortableTableHead>
            <SortableTableHead column="type">Type</SortableTableHead>
            <SortableTableHead column="roles">Roles</SortableTableHead>
            <SortableTableHead column="status">Status</SortableTableHead>
            <TableHead aria-label="Actions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {parties.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={Users} title="No parties" />
              </TableCell>
            </TableRow>
          ) : (
            parties.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <TableCellContent primary={p.name} secondary={p.legalName ?? p.slug} />
                </TableCell>
                <TableCell>
                  <Text as="span" size="sm">{p.type}</Text>
                </TableCell>
                <TableCell>
                  <Text as="span" size="sm">{p.roles.join(", ") || "—"}</Text>
                </TableCell>
                <TableCell>
                  <Badge tone={p.deletedAt ? "warning" : "success"}>{p.deletedAt ? "Archived" : "Active"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {!p.deletedAt && (
                      <Link href={`/masterdata/parties/${p.id}/edit`} className={buttonClasses("ghost", "sm")}><span>Edit</span></Link>
                    )}
                    {p.deletedAt ? (
                      <form action={restorePartyAction.bind(null, p.id)}>
                        <Button type="submit" variant="ghost" size="sm">Restore</Button>
                      </form>
                    ) : (
                      <form action={deletePartyAction.bind(null, p.id)}>
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
