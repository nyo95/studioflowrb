"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { ActionResult } from "@platform/core/actions";
import { Button, Field, InlineError, Input, SectionCard, Text, Textarea, useConfirm, useFormDraftGuard } from "@/platform/ui_engine";
import { createMomAction, discardMomAction, issueMomAction } from "./mom-actions";

/* The meeting date arrives already formatted: this component also renders on
   the server, so formatting it here against the viewer's own locale would both
   ignore the platform display settings (CORE §10) and mismatch on hydration. */
type Mom = { id: string; topic: string; meeting_at_label: string; state: "DRAFT" | "ISSUED" | "SUPERSEDED"; sequence: number | null; prepared_by_name: string };

function CreateMomForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(createMomAction.bind(null, projectId), null as ActionResult<void> | null);
  const ref = useRef<HTMLFormElement>(null);
  const guard = useFormDraftGuard({ formRef: ref, resetKey: projectId, active: true, guardNavigation: true });
  const { markSaved } = guard;
  useEffect(() => {
    if (!state?.ok) return;
    ref.current?.reset();
    markSaved();
  }, [markSaved, state]);
  return <form ref={ref} action={action} onChange={guard.onFormChange} className="grid gap-3 border-t border-line pt-3">
    <Field label="Topic" required><Input name="topic" required maxLength={255} disabled={pending} /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Meeting date" required><Input name="meeting_at" type="datetime-local" required disabled={pending} /></Field><Field label="Prepared by" required><Input name="prepared_by_name" required maxLength={255} disabled={pending} /></Field></div>
    <Field label="Venue"><Input name="venue" maxLength={255} disabled={pending} /></Field>
    <Field label="Attendees"><Textarea name="attendees_text" rows={2} maxLength={4000} disabled={pending} /></Field>
    {state?.ok === false ? <InlineError>{state.error.safeMessage}</InlineError> : null}
    <div><Button type="submit" variant="primary" size="sm" pending={pending}>Create draft MOM</Button></div>
    {guard.confirmDialog}
  </form>;
}

export function MomSection({ projectId, moms, canManage, canIssue }: { projectId: string; moms: Mom[]; canManage: boolean; canIssue: boolean }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  const execute = async (kind: "issue" | "discard", momId: string, topic: string) => {
    const accepted = await confirm.confirm({
      title: kind === "issue" ? "Issue this MOM?" : "Discard this draft?",
      description: kind === "issue" ? `“${topic}” will become an immutable numbered record.` : `“${topic}” and its stored images will be permanently removed.`,
      confirmLabel: kind === "issue" ? "Issue MOM" : "Discard draft",
      tone: kind === "issue" ? "primary" : "danger",
    });
    if (!accepted) return;
    startTransition(async () => {
      setFailure(null);
      const result = kind === "issue" ? await issueMomAction(projectId, momId, null, new FormData()) : await discardMomAction(projectId, momId, null, new FormData());
      if (!result.ok) setFailure(result.error.safeMessage);
    });
  };

  return <SectionCard title="Minutes of Meeting" count={moms.length ? String(moms.length) : undefined}>
    {failure ? <InlineError>{failure}</InlineError> : null}
    {moms.length === 0 ? <Text as="p" tone="tertiary" size="sm">No MOM documents yet.</Text> : <div className="grid gap-2">{moms.map((mom) => <div key={mom.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{mom.topic}</p><p className="text-xs text-ink-tertiary">{mom.state === "ISSUED" && mom.sequence ? `MOM ${mom.sequence} · ` : ""}{mom.state} · {mom.meeting_at_label}</p></div><Link href={`/studioflow/projects/${projectId}/mom/${mom.id}`} className="rounded-action px-2 py-1 text-sm font-medium text-action hover:underline">Open</Link>{mom.state === "DRAFT" && canIssue ? <Button variant="secondary" size="sm" pending={pending} onClick={() => execute("issue", mom.id, mom.topic)}>Issue</Button> : null}{mom.state === "DRAFT" && canManage ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => execute("discard", mom.id, mom.topic)}>Discard</Button> : null}</div>)}</div>}
    {canManage ? <CreateMomForm projectId={projectId} /> : null}
    {confirm.dialog}
  </SectionCard>;
}
