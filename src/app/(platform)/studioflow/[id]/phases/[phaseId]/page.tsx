import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Circle,
  FileText,
  PlayCircle,
  FolderOpen,
} from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  Button,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

import {
  finishPhaseAction,
  reopenPhaseAction,
  closePhaseByExceptionAction,
  startSupervisionAction,
  finishSupervisionAction,
  reopenSupervisionAction,
  openIterationAction,
  recordFileAction,
} from "./actions";

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

const asFormAction = (action: unknown) => action as (formData: FormData) => void | Promise<void>;

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
  const canManageIteration = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
  const canReviewIteration = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
  const canOverride = hasPermission(grants, STUDIOFLOW_PERMISSIONS.phaseOverride);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Fase" />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat fase ini."
          />
        </SectionCard>
      </div>
    );
  }

  const [phase, settings] = await Promise.all([
    studioFlowService.getPhase(grants, projectId, phaseId).catch((e: { kind?: string }) => {
      if (e?.kind === "NOT_FOUND") return null;
      throw e;
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
  const draftIteration = phase.iterations.find((i) => i.state === "DRAFT");
  const isOpen = phase.state !== "DONE";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      {/* Back link + header */}
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
          description={[
            stateLabel,
            phase.closed_at ? `Selesai ${fmt.format(new Date(phase.closed_at))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>

      {/* Phase state */}
      <SectionCard title="Status fase">
        <div className="flex items-center gap-2 text-sm">
          {phase.state === "NOT_STARTED" && <Circle className="h-4 w-4 text-[var(--ui-muted)]" />}
          {phase.state === "IN_PROGRESS" && <PlayCircle className="h-4 w-4 text-blue-500" />}
          {phase.state === "WAITING_CLIENT" && <Clock className="h-4 w-4 text-amber-500" />}
          {phase.state === "DONE" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
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

        {/* ── Supervision controls ── */}
        {!phase.has_rounds && (
          <div className="mt-4 flex flex-wrap gap-2">
            {phase.state === "NOT_STARTED" && canReviewIteration && (
              <form action={asFormAction(startSupervisionAction.bind(null, phaseId, projectId))}>
                <Button type="submit" size="sm">Mulai supervisi</Button>
              </form>
            )}
            {phase.state === "IN_PROGRESS" && canReviewIteration && (
              <form action={asFormAction(finishSupervisionAction.bind(null, phaseId, projectId))}>
                <Button type="submit" size="sm">Selesaikan supervisi</Button>
              </form>
            )}
            {phase.state === "DONE" && canReviewIteration && (
              <form action={asFormAction(reopenSupervisionAction.bind(null, phaseId, projectId))} className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--ui-muted)]">
                    Alasan reopen <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="reason"
                    required
                    placeholder="Tulis alasan..."
                    className="h-9 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ui-ring)]"
                  />
                </div>
                <Button type="submit" size="sm" variant="secondary">Buka kembali</Button>
              </form>
            )}
          </div>
        )}

        {/* ── Iteration-bearing phase controls ── */}
        {phase.has_rounds && (
          <div className="mt-4 flex flex-wrap gap-2">
            {isOpen && canManageIteration && !draftIteration && (
              <form action={asFormAction(openIterationAction.bind(null, phaseId, projectId))}>
                <Button type="submit" size="sm">Mulai round baru</Button>
              </form>
            )}
            {isOpen && canReviewIteration && (
              <form action={asFormAction(finishPhaseAction.bind(null, phaseId, projectId))}>
                <Button type="submit" size="sm" variant="secondary">Selesaikan fase</Button>
              </form>
            )}
            {isOpen && canOverride && (
              <form action={asFormAction(closePhaseByExceptionAction.bind(null, phaseId, projectId))} className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--ui-muted)]">
                    Alasan exception <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="reason"
                    required
                    placeholder="Tulis alasan..."
                    className="h-9 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ui-ring)]"
                  />
                </div>
                <Button type="submit" size="sm" variant="danger">Tutup (exception)</Button>
              </form>
            )}
            {!isOpen && canReviewIteration && (
              <form action={asFormAction(reopenPhaseAction.bind(null, phaseId, projectId))} className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--ui-muted)]">
                    Alasan reopen <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="reason"
                    required
                    placeholder="Tulis alasan..."
                    className="h-9 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ui-ring)]"
                  />
                </div>
                <Button type="submit" size="sm" variant="secondary">Buka kembali</Button>
              </form>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Iterations list (iteration-bearing phases only) ── */}
      {phase.has_rounds && (
        <SectionCard title="Rounds">
          {activeIterations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Belum ada round"
              description={
                canManageIteration
                  ? 'Klik "Mulai round baru" untuk membuka round pertama.'
                  : "Belum ada round di fase ini."
              }
            />
          ) : (
            <div className="grid gap-2">
              {[...activeIterations].reverse().map((iteration) => (
                <Link
                  key={iteration.id}
                  href={`/studioflow/${projectId}/phases/${phaseId}/iterations/${iteration.id}`}
                  className="flex items-center justify-between rounded border border-[var(--ui-border)] px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {phase.round_prefix ?? phase.name} {iteration.number}
                    </span>
                    <span className="rounded-full bg-[var(--ui-surface-raised)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
                      {ITERATION_STATE_LABELS[iteration.state] ?? iteration.state}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--ui-muted)]">
                    {fmt.format(new Date(iteration.created_at))}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── RECORDED file drop (metadata only, no upload) ── */}
      {isOpen && canManageIteration && (
        <SectionCard title="Catat file">
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            Catat file yang sudah dibuat di luar sistem (RECORDED). Tidak ada upload — hanya metadata.
          </p>
          <form
            action={asFormAction(recordFileAction.bind(null, projectId, phaseId))}
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="folder_key" value={phase.folder_key ?? ""} />

            <div className="flex flex-col gap-1">
              <label htmlFor="original_filename" className="text-xs font-medium text-[var(--ui-muted)]">
                Nama file asli <span className="text-red-500">*</span>
              </label>
              <input
                id="original_filename"
                name="original_filename"
                required
                placeholder="contoh: Denah Lantai 1.pdf"
                className="h-9 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ui-ring)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="bytes" className="text-xs font-medium text-[var(--ui-muted)]">
                Ukuran (bytes) <span className="text-red-500">*</span>
              </label>
              <input
                id="bytes"
                name="bytes"
                type="number"
                min="1"
                required
                placeholder="contoh: 2048000"
                className="h-9 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--ui-ring)]"
              />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" size="sm">Catat file</Button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}
