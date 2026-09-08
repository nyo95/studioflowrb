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

export default async function StudioFlowClientsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Klien" />
        <SectionCard>
          <EmptyState
            icon={Users}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat klien."
          />
        </SectionCard>
      </div>
    );
  }

  const clients = await studioFlowService.listClients(grants);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Klien"
        description="Daftar klien studio"
        actions={
          <Link href="/studioflow/clients/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} aria-hidden="true" /> Klien baru
          </Link>
        }
      />
      {clients.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Users}
            title="Belum ada klien"
            description="Tambahkan klien pertama studio."
          />
        </SectionCard>
      ) : (
        <DirectoryShell surface fill>
          <DataTable framed={false} density="compact" stickyHeader fill minWidth={560}>
            <TableHeader>
              <TableRow>
                <TableHead>Klien</TableHead>
                <TableHead>Kontak</TableHead>
                <TableHead>Telepon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={client.deleted_at ? "danger" : "neutral"}
                      statusLabel={client.deleted_at ? "Diarsipkan" : ""}
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
        </DirectoryShell>
      )}
    </div>
  );
}
