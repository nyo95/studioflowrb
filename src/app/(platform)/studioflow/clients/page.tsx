import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  buttonClasses,
  DataTable,
  DirectoryShell,
  EmptyState,
  EntityPrimaryCell,
  PageHeader,
  Pagination,
  SectionCard,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

export const dynamic = "force-dynamic";

/** Rows per page, matching the projects directory. */
const PAGE_SIZE = 25;

export default async function StudioFlowClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Clients" divider />
        <SectionCard>
          <EmptyState
            icon={Users}
            title="Access denied"
            description="You do not have permission to view clients."
          />
        </SectionCard>
      </>
    );
  }

  const rawPage = (await searchParams).page;
  const parsed = Number.parseInt(Array.isArray(rawPage) ? (rawPage[0] ?? "") : (rawPage ?? ""), 10);
  const requestedPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  const clients = await studioFlowService.listClients(grants);
  const pageCount = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageClients = clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow"
        title="Clients"
        description="Studio client directory"
        divider
        actions={
          <Link href="/studioflow/clients/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} aria-hidden="true" /> New client
          </Link>
        }
      />
      <DirectoryShell
        surface
        fill
        pagination={
          <Pagination
            page={page}
            pageCount={pageCount}
            total={clients.length}
            pageSize={PAGE_SIZE}
            getHref={(nextPage) => (nextPage > 1 ? `/studioflow/clients?page=${nextPage}` : "/studioflow/clients")}
            label="Client pages"
          />
        }
      >
        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add the studio's first client."
          />
        ) : (
          <DataTable framed={false} density="compact" stickyHeader fill minWidth={560}>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={client.deleted_at ? "danger" : "success"}
                      statusLabel={client.deleted_at ? "Archived" : "Active"}
                      name={
                        <Link
                          href={`/studioflow/clients/${client.id}`}
                          className="font-medium text-action hover:underline"
                        >
                          {client.name}
                        </Link>
                      }
                    />
                  </TableCell>
                  <TableCell>{client.contact_name ?? "—"}</TableCell>
                  <TableCell>{client.contact_phone ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        )}
      </DirectoryShell>
    </>
  );
}
