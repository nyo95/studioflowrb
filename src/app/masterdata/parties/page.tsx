import Link from "next/link";
import { Users } from "lucide-react";

import { partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
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

import { deletePartyAction, restorePartyAction } from "./actions";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";
  const parties = await partyService.list(CTX, { includeDeleted: showDeleted });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Master Data"
        title="Parties"
        description="Suppliers, vendors, and other business entities."
        actions={
          <Link href="/masterdata/parties/new" className="ui-button" data-variant="primary" data-size="md">
            <span>New party</span>
          </Link>
        }
      />

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <Link href={`/masterdata/parties${showDeleted ? "" : "?deleted=1"}`} className="ui-button" data-variant="secondary" data-size="sm">
          <span>{showDeleted ? "Hide archived" : "Show archived"}</span>
        </Link>
      </div>

      <DataTable>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
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
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {!p.deletedAt && (
                      <Link href={`/masterdata/parties/${p.id}/edit`} className="ui-button" data-variant="ghost" data-size="sm"><span>Edit</span></Link>
                    )}
                    {p.deletedAt ? (
                      <form action={restorePartyAction.bind(null, p.id)}>
                        <button type="submit" className="ui-button" data-variant="ghost" data-size="sm"><span>Restore</span></button>
                      </form>
                    ) : (
                      <form action={deletePartyAction.bind(null, p.id)}>
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
