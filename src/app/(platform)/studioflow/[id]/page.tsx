import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { FolderOpen } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

export const dynamic = "force-dynamic";

const PHASE_STATE_LABELS: Record<string, string> = {
  NOT_STARTED: "Belum mulai",
  IN_PROGRESS: "Berjalan",
  WAITING_CLIENT: "Nunggu klien",
  DONE: "Selesai",
};

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

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead) ||
    hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Detail project" />
        <SectionCard>
          <EmptyState icon={FolderOpen} title="Akses ditolak" description="Kamu tidak punya permission untuk melihat project ini." />
        </SectionCard>
      </div>
    );
  }

  const [project, settings] = await Promise.all([
    studioFlowService.getProject(grants, id).catch((e: { kind?: string }) => {
      if (e?.kind === "NOT_FOUND") return null;
      throw e;
    }),
    readPlatformGeneralSettings(prisma),
  ]);
  if (!project) notFound();

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow={`StudioFlow · ${project.client.name}`}
        title={project.name}
        description={`${project.code} · ${TYPE_LABELS[project.type] ?? project.type} · Dibuka ${fmt.format(new Date(project.opened_at))}`}
      />

      <div>
        <Link
          href={`/studioflow/${id}/files`}
          className="inline-flex items-center gap-1 text-sm text-action hover:underline"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Lihat semua file project
        </Link>
      </div>

      {/* Status */}
      <SectionCard title="Status project">
        <p className="text-sm">
          Status: <strong>{STATUS_LABELS[project.status] ?? project.status}</strong>
          {project.location ? ` · Lokasi: ${project.location}` : null}
          {project.area ? ` · ${project.area} m²` : null}
        </p>
      </SectionCard>

      {/* Phases */}
      <SectionCard title="Fase">
        <div className="grid gap-2">
          {project.phases.map((phase) => (
            <Link
              key={phase.id}
              href={`/studioflow/${id}/phases/${phase.id}`}
              className="flex items-center justify-between rounded border border-[var(--ui-border)] px-4 py-3 text-sm transition-colors hover:bg-[var(--ui-surface-raised)]"
            >
              <span className="font-medium">{phase.name}</span>
              <span className="text-[var(--ui-muted)]">
                {PHASE_STATE_LABELS[phase.state] ?? phase.state}
              </span>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
