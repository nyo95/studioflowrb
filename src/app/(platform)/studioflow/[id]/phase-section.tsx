"use client";

import { useActionState, useState, useEffect } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import type { ActionResult } from "@platform/core/actions";
import {
  Button,
  Checkbox,
  DraftDialog,
  Field,
  FilterChip,
  FormActions,
  IconButton,
  InlineError,
  Input,
  RadioGroup,
  RowActionMenu,
  Surface,
  Textarea,
} from "@/platform/ui_engine";
import { GeneralTaskBlock } from "./general-task-block";

import {
  openIterationAction,
  sendIterationAction,
  finishPhaseAction,
  startSupervisionAction,
  finishSupervisionAction,
  reopenSupervisionAction,
  voidIterationAction,
  reopenPhaseAction,
  closePhaseByExceptionAction,
  recordInternalApprovalAction,
  recordResponseAndFinishAction,
} from "./phase-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IterationPoint = {
  id: string;
  text: string;
  done: boolean;
  source: "INTERNAL" | "CLIENT_REVISION";
  withdrawn_at: string | null;
};

export type IterationItem = {
  id: string;
  number: number;
  state: "DRAFT" | "SENT" | "APPROVED" | "SUPERSEDED" | "VOIDED";
  sent_at: string | null;
  created_at: string;
  void_reason: string | null;
  internal_approval: { approver: string; at: string } | null;
  points: IterationPoint[];
};

