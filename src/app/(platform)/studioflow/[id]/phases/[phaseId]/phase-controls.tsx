"use client";

import { useActionState } from "react";
import type { ActionResult } from "@platform/core/actions";
import { Button, Field, InlineError, Input } from "@/platform/ui_engine";

import {
  closePhaseByExceptionAction,
  finishPhaseAction,
  finishSupervisionAction,
  openIterationAction,
  recordFileAction,
  reopenPhaseAction,
  reopenSupervisionAction,
  startSupervisionAction,
} from "./actions";

const INITIAL: ActionResult<void> | null = null;

/** The shape every bound phase action has once its ids are applied. */
type BoundAction = (
  prev: ActionResult<void> | null,
  formData: FormData,
) => Promise<ActionResult<void>>;

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const failureOf = (state: ActionResult<void> | null) =>
  state?.ok === false ? state.error.safeMessage : null;

/** A submit-only form (no extra input) bound to one phase action. */
function SimpleAction({
  action,
  label,
  variant = "primary",
}: {
  action: BoundAction;
  label: string;
  variant?: ButtonVariant;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const failure = failureOf(state);

  return (
    <div className="grid gap-1">
      <form action={formAction}>
        <Button type="submit" variant={variant} pending={pending}>{label}</Button>
      </form>
      {failure ? <InlineError>{failure}</InlineError> : null}
    </div>
  );
}

/** A form that requires a free-text reason before submitting. */
function ReasonAction({
  action,
  label,
  reasonLabel,
  variant = "secondary",
}: {
  action: BoundAction;
  label: string;
  reasonLabel: string;
  variant?: ButtonVariant;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const failure = failureOf(state);

  return (
    <div className="grid gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <Field label={reasonLabel} required>
          <Input name="reason" required maxLength={500} placeholder="Write the reason…" />
        </Field>
        <Button type="submit" variant={variant} pending={pending}>{label}</Button>
      </form>
      {failure ? <InlineError>{failure}</InlineError> : null}
    </div>
  );
}

// ── Supervision phase (has_rounds = false) ───────────────────────────────────

export function SupervisionControls({
  phaseId,
  projectId,
  state,
  canReview,
}: {
  phaseId: string;
  projectId: string;
  state: string;
  canReview: boolean;
}) {
  if (!canReview) return null;
  return (
    <div className="mt-4 flex flex-wrap items-start gap-3">
      {state === "NOT_STARTED" && (
        <SimpleAction action={startSupervisionAction.bind(null, phaseId, projectId)} label="Start supervision" />
      )}
      {state === "IN_PROGRESS" && (
        <SimpleAction action={finishSupervisionAction.bind(null, phaseId, projectId)} label="Finish supervision" />
      )}
      {state === "DONE" && (
        <ReasonAction
          action={reopenSupervisionAction.bind(null, phaseId, projectId)}
          label="Reopen"
          reasonLabel="Reason for reopening"
        />
      )}
    </div>
  );
}

// ── Iteration-bearing phase ──────────────────────────────────────────────────

export function PhaseControls({
  phaseId,
  projectId,
  state,
  hasDraft,
  canManage,
  canReview,
  canOverride,
}: {
  phaseId: string;
  projectId: string;
  state: string;
  hasDraft: boolean;
  canManage: boolean;
  canReview: boolean;
  canOverride: boolean;
}) {
  const open = state !== "DONE";

  return (
    <div className="mt-4 flex flex-wrap items-start gap-3">
      {open && canManage && !hasDraft && (
        <SimpleAction action={openIterationAction.bind(null, phaseId, projectId)} label="Start new round" />
      )}
      {open && canReview && (
        <SimpleAction
          action={finishPhaseAction.bind(null, phaseId, projectId)}
          label="Finish phase"
          variant="secondary"
        />
      )}
      {open && canOverride && (
        <ReasonAction
          action={closePhaseByExceptionAction.bind(null, phaseId, projectId)}
          label="Close (exception)"
          reasonLabel="Exception reason"
          variant="danger"
        />
      )}
      {!open && canReview && (
        <ReasonAction
          action={reopenPhaseAction.bind(null, phaseId, projectId)}
          label="Reopen"
          reasonLabel="Reason for reopening"
        />
      )}
    </div>
  );
}

// ── RECORDED file drop (metadata only) ───────────────────────────────────────

export function RecordFileForm({
  projectId,
  phaseId,
  folderKey,
}: {
  projectId: string;
  phaseId: string;
  folderKey: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    recordFileAction.bind(null, projectId, phaseId),
    INITIAL,
  );
  const failure = failureOf(state);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="folder_key" value={folderKey ?? ""} />
      {failure ? <div className="sm:col-span-2"><InlineError>{failure}</InlineError></div> : null}
      <Field label="Original file name" required>
        <Input name="original_filename" required maxLength={300} placeholder="Denah Lantai 1.pdf" />
      </Field>
      <Field label="Size (bytes)" required>
        <Input name="bytes" type="number" min="1" required placeholder="2048000" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" pending={pending}>Record file</Button>
      </div>
    </form>
  );
}
