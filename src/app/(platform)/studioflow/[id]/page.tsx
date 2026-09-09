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
import { GeneralTaskBlock } from "./general-task-block";
import { PhaseSection } from "./phase-section";
import type { PhaseItem } from "./phase-section";

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

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead =
    hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead) ||
    hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Detail project" />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat project ini."
          />
        </SectionCard>
      </div>
    );
  }

  const canManageTasks = hasPermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
  const canManageIter = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
  const canReviewIter = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
  const canOverridePhase = hasPermission(grants, STUDIOFLOW_PERMISSIONS.phaseOverride);

  const [project, settings, tasks, rawPhases] = await Promise.all([
    studioFlowService.getProject(grants, id).catch((e: { kind?: string }) => {
      if (e?.kind === "NOT_FOUND") return null;
      throw e;
    }),
    readPlatformGeneralSettings(prisma),
    canManageTasks || canRead
      ? studioFlowService
          .listTasks(grants, id, { includeDone: true, phaseScope: null })
          .catch(() => [])
      : Promise.resolve([]),
    studioFlowService.listProjectPhases(grants, id),
  ]);

  // Resolve approved_by_id → display_name for ACC indicators
  const accUserIds = Array.from(
    new Set(
      rawPhases.flatMap((ph) =>
        ph.iterations
          .map((it) => it.internal_approval?.approved_by_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  );
  const accUsers =
    accUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: accUserIds } },
          select: { id: true, display_name: true },
        })
      : [];
  const accUserMap = Object.fromEntries(accUsers.map((u) => [u.id, u.display_name]));

  if (!project) notFound();

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });

  // Serialize dates for client component boundary
  const phases: PhaseItem[] = rawPhases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    key: phase.key,
    state: phase.state as PhaseItem["state"],
    has_rounds: phase.has_rounds,
    round_prefix: phase.round_prefix,
    requires_internal_approval: phase.requires_internal_approval,
    iterations: phase.iterations.map((iter) => ({
      id: iter.id,
      number: iter.number,
      state: iter.state as PhaseItem["iterations"][number]["state"],
      sent_at: iter.sent_at ? iter.sent_at.toISOString() : null,
      created_at: iter.created_at.toISOString(),
      void_reason: iter.void_reason ?? null,
      internal_approval: iter.internal_approval
        ? {
            approver: accUserMap[iter.internal_approval.approved_by_id] ?? iter.internal_approval.approved_by_id,
            at: iter.internal_approval.approved_at.toISOString(),
          }
        : null,
      points: iter.points.map((pt) => ({
        id: pt.id,
        text: pt.text,
        done: pt.done,
        source: pt.source as "INTERNAL" | "CLIENT_REVISION",
        withdrawn_at: pt.withdrawn_at ? pt.withdrawn_at.toISOString() : null,
      })),
    })),
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow={`StudioFlow · ${project.client.name}`}
        title={project.name}
        description={`${project.code} · ${TYPE_LABELS[project.type] ?? project.type} · ${STATUS_LABELS[project.status] ?? project.status} · Dibuka ${fmt.format(new Date(project.opened_at))}`}
      />

      {/* ── General task block — always pinned, never filtered ── */}
      <GeneralTaskBlock
        projectId={id}
        tasks={tasks.map((t: { id: string; title: string; status: "OPEN" | "DONE"; [key: string]: unknown }) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        }))}
        canManage={canManageTasks}
      />

      {/* ── File shortcut ── */}
      <div>
        <Link
          href={`/studioflow/${id}/files`}
          className="inline-flex items-center gap-1 text-sm text-action hover:underline"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Lihat semua file project
        </Link>
      </div>

      {/* ── Fase — filter chips + expandable rows with iterations ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary mb-3">
          Fase
        </h2>
        {phases.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Belum ada fase.</p>
        ) : (
          <PhaseSection
            phases={phases}
            projectId={id}
            canManage={canManageIter}
            canReview={canReviewIter}
            canOverride={canOverridePhase}
          />
        )}
      </div>

      {/* ── Location / area ── */}
      {(project.location || project.area) && (
        <SectionCard title="Detail project">
          <p className="text-sm">
            {project.location ? `Lokasi: ${project.location}` : null}
            {project.location && project.area ? " · " : null}
            {project.area ? `${project.area} m²` : null}
          </p>
        </SectionCard>
      )}
    </div>
  );
}