export type PhaseItem = {
  id: string;
  name: string;
  key: string;
  state: "NOT_STARTED" | "IN_PROGRESS" | "WAITING_CLIENT" | "DONE";
  has_rounds: boolean;
  round_prefix: string | null;
  requires_internal_approval: boolean;
  tasks: import("./general-task-block").TaskItem[];
  iterations: IterationItem[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ageLabel(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "hari ini";
  if (days === 1) return "1 hari";
  return `${days} hari`;
}

function iterLabel(phase: PhaseItem, number: number): string {
  const prefix = phase.round_prefix ?? phase.key;
  return `${prefix}${number}`;
}

const PHASE_STATE_LABELS: Record<string, string> = {
  NOT_STARTED: "Belum mulai",
  IN_PROGRESS: "Digarap",
  WAITING_CLIENT: "Nunggu klien",
  DONE: "Selesai",
};

const ITER_STATE_LABELS: Record<string, string> = {
  DRAFT: "belum digarap",
  SENT: "dikirim",
  APPROVED: "disetujui",
  SUPERSEDED: "direvisi",
  VOIDED: "dibatalkan",
};

// ── Send Dialog ───────────────────────────────────────────────────────────────

function SendDialog({
  iterationId,
  label,
  projectId,
  openPoints,
  missingApproval,
  onClose,
}: {
  iterationId: string;
  label: string;
  projectId: string;
  openPoints: number;
  missingApproval: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    sendIterationAction.bind(null, projectId, iterationId),
    null as ActionResult<void> | null,
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const error = state?.ok === false ? state.error.safeMessage : null;

  return (
    <DraftDialog
      open
      pending={pending}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Kirim ${label} ke klien`}
      description="Aksi ini hanya mencatat pengiriman; materi tetap dikirim lewat kanal di luar aplikasi."
      size="sm"
    >
      {openPoints > 0 && (
        <div className="mb-4 text-sm text-ink-secondary bg-surface-muted rounded-action px-3 py-2 border border-line">
          Masih ada <strong>{openPoints} poin</strong> yang belum selesai di {label}.
        </div>
      )}
      {missingApproval && (
        <div className="mb-4 text-sm text-ink-secondary bg-surface-muted rounded-action px-3 py-2 border border-line">
          Ronde ini belum mendapat ACC internal. Pengiriman tetap bisa dicatat.
        </div>
      )}

      {error && <InlineError className="mb-3">{error}</InlineError>}

      <form action={action}>
        <FormActions>
        <Button variant="ghost" size="sm" data-dialog-cancel disabled={pending}>
          Batal
        </Button>
        <Button variant="primary" size="sm" type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : openPoints > 0 ? "Tetap kirim" : "Kirim"}
          </Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}

// ── Response Dialog ───────────────────────────────────────────────────────────

function ResponseDialog({
  iterationId,
  label,
  projectId,
  canFinishPhase,
  onClose,
}: {
  iterationId: string;
  label: string;
  projectId: string;
  canFinishPhase: boolean;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<"APPROVAL" | "REVISION">("APPROVAL");
  const [points, setPoints] = useState<string[]>([""]);
  const [alsoFinish, setAlsoFinish] = useState(false);
  const [state, action, pending] = useActionState(
    recordResponseAndFinishAction.bind(null, projectId, iterationId),
    null as ActionResult<void> | null,
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const error = state?.ok === false ? state.error.safeMessage : null;

  function addPoint() {
    setPoints((p) => [...p, ""]);
  }
  function updatePoint(i: number, val: string) {
    setPoints((p) => p.map((v, idx) => (idx === i ? val : v)));
  }
  function removePoint(i: number) {
    setPoints((p) => p.filter((_, idx) => idx !== i));
  }

  return (
    <DraftDialog
      open
      pending={pending}
      watchedValue={JSON.stringify([kind, points, alsoFinish])}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Jawaban klien untuk ${label}`}
      size="sm"
    >
      <form action={action} className="flex flex-col gap-4">
        {/* Kind picker */}
        <RadioGroup
          label="Respons klien"
          name="kind"
          value={kind}
          onValueChange={(value) => setKind(value as typeof kind)}
          options={[
            { value: "APPROVAL", label: "Disetujui" },
            { value: "REVISION", label: "Minta revisi" },
          ]}
        />

        {/* Revision points */}
        {kind === "REVISION" && (
          <div className="flex flex-col gap-2 pl-4 border-l-2 border-line">
            <p className="text-xs font-medium text-ink-secondary uppercase tracking-wide">
              Poin revisi
            </p>
            {points.map((pt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  type="text"
                  name="point"
                  density="compact"
                  value={pt}
                  onChange={(e) => updatePoint(i, e.target.value)}
                  placeholder={`Poin ${i + 1}`}
                  className="min-w-0 flex-1"
                />
                {points.length > 1 && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label="Hapus poin"
                    icon={<X aria-hidden="true" />}
                    onClick={() => removePoint(i)}
                    className="shrink-0"
                  />
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addPoint} className="self-start">
              + Tambah poin
            </Button>
            <p className="text-xs text-ink-tertiary">
              Poin akan ditambahkan ke ronde berikutnya. Ronde baru dibuat
              otomatis jika belum ada.
            </p>
          </div>
        )}

        {/* Optional note */}
        <Field label="Catatan (opsional)">
          <Textarea name="note" rows={2} density="compact" placeholder="Catatan dari klien…" className="min-h-16 resize-none" />
        </Field>

        {/* Sekalian selesaikan — APPROVAL only, when no other open iterations */}
        {kind === "APPROVAL" && canFinishPhase && (
          <Checkbox
            checked={alsoFinish}
            onCheckedChange={(checked) => setAlsoFinish(checked === true)}
            label="Sekalian selesaikan fase ini"
            className="text-sm text-ink-secondary"
          />
        )}
        {alsoFinish && <input type="hidden" name="also_finish" value="1" />}

        {error && <InlineError>{error}</InlineError>}

        <FormActions>
          <Button variant="ghost" size="sm" data-dialog-cancel disabled={pending}>
            Batal
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan jawaban"}
          </Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}


// ── Void Dialog ───────────────────────────────────────────────────────────────

function VoidDialog({
  iterationId,
  label,
  projectId,
  onClose,
}: {
  iterationId: string;
  label: string;
  projectId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    voidIterationAction.bind(null, projectId, iterationId),
    null as ActionResult<void> | null,
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const error = state?.ok === false ? state.error.safeMessage : null;

  return (
    <DraftDialog
      open
      pending={pending}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Hentikan ronde ${label}?`}
      description="Ronde dihentikan dan tidak bisa dilanjutkan. Nomor serta isinya tetap tersimpan di riwayat."
      size="sm"
    >
      <form action={action} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">
            Alasan <span className="text-danger">*</span>
          </label>
          <Textarea
            name="reason"
            rows={2}
            required
            placeholder="Alasan pembatalan…"
            className="w-full text-sm border border-line rounded-action px-2 py-1.5 bg-transparent text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-focus resize-none"
          />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <FormActions>
          <Button variant="ghost" size="sm" data-dialog-cancel disabled={pending}>
            Batal
          </Button>
          <Button variant="danger-primary" size="sm" type="submit" disabled={pending}>
            {pending ? "Menghentikan…" : "Hentikan ronde"}
          </Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}

// ── Reopen Phase Dialog ──────────────────────────────────────────────────────

function ReopenPhaseDialog({
  phaseId,
  phaseName,
  hasRounds,
  projectId,
  onClose,
}: {
  phaseId: string;
  phaseName: string;
  hasRounds: boolean;
  projectId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    (hasRounds ? reopenPhaseAction : reopenSupervisionAction).bind(null, projectId, phaseId),
    null as ActionResult<void> | null,
  );
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  const error = state?.ok === false ? state.error.safeMessage : null;
  return (
    <DraftDialog
      open
      pending={pending}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Buka kembali fase ${phaseName}?`}
      description={hasRounds ? "Fase dibuka kembali; ronde baru dapat dimulai setelah ini." : "Supervisi kembali ke keadaan sedang berjalan."}
      size="sm"
    >
      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-secondary">Alasan *</label>
          <Textarea
            name="reason"
            required
            rows={2}
            placeholder="Kenapa fase ini dibuka kembali?"
            className="resize-none"
          />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <FormActions>
          <Button variant="secondary" size="sm" data-dialog-cancel>
            Batal
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={pending}>
            {pending ? "Membuka…" : "Buka kembali"}
          </Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}

// ── Close By Exception Dialog ─────────────────────────────────────────────────

function CloseByExceptionDialog({
  phaseId,
  phaseName,
  projectId,
  onClose,
}: {
  phaseId: string;
  phaseName: string;
  projectId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    closePhaseByExceptionAction.bind(null, projectId, phaseId),
    null as ActionResult<void> | null,
  );
  useEffect(() => { if (state?.ok) onClose(); }, [state, onClose]);
  const error = state?.ok === false ? state.error.safeMessage : null;
  return (
    <DraftDialog
      open
      pending={pending}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Tutup fase ${phaseName} dengan pengecualian?`}
      description="Fase ditutup tanpa persetujuan ronde terakhir. Tidak boleh ada ronde yang masih DRAFT atau SENT."
      size="sm"
    >
      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink-secondary">Alasan pengecualian *</label>
          <Textarea
            name="reason"
            required
            rows={2}
            placeholder="Kenapa fase ini ditutup sebelum selesai?"
            className="resize-none"
          />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <FormActions>
          <Button variant="secondary" size="sm" data-dialog-cancel>
            Batal
          </Button>
          <Button variant="danger-primary" size="sm" type="submit" disabled={pending}>
            {pending ? "Menutup…" : "Tutup dengan pengecualian"}
          </Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}

// ── Iteration Block ───────────────────────────────────────────────────────────

function IterationBlock({
  iteration,
  phase,
  projectId,
  canReview,
  onSend,
  onRespond,
  onVoid,
}: {
  iteration: IterationItem;
  phase: PhaseItem;
  projectId: string;
  canReview: boolean;
  onSend: (id: string, label: string, openPoints: number, missingApproval: boolean) => void;
  onRespond: (id: string, label: string, canFinishPhase: boolean) => void;
  onVoid: (id: string, label: string) => void;
}) {
  const label = iterLabel(phase, iteration.number);
  const isDraft = iteration.state === "DRAFT";
  const isSent = iteration.state === "SENT";
  const isVoided = iteration.state === "VOIDED";
  const isSuperseded = iteration.state === "SUPERSEDED";
  const isActive = isDraft || isSent;

  const activePoints = iteration.points.filter((p) => !p.withdrawn_at);
  const openPoints = activePoints.filter((p) => !p.done).length;

  const sentAgeText =
    isSent && iteration.sent_at
      ? `dikirim ${ageLabel(iteration.sent_at)} lalu`
      : ITER_STATE_LABELS[iteration.state] ?? iteration.state;

  const [approvalState, approvalAction, approvalPending] = useActionState(
    recordInternalApprovalAction.bind(null, projectId, iteration.id),
    null as ActionResult<void> | null,
  );
  const approvalError = approvalState?.ok === false ? approvalState.error.safeMessage : null;

  return (
    <div
      className={[
        "flex flex-col gap-1.5 rounded-action px-3 py-2.5",
        isActive
          ? "border border-line bg-surface"
          : "border border-transparent",
        isVoided || isSuperseded ? "opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Label + state + action */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`text-sm font-medium shrink-0 ${
            isDraft
              ? "text-ink"
              : isVoided || isSuperseded
              ? "text-ink-tertiary"
              : "text-ink-secondary"
          }`}
        >
          {label}
        </span>
        <span className="flex-1 min-w-0 text-sm text-ink-tertiary truncate">
          {isSent ? sentAgeText : ITER_STATE_LABELS[iteration.state] ?? iteration.state}
        </span>

        {/* ACC indicator — when internal_approval exists */}
        {iteration.internal_approval && (
          <span className="shrink-0 text-xs text-ink-tertiary">
            ACC {iteration.internal_approval.approver}
          </span>
        )}

        {isDraft && phase.requires_internal_approval && !iteration.internal_approval && canReview && (
          <form action={approvalAction}>
            <Button variant="secondary" size="sm" type="submit" disabled={approvalPending}>
              {approvalPending ? "Mencatat…" : "ACC"}
            </Button>
          </form>
        )}

        {/* Primary action — never two at once */}
        {isDraft && canReview && (
          <Button

 onClick={() =>
 onSend(
 iteration.id,
 label,
 openPoints,
 phase.requires_internal_approval && !iteration.internal_approval,
 )
 }
 variant="secondary" size="sm" className="shrink-0"
 >
            Kirim ke klien
          </Button>
        )}
        {isSent && canReview && (
          <Button

 onClick={() => {
 const otherOpen = phase.iterations.some(
 (i) => i.id !== iteration.id && (i.state === "DRAFT" || i.state === "SENT"),
 );
 onRespond(iteration.id, label, !otherOpen);
 }}
 variant="secondary" size="sm" className="shrink-0"
 >
            Catat jawaban klien
          </Button>
        )}
        {/* ⋯ menu — void, withdraw send (disabled until service supports it) */}
        {(isDraft || isSent) && canReview && (
          <RowActionMenu
            label={`Aksi untuk ${label}`}
            items={[
              ...(isSent
                ? [
                    {
                      label: "Tarik pengiriman",
                      disabled: true,
                      onSelect: () => {},
                    } as const,
                  ]
                : []),
              {
              label: "Hentikan ronde",
                danger: true,
                separatorBefore: isSent,
                onSelect: () => onVoid(iteration.id, label),
              },
            ]}
          />
        )}
      </div>

      {approvalError && <InlineError>{approvalError}</InlineError>}

      {/* Revision points checklist (DRAFT only, when points exist) */}
      {isDraft && activePoints.length > 0 && (
        <div className="flex flex-col gap-1 ml-10 mt-0.5">
          {activePoints.map((point) => (
            <div key={point.id} className="flex items-start gap-1.5">
              <span
                className={`shrink-0 text-xs mt-0.5 ${
                  point.done
                    ? "text-success"
                    : "text-ink-tertiary"
                }`}
              >
                {point.done ? "✓" : "○"}
              </span>
              <span
                className={`text-xs leading-relaxed ${
                  point.done
                    ? "line-through text-ink-tertiary"
                    : "text-ink-secondary"
                } ${point.source === "CLIENT_REVISION" && !point.done ? "italic" : ""}`}
              >
                {point.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Void reason (VOIDED only) */}
      {isVoided && iteration.void_reason && (
        <p className="text-xs text-ink-tertiary mt-0.5 ml-1 italic">
          Alasan: {iteration.void_reason}
        </p>
      )}
    </div>
  );
}

// ── Phase Block ───────────────────────────────────────────────────────────────

function PhaseBlock({
  phase,
  projectId,
  canManage,
  canReview,
  canOverride,
  defaultOpen,
  onSend,
  onRespond,
  onVoid,
  onReopen,
  onCloseByException,
  taskPhases,
  assignableUsers,
}: {
  phase: PhaseItem;
  projectId: string;
  canManage: boolean;
  canReview: boolean;
  canOverride: boolean;
  defaultOpen: boolean;
  onSend: (id: string, label: string, openPoints: number, missingApproval: boolean) => void;
  onRespond: (id: string, label: string, canFinishPhase: boolean) => void;
  onVoid: (id: string, label: string) => void;
  onReopen: (id: string, name: string) => void;
  onCloseByException: (id: string, name: string) => void;
  taskPhases: Array<{ key: string; name: string }>;
  assignableUsers: Array<{ id: string; display_name: string }>;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Phase-level server actions — one per action type; bound to this phase
  const [openIterState, openIterAction, openIterPending] = useActionState(
    openIterationAction.bind(null, projectId, phase.id),
    null as ActionResult<void> | null,
  );
  const [finishState, finishAction, finishPending] = useActionState(
    finishPhaseAction.bind(null, projectId, phase.id),
    null as ActionResult<void> | null,
  );
  const [startSupState, startSupAction, startSupPending] = useActionState(
    startSupervisionAction.bind(null, projectId, phase.id),
    null as ActionResult<void> | null,
  );
  const [finishSupState, finishSupAction, finishSupPending] = useActionState(
    finishSupervisionAction.bind(null, projectId, phase.id),
    null as ActionResult<void> | null,
  );

  const isDone = phase.state === "DONE";
  const isWaiting = phase.state === "WAITING_CLIENT";

  // Compute allowed phase-level actions (rounds)
  const hasOpenIter = phase.iterations.some(
    (i) => i.state === "DRAFT" || i.state === "SENT",
  );
  const latestNonVoided = phase.iterations.find((i) => i.state !== "VOIDED");
  const canFinish =
    phase.has_rounds &&
    !hasOpenIter &&
    latestNonVoided?.state === "APPROVED" &&
    !isDone;
  const canStartRound = phase.has_rounds && !hasOpenIter && !isDone && canManage;

  // Waiting age label
  let waitingAge: string | null = null;
  if (isWaiting) {
    const oldest = [...phase.iterations]
      .filter((i) => i.state === "SENT" && i.sent_at)
      .sort((a, b) => new Date(a.sent_at!).getTime() - new Date(b.sent_at!).getTime())[0];
    if (oldest?.sent_at) waitingAge = ageLabel(oldest.sent_at);
  }

  const stateText = PHASE_STATE_LABELS[phase.state] ?? phase.state;
  const phaseActionError =
    (openIterState?.ok === false ? openIterState.error.safeMessage : null) ??
    (finishState?.ok === false ? finishState.error.safeMessage : null) ??
    (startSupState?.ok === false ? startSupState.error.safeMessage : null) ??
    (finishSupState?.ok === false ? finishSupState.error.safeMessage : null);

  return (
    <Surface className="overflow-hidden">
      {/* Header row */}
      <div
        className={`flex items-center gap-2 px-4 py-3 ${
          isDone
            ? "bg-surface-muted"
            : "bg-surface"
        }`}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left select-none"
        >
          <span className="shrink-0 text-ink-tertiary">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span
            className={`min-w-0 flex-1 text-sm font-medium ${
              isDone ? "text-ink-tertiary" : "text-ink"
            }`}
          >
            {phase.name}
          </span>
        </button>

        {/* Right side: state label + optional action button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className={`text-xs ${
              isWaiting
                ? "text-ink-secondary font-medium"
                : "text-ink-tertiary"
            }`}
          >
            {waitingAge ? `${stateText} · ${waitingAge}` : stateText}
          </span>

          {/* Supervision actions */}
          {!phase.has_rounds && phase.state === "NOT_STARTED" && canReview && (
            <form action={startSupAction}>
              <Button
 type="submit"
 disabled={startSupPending}
 variant="secondary" size="sm"
 >
                Mulai
              </Button>
            </form>
          )}
          {!phase.has_rounds && phase.state === "IN_PROGRESS" && canReview && (
            <form action={finishSupAction}>
              <Button
 type="submit"
 disabled={finishSupPending}
 variant="secondary" size="sm"
 >
                Selesaikan
              </Button>
            </form>
          )}

          {/* Round-bearing phase actions */}
          {canFinish && canReview && (
            <form action={finishAction}>
              <Button
 type="submit"
 disabled={finishPending}
 variant="secondary" size="sm"
 >
                Selesaikan fase
              </Button>
            </form>
          )}
          {!canFinish && canStartRound && (
            <form action={openIterAction}>
              <Button
 type="submit"
 disabled={openIterPending}
 variant="secondary" size="sm"
 >
                Mulai ronde
              </Button>
            </form>
          )}

          {/* Phase-level ⋯ menu — reopen (DONE), close by exception (active) */}
          {(canReview && isDone) || (canOverride && !isDone && !hasOpenIter) ? (
            <RowActionMenu
              label={`Aksi untuk fase ${phase.name}`}
              items={[
                ...(isDone
                  ? [
                      {
                        label: "Buka kembali",
                        onSelect: () => onReopen(phase.id, phase.name),
                      } as const,
                    ]
                  : []),
                ...(canOverride && !isDone && !hasOpenIter
                  ? [
                      {
                        label: "Tutup dengan pengecualian",
                        danger: true,
                        onSelect: () => onCloseByException(phase.id, phase.name),
                      } as const,
                    ]
                  : []),
              ]}
            />
          ) : null}
        </div>
      </div>

      {/* Phase action error */}
      {phaseActionError && (
        <div className="px-4 py-1.5 border-t border-line bg-surface-muted">
          <InlineError>{phaseActionError}</InlineError>
        </div>
      )}

      {/* Body — round-bearing */}
      {open && phase.has_rounds && (
        <div className="border-t border-line px-4 py-2.5 flex flex-col gap-1.5 bg-surface">
          <GeneralTaskBlock
            projectId={projectId}
            tasks={phase.tasks}
            canManage={canManage}
            phases={taskPhases}
            title={`TODO ${phase.name}`}
            phaseScope={phase.key}
            users={assignableUsers}
          />
          {phase.iterations.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-0.5">
              Belum ada ronde.
              {canManage && !isDone ? " Gunakan 'Mulai ronde' untuk memulai." : ""}
            </p>
          ) : (
            phase.iterations.map((iter) => (
              <IterationBlock
                key={iter.id}
                iteration={iter}
                phase={phase}
                projectId={projectId}
                canReview={canReview}
                onSend={onSend}
                onRespond={onRespond}
                onVoid={onVoid}
              />
            ))
          )}
        </div>
      )}

      {/* Body — supervision */}
      {open && !phase.has_rounds && (
        <div className="border-t border-line px-4 py-3 bg-surface">
          <GeneralTaskBlock
            projectId={projectId}
            tasks={phase.tasks}
            canManage={canManage}
            phases={taskPhases}
            title={`TODO ${phase.name}`}
            phaseScope={phase.key}
            users={assignableUsers}
          />
          <p className="text-sm text-ink-tertiary">
            {phase.state === "NOT_STARTED"
              ? "Supervisi belum dimulai."
              : phase.state === "IN_PROGRESS"
              ? "Supervisi sedang berjalan."
              : "Supervisi selesai."}
          </p>
        </div>
      )}
    </Surface>
  );
}

// ── Phase Section (exported) ──────────────────────────────────────────────────

export function PhaseSection({
  phases,
  projectId,
  canManage,
  canReview,
  canOverride,
  taskPhases,
  assignableUsers,
}: {
  phases: PhaseItem[];
  projectId: string;
  canManage: boolean;
  canReview: boolean;
  canOverride: boolean;
  taskPhases: Array<{ key: string; name: string }>;
  assignableUsers: Array<{ id: string; display_name: string }>;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [sendDialog, setSendDialog] = useState<{
    id: string;
    label: string;
    openPoints: number;
    missingApproval: boolean;
  } | null>(null);
  const [respondDialog, setRespondDialog] = useState<{
    id: string;
    label: string;
    canFinishPhase: boolean;
  } | null>(null);
  const [voidDialog, setVoidDialog] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [reopenDialog, setReopenDialog] = useState<{
    id: string;
    name: string;
    hasRounds: boolean;
  } | null>(null);
  const [closeByExDialog, setCloseByExDialog] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const filtered = filter ? phases.filter((p) => p.id === filter) : phases;

  return (
    <div className="flex flex-col gap-3">
      {/* Filter chips — only when multiple phases */}
      {phases.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            selected={filter === null}
            onClick={() => setFilter(null)}
            >
            Semua
          </FilterChip>
          {phases.map((phase) => (
            <FilterChip
              key={phase.id}
              selected={filter === phase.id}
              onClick={() => setFilter(phase.id)}
              >
              {phase.name}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Phase blocks */}
      <div className="flex flex-col gap-2">
        {filtered.map((phase) => (
          <PhaseBlock
            key={phase.id}
            phase={phase}
            projectId={projectId}
            canManage={canManage}
            canReview={canReview}
            canOverride={canOverride}
            defaultOpen={
              phase.state === "IN_PROGRESS" || phase.state === "WAITING_CLIENT"
            }
            onSend={(id, label, openPoints, missingApproval) =>
              setSendDialog({ id, label, openPoints, missingApproval })
            }
            onRespond={(id, label, canFinishPhase) =>
              setRespondDialog({ id, label, canFinishPhase })
            }
            onVoid={(id, label) => setVoidDialog({ id, label })}
            onReopen={(id, name) => {
              const phase = phases.find((candidate) => candidate.id === id);
              if (phase) setReopenDialog({ id, name, hasRounds: phase.has_rounds });
            }}
            onCloseByException={(id, name) => setCloseByExDialog({ id, name })}
            taskPhases={taskPhases}
            assignableUsers={assignableUsers}
          />
        ))}
      </div>

      {/* Dialogs */}
      {sendDialog && (
        <SendDialog
          key={sendDialog.id}
          iterationId={sendDialog.id}
          label={sendDialog.label}
          projectId={projectId}
          openPoints={sendDialog.openPoints}
          missingApproval={sendDialog.missingApproval}
          onClose={() => setSendDialog(null)}
        />
      )}
      {respondDialog && (
        <ResponseDialog
          key={respondDialog.id}
          iterationId={respondDialog.id}
          label={respondDialog.label}
          projectId={projectId}
          canFinishPhase={respondDialog.canFinishPhase}
          onClose={() => setRespondDialog(null)}
        />
      )}
      {voidDialog && (
        <VoidDialog
          key={voidDialog.id}
          iterationId={voidDialog.id}
          label={voidDialog.label}
          projectId={projectId}
          onClose={() => setVoidDialog(null)}
        />
      )}
      {reopenDialog && (
        <ReopenPhaseDialog
          key={reopenDialog.id}
          phaseId={reopenDialog.id}
          phaseName={reopenDialog.name}
          hasRounds={reopenDialog.hasRounds}
          projectId={projectId}
          onClose={() => setReopenDialog(null)}
        />
      )}
      {closeByExDialog && (
        <CloseByExceptionDialog
          key={closeByExDialog.id}
          phaseId={closeByExDialog.id}
          phaseName={closeByExDialog.name}
          projectId={projectId}
          onClose={() => setCloseByExDialog(null)}
        />
      )}
    </div>
  );
}
