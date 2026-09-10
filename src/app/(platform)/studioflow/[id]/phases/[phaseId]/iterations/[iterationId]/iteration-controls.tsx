"use client";

import { useActionState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { ActionResult } from "@platform/core/actions";
import {
  Badge,
  Button,
  Field,
  InlineError,
  Input,
  Select,
  Textarea,
} from "@/platform/ui_engine";

import {
  addIterationPointAction,
  approveIterationAction,
  markPointDoneAction,
  sendIterationAction,
  voidIterationAction,
  recordResponseAction,
  withdrawPointAction,
} from "./actions";

const INITIAL: ActionResult<void> | null = null;

type BoundAction = (
  prev: ActionResult<void> | null,
  formData: FormData,
) => Promise<ActionResult<void>>;

const failureOf = (state: ActionResult<void> | null) =>
  state?.ok === false ? state.error.safeMessage : null;

type Ids = { iterationId: string; projectId: string; phaseId: string };

// ── Lifecycle buttons ─────────────────────────────────────────────────────────

function SimpleAction({
  action,
  label,
  variant = "primary",
}: {
  action: BoundAction;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
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

export function IterationLifecycle({
  iterationId,
  projectId,
  phaseId,
  state,
  canManage,
  canReview,
}: Ids & { state: string; canManage: boolean; canReview: boolean }) {
  const [voidState, voidAction, voidPending] = useActionState(
    voidIterationAction.bind(null, iterationId, projectId, phaseId),
    INITIAL,
  );
  const voidFailure = failureOf(voidState);
  const open = state === "DRAFT" || state === "SENT";

  return (
    <div className="mt-4 flex flex-wrap items-start gap-3">
      {state === "DRAFT" && canManage && (
        <SimpleAction
          action={sendIterationAction.bind(null, iterationId, projectId, phaseId)}
          label="Send to client"
        />
      )}
      {state === "SENT" && canReview && (
        <SimpleAction
          action={approveIterationAction.bind(null, iterationId, projectId, phaseId)}
          label="Setujui"
        />
      )}
      {open && canManage && (
        <div className="grid gap-1">
          <form action={voidAction} className="flex items-end gap-2">
            <Field label="Alasan batal" required>
              <Input name="reason" required maxLength={500} placeholder="Tulis alasan…" />
            </Field>
            <Button type="submit" variant="danger" pending={voidPending}>Cancel round</Button>
          </form>
          {voidFailure ? <InlineError>{voidFailure}</InlineError> : null}
        </div>
      )}
    </div>
  );
}

// ── Checklist ─────────────────────────────────────────────────────────────────

export function PointRow({
  point,
  iterationId,
  projectId,
  phaseId,
  editable,
}: Ids & {
  point: { id: string; text: string; done: boolean; source: string };
  editable: boolean;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    markPointDoneAction.bind(null, point.id, iterationId, projectId, phaseId),
    INITIAL,
  );
  const [wdState, wdAction, wdPending] = useActionState(
    withdrawPointAction.bind(null, point.id, iterationId, projectId, phaseId),
    INITIAL,
  );
  const failure = failureOf(toggleState) ?? failureOf(wdState);

  return (
    <div className="rounded-control border border-line px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex items-center gap-2 ${point.done ? "text-ink-tertiary line-through" : ""}`}>
          {point.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-ink-tertiary" />}
          {point.text}
          {point.source === "CLIENT_REVISION" && (
            <Badge>from client</Badge>
          )}
        </span>
        {editable && (
          <div className="flex shrink-0 items-center gap-2">
            <form action={toggleAction}>
              <input type="hidden" name="done" value={point.done ? "false" : "true"} />
              <Button type="submit" size="sm" variant="ghost" pending={togglePending}>
                {point.done ? "Buka" : "Selesai"}
              </Button>
            </form>
            <form action={wdAction} className="flex items-center gap-1">
              <Input name="reason" required maxLength={500} placeholder="Alasan tarik" className="h-8 w-36" />
              <Button type="submit" size="sm" variant="danger" pending={wdPending}>Tarik</Button>
            </form>
          </div>
        )}
      </div>
      {failure ? <div className="mt-1"><InlineError>{failure}</InlineError></div> : null}
    </div>
  );
}

export function AddPointForm({ iterationId, projectId, phaseId }: Ids) {
  const [state, formAction, pending] = useActionState(
    addIterationPointAction.bind(null, iterationId, projectId, phaseId),
    INITIAL,
  );
  const failure = failureOf(state);

  return (
    <div className="mt-4 grid gap-1">
      <form action={formAction} className="flex items-end gap-2">
        <Field label="Poin baru" required>
          <Textarea name="text" required maxLength={1000} rows={2} placeholder="Tulis poin checklist…" />
        </Field>
        <Button type="submit" variant="primary" pending={pending}>Tambah poin</Button>
      </form>
      {failure ? <InlineError>{failure}</InlineError> : null}
    </div>
  );
}

// ── Client response (WO-5) ────────────────────────────────────────────────────

export function ResponseForm({ iterationId, projectId, phaseId }: Ids) {
  const [state, formAction, pending] = useActionState(
    recordResponseAction.bind(null, iterationId, projectId, phaseId),
    INITIAL,
  );
  const failure = failureOf(state);

  return (
    <div className="grid gap-1">
      <form action={formAction} className="grid gap-4 max-w-xl">
        {failure ? <InlineError>{failure}</InlineError> : null}
        <Field label="Client response" required>
          <Select name="kind" required defaultValue="REVISION">
            <option value="REVISION">Minta revisi</option>
            <option value="APPROVAL">Setuju / approve</option>
          </Select>
        </Field>
        <Field
          label="Poin revisi"
          description="Satu baris = satu poin. Ditulis persis seperti kata klien. Wajib kalau minta revisi."
        >
          <Textarea name="points" rows={4} maxLength={4000} placeholder={"Warna dinding terlalu gelap\nTambah storage di dapur"} />
        </Field>
          <Field label="Notes">
          <Textarea name="note" rows={2} maxLength={2000} placeholder="Konteks tambahan (opsional)" />
        </Field>
        <div>
          <Button type="submit" variant="primary" pending={pending}>Record response</Button>
        </div>
      </form>
    </div>
  );
}
