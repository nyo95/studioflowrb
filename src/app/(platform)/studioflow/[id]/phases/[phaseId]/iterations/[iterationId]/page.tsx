import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, FileText } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { EmptyState, Button, Field, Input, PageHeader, SectionCard, Textarea } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import {
  addIterationPointAction,
  approveIterationAction,
  markPointDoneAction,
  sendIterationAction,
  voidIterationAction,
  withdrawPointAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Terkirim",
  APPROVED: "Disetujui",
  SUPERSEDED: "Diganti",
  VOIDED: "Dibatalkan",
};

const formatDate = (value: Date | null) => (value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—");
const asFormAction = (action: unknown) => action as (formData: FormData) => void | Promise<void>;

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
    return <SectionCard><EmptyState icon={FileText} title="Akses ditolak" description="Kamu tidak punya permission untuk melihat round ini." /></SectionCard>;
  }

  const iteration = await studioFlowService.getIteration(grants, projectId, phaseId, iterationId).catch((error: { kind?: string }) => {
    if (error?.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!iteration) notFound();

  const open = iteration.state === "DRAFT" || iteration.state === "SENT";
  const nonWithdrawn = iteration.points.filter((point) => !point.withdrawn_at);
  const withdrawn = iteration.points.filter((point) => point.withdrawn_at);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <Link href={`/studioflow/${projectId}/phases/${phaseId}`} className="inline-flex items-center gap-1 text-sm text-[var(--ui-muted)] hover:text-[var(--ui-foreground)]">
        <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke fase
      </Link>
      <PageHeader
        eyebrow={iteration.phase.name}
        title={`${iteration.phase.round_prefix ?? iteration.phase.name} ${iteration.number}`}
        description={`Status: ${STATE_LABELS[iteration.state] ?? iteration.state}`}
      />

      <SectionCard title="Detail round">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-[var(--ui-muted)]">Assignee</dt><dd>{iteration.assignee_id ?? "—"}</dd></div>
          <div><dt className="text-[var(--ui-muted)]">Dikirim</dt><dd>{formatDate(iteration.sent_at)}</dd></div>
          <div><dt className="text-[var(--ui-muted)]">Direspons</dt><dd>{formatDate(iteration.responded_at)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {iteration.state === "DRAFT" && canManage && (
            <form action={asFormAction(sendIterationAction.bind(null, iterationId, projectId, phaseId))}><Button type="submit" variant="primary">Kirim</Button></form>
          )}
          {iteration.state === "SENT" && canReview && (
            <form action={asFormAction(approveIterationAction.bind(null, iterationId, projectId, phaseId))}><Button type="submit" variant="primary">Setujui</Button></form>
          )}
          {open && canManage && (
            <form action={asFormAction(voidIterationAction.bind(null, iterationId, projectId, phaseId))} className="flex items-end gap-2">
              <Field label="Alasan batal" required><Input name="reason" required maxLength={500} /></Field>
              <Button type="submit" variant="danger">Batalkan</Button>
            </form>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Checklist">
        {nonWithdrawn.length === 0 ? <EmptyState icon={CheckCircle2} title="Belum ada poin" description="Tambahkan poin checklist untuk round ini." /> : (
          <div className="grid gap-2">
            {nonWithdrawn.map((point) => (
              <div key={point.id} className="flex items-center justify-between gap-3 rounded border border-[var(--ui-border)] px-3 py-2 text-sm">
                <span className={point.done ? "text-[var(--ui-muted)] line-through" : ""}>{point.done ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : <Circle className="mr-2 inline h-4 w-4" />}{point.text}</span>
                {open && canManage && <form action={asFormAction(markPointDoneAction.bind(null, point.id, iterationId, projectId, phaseId))}><input type="hidden" name="done" value={point.done ? "false" : "true"} /><Button type="submit" size="sm" variant="ghost">{point.done ? "Buka" : "Selesai"}</Button></form>}
              </div>
            ))}
          </div>
        )}
        {withdrawn.length > 0 && <div className="mt-4 grid gap-2 text-sm text-[var(--ui-muted)]"><p className="font-medium">Poin ditarik</p>{withdrawn.map((point) => <div key={point.id} className="rounded border border-dashed border-[var(--ui-border)] px-3 py-2"><span className="line-through">{point.text}</span><span className="ml-2">({point.withdrawal_reason})</span></div>)}</div>}
        {open && canManage && <form action={asFormAction(addIterationPointAction.bind(null, iterationId, projectId, phaseId))} className="mt-4 flex items-end gap-2"><Field label="Poin baru" required><Textarea name="text" required maxLength={1000} rows={2} /></Field><Button type="submit" variant="primary">Tambah poin</Button></form>}
      </SectionCard>

      {open && canManage && nonWithdrawn.length > 0 && <SectionCard title="Tarik poin"><div className="grid gap-2">{nonWithdrawn.map((point) => <form key={point.id} action={asFormAction(withdrawPointAction.bind(null, point.id, iterationId, projectId, phaseId))} className="flex items-end gap-2"><span className="flex-1 text-sm">{point.text}</span><Input name="reason" required maxLength={500} placeholder="Alasan" /><Button type="submit" variant="danger" size="sm">Tarik</Button></form>)}</div></SectionCard>}
    </div>
  );
}
