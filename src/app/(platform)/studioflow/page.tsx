import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
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

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  ON_HOLD: "Ditahan",
  COMPLETED: "Selesai",
};

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residensial",
  COMMERCIAL: "Komersial",
  HOSPITALITY: "Hospitality",
  OTHER: "Lainnya",
};

export default async function StudioFlowProjectsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Projects" />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat project."
          />
        </SectionCard>
      </div>
    );
  }

  const [projects, settings] = await Promise.all([
    studioFlowService.listProjects(grants),
    readPlatformGeneralSettings(prisma),
  ]);

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Projects"
        description="Project desain aktif studio"
        actions={
          canManage ? (
            <Link href="/studioflow/new" className={buttonClasses("primary", "md")}>
              <Plus size={16} aria-hidden="true" /> Project baru
            </Link>
          ) : null
        }
      />
      {projects.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Belum ada project"
            description={canManage ? "Buat project pertama studio." : "Belum ada project aktif."}
          />
        </SectionCard>
      ) : (
        <DirectoryShell surface fill>
          <DataTable framed={false} density="compact" stickyHeader fill minWidth={700}>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Klien</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Dibuka</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <EntityPrimaryCell
                      tone={
                        project.status === "ACTIVE"
                          ? "success"
                          : project.status === "COMPLETED"
                            ? "neutral"
                            : "warning"
                      }
                      statusLabel={STATUS_LABELS[project.status] ?? project.status}
                      name={
                        <Link
                          href={`/studioflow/${project.id}`}
                          className="font-medium text-action hover:underline"
                        >
                          {project.name}
                        </Link>
                      }
                      secondary={project.code}
                    />
                  </TableCell>
                  <TableCell>{project.client.name}</TableCell>
                  <TableCell>{TYPE_LABELS[project.type] ?? project.type}</TableCell>
                  <TableCell>{fmt.format(new Date(project.opened_at))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </DirectoryShell>
      )}
    </div>
  );
}
