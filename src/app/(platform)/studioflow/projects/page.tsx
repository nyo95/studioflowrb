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

// ── Phase summary helpers ─────────────────────────────────────────────────────

type PhaseSummary = {
  state: string;
  oldestSentAt: Date | null; // earliest SENT iteration sent_at for WAITING_CLIENT
};

function ageLabel(since: Date): string {
  const d = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (d === 0) return "hari ini";
  if (d === 1) return "1 hari";
  return `${d} hari`;
}

function phaseSummaryLabel(phases: PhaseSummary[]): { text: string; tone: "waiting" | "active" | "done" | "idle" } | null {
  if (phases.length === 0) return null;

  // WAITING_CLIENT — oldest sent_at across all waiting phases
  const waitingPhases = phases.filter((p) => p.state === "WAITING_CLIENT");
  if (waitingPhases.length > 0) {
    const sentDates = waitingPhases
      .map((p) => p.oldestSentAt)
      .filter((d): d is Date => d !== null);
    const oldest = sentDates.length > 0
      ? new Date(Math.min(...sentDates.map((d) => d.getTime())))
      : null;
    const suffix = oldest ? ` · ${ageLabel(oldest)}` : "";
    const label = waitingPhases.length === 1 ? "Menunggu klien" : `${waitingPhases.length} fase menunggu klien`;
    return { text: label + suffix, tone: "waiting" };
  }

  // IN_PROGRESS
  const inProgress = phases.filter((p) => p.state === "IN_PROGRESS");
  if (inProgress.length > 0) {
    const label = inProgress.length === 1 ? "Digarap" : `${inProgress.length} fase digarap`;
    return { text: label, tone: "active" };
  }

  // All DONE
  if (phases.every((p) => p.state === "DONE")) {
    return { text: "Semua fase selesai", tone: "done" };
  }

  return null; // NOT_STARTED across all phases — no label needed
}

export default async function StudioFlowProjectsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Semua project" />
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

  // Cross-schema: resolve lead_user_id → display_name (no Prisma relation allowed)
  const leadUserIds = Array.from(
    new Set(projects.map((p) => p.lead_user_id).filter((id): id is string => Boolean(id))),
  );
  const leadUsers =
    leadUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: leadUserIds } },
          select: { id: true, display_name: true },
        })
      : [];
  const leadUserMap = Object.fromEntries(leadUsers.map((u) => [u.id, u.display_name]));

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Semua project"
        description="Katalog project desain studio"
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
          <DataTable framed={false} density="compact" stickyHeader fill minWidth={800}>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Klien</TableHead>
                <TableHead>Ringkasan fase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Dibuka</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const phases: PhaseSummary[] = project.phases.map((phase) => ({
                  state: phase.state,
                  oldestSentAt: phase.iterations[0]?.sent_at ?? null,
                }));
                const summary = phaseSummaryLabel(phases);
                const leadName = project.lead_user_id
                  ? (leadUserMap[project.lead_user_id] ?? "—")
                  : "—";
                return (
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
                    <TableCell>
                      {summary ? (
                        <span
                          className={
                            summary.tone === "waiting"
                              ? "text-warning text-xs font-medium"
                              : summary.tone === "done"
                                ? "text-ink-tertiary text-xs"
                                : "text-ink-secondary text-xs"
                          }
                        >
                          {summary.text}
                        </span>
                      ) : (
                        <span className="text-ink-tertiary text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{STATUS_LABELS[project.status] ?? project.status}</TableCell>
                    <TableCell className="text-sm">{leadName}</TableCell>
                    <TableCell>{fmt.format(new Date(project.opened_at))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        </DirectoryShell>
      )}
    </div>
  );
}
