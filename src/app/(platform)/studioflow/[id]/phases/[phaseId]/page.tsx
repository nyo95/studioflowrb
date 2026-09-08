import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Circle, Clock, FileText, FolderOpen, PlayCircle } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

import { PhaseControls, RecordFileForm, SupervisionControls } from "./phase-controls";

export const dynamic = "force-dynamic";

const PHASE_STATE_LABELS: Record<string, string> = {
  NOT_STARTED: "Belum mulai",
  IN_PROGRESS: "Berjalan",
  WAITING_CLIENT: "Nunggu klien",
  DONE: "Selesai",
};

const ITERATION_STATE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Terkirim",
  APPROVED: "Disetujui",
  SUPERSEDED: "Diganti",
  VOIDED: "Dibatalkan",
};

function StateIcon({ state }: { state: string }) {
  if (state === "IN_PROGRESS") return <PlayCircle className="h-4 w-4 text-blue-500" />;
  if (state === "WAITING_CLIENT") return <Clock className="h-4 w-4 text-amber-500" />;
  if (state === "DONE") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  return <Circle className="h-4 w-4 text-[var(--ui-muted)]" />;
}

export default async function PhaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string }>;
}) {
  const { id: projectId, phaseId } = await params;

  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
  const canReview = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
  const canOverride = hasPermission(grants, STUDIOFLOW_PERMISSIONS.phaseOverride);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Fase" />
        <SectionCard>
          <EmptyState icon={FolderOpen} title="Akses ditolak" description="Kamu tidak punya permission untuk melihat fase ini." />
        </SectionCard>
      </div>
    );
  }

  const [phase, settings] = await Promise.all([
    studioFlowService.getPhase(grants, projectId, phaseId).catch((error: { kind?: string }) => {
      if (error?.kind === "NOT_FOUND") return null;
      throw error;
    }),
    readPlatformGeneralSettings(prisma),
  ]);
  if (!phase) notFound();

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  const stateLabel = PHASE_STATE_LABELS[phase.state] ?? phase.state;
  const activeIterations = phase.iterations.filter((i) => i.state !== "VOIDED");
  const hasDraft = phase.iterations.some((i) => i.state === "DRAFT");
  const open = phase.state !== "DONE";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <div>
        <Link
          href={`/studioflow/${projectId}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--ui-muted)] hover:text-[var(--ui-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke project
        </Link>
        <PageHeader
          eyebrow="StudioFlow · Fase"
          title={phase.name}
          description={[stateLabel, phase.closed_at ? `Ditutup ${fmt.format(new Date(phase.closed_at))}` : null]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>

      <SectionCard title="Status fase">
        <div className="flex items-center gap-2 text-sm">
          <StateIcon state={phase.state} />
          <span className="font-medium">{stateLabel}</span>
          {phase.closure_kind === "EXCEPTION" && (
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertCircle className="h-3 w-3" />
              Exception
            </span>
          )}
        </div>
        {phase.closure_reason && (
          <p className="mt-2 text-sm text-[var(--ui-muted)]">Alasan: {phase.closure_reason}</p>
        )}

        {phase.has_rounds ? (
          <PhaseControls
            phaseId={phaseId}
            projectId={projectId}
            state={phase.state}
            hasDraft={hasDraft}
            canManage={canManage}
            canReview={canReview}
            canOverride={canOverride}
          />
        ) : (
          <SupervisionControls
            phaseId={phaseId}
            projectId={projectId}
            state={phase.state}
            canReview={canReview}
          />
        )}
      </SectionCard>

      {phase.has_rounds && (
        <SectionCard title="Rounds">
          {activeIterations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Belum ada round"
              description={canManage ? 'Klik "Mulai round baru" untuk membuka round pertama.' : "Belum ada round di fase ini."}
            />
          ) : (
            <div className="grid gap-2">
              {[...activeIterations].reverse().map((iteration) => (
                <Link
                  key={iteration.id}
                  href={`/studioflow/${projectId}/phases/${phaseId}/iterations/${iteration.id}`}
                  className="flex items-center justify-between rounded border border-[var(--ui-border)] px-4 py-3 text-sm transition-colors hover:bg-[var(--ui-surface-raised)]"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {phase.round_prefix ?? phase.name} {iteration.number}
                    </span>
                    <span className="rounded-full bg-[var(--ui-surface-raised)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
                      {ITERATION_STATE_LABELS[iteration.state] ?? iteration.state}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--ui-muted)]">{fmt.format(new Date(iteration.created_at))}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {open && canManage && (
        <SectionCard title="Catat file">
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            Catat file yang dibuat di luar sistem (RECORDED). Tidak ada upload — hanya metadata.
          </p>
          <RecordFileForm projectId={projectId} phaseId={phaseId} folderKey={phase.folder_key} />
        </SectionCard>
      )}
    </div>
  );
}
