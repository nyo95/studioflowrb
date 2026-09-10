"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";

import type { ActionResult } from "@platform/core/actions";
import { Button, Field, InlineError, Input, Textarea, useConfirm, useFormDraftGuard } from "@/platform/ui_engine";
import { supersedeMomAction } from "../mom-actions";

export function MomCorrectionForm({ projectId, momId, defaults }: { projectId: string; momId: string; defaults: { topic: string; meeting_at: string; venue: string | null; attendees_text: string | null; prepared_by_name: string } }) {
  const [state, dispatch, pending] = useActionState(supersedeMomAction.bind(null, projectId, momId), null as ActionResult<void> | null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const guard = useFormDraftGuard({ formRef, resetKey: momId, active: true, guardNavigation: true });
  const confirm = useConfirm();
  const { markSaved } = guard;
  useEffect(() => { if (state?.ok) markSaved(); }, [markSaved, state]);

  return <form ref={formRef} onChange={guard.onFormChange} onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    void confirm.confirm({ title: "Issue corrected MOM?", description: "A new numbered record will be issued and this MOM will be marked superseded.", confirmLabel: "Issue correction", tone: "primary" }).then((accepted) => {
      if (accepted) startTransition(() => dispatch(new FormData(form)));
    });
  }} className="grid gap-3">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Topic" required><Input name="topic" required maxLength={255} defaultValue={defaults.topic} disabled={pending} /></Field><Field label="Meeting date" required><Input name="meeting_at" type="datetime-local" required defaultValue={defaults.meeting_at} disabled={pending} /></Field></div>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Venue"><Input name="venue" maxLength={255} defaultValue={defaults.venue ?? ""} disabled={pending} /></Field><Field label="Prepared by" required><Input name="prepared_by_name" required maxLength={255} defaultValue={defaults.prepared_by_name} disabled={pending} /></Field></div>
    <Field label="Attendees"><Textarea name="attendees_text" rows={2} maxLength={4000} defaultValue={defaults.attendees_text ?? ""} disabled={pending} /></Field>
    {state?.ok === false ? <InlineError>{state.error.safeMessage}</InlineError> : null}
    <div><Button type="submit" variant="primary" pending={pending}>Issue corrected MOM</Button></div>
    {guard.confirmDialog}{confirm.dialog}
  </form>;
}
