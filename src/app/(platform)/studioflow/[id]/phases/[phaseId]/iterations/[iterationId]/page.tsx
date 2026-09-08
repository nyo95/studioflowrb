import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, MessageSquare } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

import { AddPointForm, IterationLifecycle, PointRow, ResponseForm } from "./iteration-controls";

export const dynamic = "force-dynamic";

/** Bound to the service's own return shapes so these stay correct
 *  after `prisma generate` picks up the WO-5 models. */
type IterationDetail = Awaited<ReturnType<typeof studioFlowService.getIteration>>;
type IterationPoint = IterationDetail["points"][number];
type ResponseList = Awaited<ReturnType<typeof studioFlowService.listResponses>>;
type ResponseItem = ResponseList[number];
type ResponsePoint = ResponseItem["points"][number];

const STATE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Terkirim",
  APPROVED: "Disetujui",
  SUPERSEDED: "Diganti",
  VOIDED: "Dibatalkan",
};

export default async function IterationDetailPage({
  params,
}: {
  params: Promise<{ id: string; phaseId: string; iterationId: string }>;
}) {
  const { id: projectId, phaseId, iterationId } = await params;

  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
  const canReview = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="StudioFlow" title="Round" />
        <SectionCard>
          <EmptyState icon={FileText} title="Akses ditolak" description="Kamu tidak punya permission untuk melihat round ini." />
        </SectionCard>
      </div>
    );
  }

  const [iteration, responses, settings] = await Promise.all([
    studioFlowService.getIteration(grants, projectId, phaseId, iterationId).catch((error: { kind?: string }) => {
      if (error?.kind === "NOT_FOUND") return null;
      throw error;
    }),
    studioFlowService.listResponses(grants, iterationId).catch((): ResponseList => []),
    readPlatformGeneralSettings(prisma),
  ]);
  if (!iteration) notFound();

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const showDate = (value: Date | null) => (value ? fmt.format(new Date(value)) : "—");

  const editable = iteration.state === "DRAFT" || iteration.state === "SENT";
  const live = iteration.points.filter((point: IterationPoint) => !point.withdrawn_at);
  const withdrawn = iteration.points.filter((point: IterationPoint) => point.withdrawn_at);
  const roundLabel = `${iteration.phase.round_prefix ?? iteration.phase.name} ${iteration.number}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <div>
        <Link
          href={`/studioflow/${projectId}/phases/${phaseId}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--ui-muted)] hover:text-[var(--ui-foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke fase
        </Link>
        <PageHeader
          eyebrow={`StudioFlow · ${iteration.phase.name}`}
          title={roundLabel}
          description={STATE_LABELS[iteration.state] ?? iteration.state}
        />
      </div>

      <SectionCard title="Detail round">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--ui-muted)]">Status</dt>
            <dd className="font-medium">{STATE_LABELS[iteration.state] ?? iteration.state}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ui-muted)]">Dikirim</dt>
            <dd>{showDate(iteration.sent_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ui-muted)]">Direspons</dt>
            <dd>{showDate(iteration.responded_at)}</dd>
          </div>
        </dl>

        {iteration.state === "VOIDED" && iteration.void_reason && (
          <p className="mt-3 text-sm text-[var(--ui-muted)]">Alasan batal: {iteration.void_reason}</p>
        )}

        <IterationLifecycle
          iterationId={iterationId}
          projectId={projectId}
          phaseId={phaseId}
          state={iteration.state}
          canManage={canManage}
          canReview={canReview}
        />
      </SectionCard>

      <SectionCard title="Checklist">
        {live.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Belum ada poin"
            description={editable && canManage ? "Tambahkan poin checklist untuk round ini." : "Round ini tidak punya poin checklist."}
          />
        ) : (
          <div className="grid gap-2">
            {live.map((point: IterationPoint) => (
              <PointRow
                key={point.id}
                point={point}
                iterationId={iterationId}
                projectId={projectId}
                phaseId={phaseId}
                editable={editable && canManage}
              />
            ))}
          </div>
        )}

        {withdrawn.length > 0 && (
          <div className="mt-4 grid gap-2">
            <p className="text-xs font-medium text-[var(--ui-muted)]">Poin ditarik</p>
            {withdrawn.map((point: IterationPoint) => (
              <div
                key={point.id}
                className="rounded border border-dashed border-[var(--ui-border)] px-3 py-2 text-sm text-[var(--ui-muted)]"
              >
                <span className="line-through">{point.text}</span>
                {point.withdrawal_reason && <span className="ml-2 text-xs">({point.withdrawal_reason})</span>}
              </div>
            ))}
          </div>
        )}

        {editable && canManage && (
          <AddPointForm iterationId={iterationId} projectId={projectId} phaseId={phaseId} />
        )}
      </SectionCard>

      {iteration.state === "SENT" && canReview && (
        <SectionCard title="Catat response klien">
          <p className="mb-3 text-xs text-[var(--ui-muted)]">
            Approve menutup round ini. Minta revisi membuat round berikutnya otomatis,
            dengan poin klien terbawa apa adanya.
          </p>
          <ResponseForm iterationId={iterationId} projectId={projectId} phaseId={phaseId} />
        </SectionCard>
      )}

      {responses.length > 0 && (
        <SectionCard title="Riwayat response">
          <div className="grid gap-3">
            {responses.map((response: ResponseItem) => (
              <div key={response.id} className="rounded border border-[var(--ui-border)] px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <MessageSquare className="h-4 w-4 text-[var(--ui-muted)]" />
                    {response.kind === "APPROVAL" ? "Disetujui klien" : "Minta revisi"}
                  </span>
                  <span className="text-xs text-[var(--ui-muted)]">{fmt.format(new Date(response.received_at))}</span>
                </div>
                {response.note && <p className="mt-2 text-[var(--ui-muted)]">{response.note}</p>}
                {response.points.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {response.points.map((point: ResponsePoint) => (
                      <li key={point.id}>{point.text}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
