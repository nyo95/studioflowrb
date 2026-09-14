"use client";

import { useActionState } from "react";
import type { ActionResult } from "@platform/core/actions";
import {
  Badge, Button, Field, FormActions, InlineError, Input, Select, Textarea,
} from "@/platform/ui_engine";
import {
  archiveRequirementAction, createProjectRequirementAction, editProjectRequirementAction,
  linkEvidenceAction, reopenRequirementAction, restoreRequirementAction,
  satisfyRequirementAction, unlinkEvidenceAction,
} from "./actions";

const INITIAL: ActionResult<void> | null = null;

export type RequirementWorkflowRow = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  satisfaction_state: "OPEN" | "SATISFIED";
  satisfaction_note: string | null;
  archived_at: string | null;
  evidence: Array<{ id: string; file: { id: string; filename: string } }>;
};

export type RequirementWorkflowFile = { id: string; filename: string };

export function RequirementCreateForm({ projectId, phaseId, phaseName }: { projectId: string; phaseId?: string; phaseName?: string }) {
  const [state, action, pending] = useActionState(createProjectRequirementAction.bind(null, projectId), INITIAL);
  const failure = state?.ok === false ? state.error.safeMessage : null;
  return (
    <form action={action} className="grid gap-3 border-b border-line-subtle px-3.5 py-3">
      {failure ? <InlineError>{failure}</InlineError> : null}
      {phaseId ? <input type="hidden" name="phase_id" value={phaseId} /> : null}
      <Field label={phaseName ? `${phaseName} requirement` : "New general requirement"} required>
        <Input name="title" required maxLength={200} placeholder="Requirement title" />
      </Field>
      <Field label="Description"><Textarea name="description" maxLength={2000} rows={2} /></Field>
      <FormActions><Button type="submit" variant="primary" pending={pending}>Add requirement</Button></FormActions>
    </form>
  );
}

function ReasonAction({ label, action, pending, tone = "secondary" }: { label: string; action: (formData: FormData) => void; pending: boolean; tone?: "secondary" | "danger" }) {
  return <form action={action} className="flex items-center gap-1"><Input name="reason" required maxLength={500} placeholder="Reason" aria-label={`${label} reason`} /><Button type="submit" variant={tone} pending={pending}>{label}</Button></form>;
}

export function RequirementWorkflowRow({ projectId, requirement, files, canManage }: { projectId: string; requirement: RequirementWorkflowRow; files: RequirementWorkflowFile[]; canManage: boolean }) {
  const [editState, editAction, editPending] = useActionState(editProjectRequirementAction.bind(null, projectId, requirement.id), INITIAL);
  const [satisfyState, satisfyAction, satisfyPending] = useActionState(satisfyRequirementAction.bind(null, projectId, requirement.id), INITIAL);
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenRequirementAction.bind(null, projectId, requirement.id), INITIAL);
  const [archiveState, archiveAction, archivePending] = useActionState(archiveRequirementAction.bind(null, projectId, requirement.id), INITIAL);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreRequirementAction.bind(null, projectId, requirement.id), INITIAL);
  const [linkState, linkAction, linkPending] = useActionState(linkEvidenceAction.bind(null, projectId, requirement.id), INITIAL);
  const activeEvidenceIds = new Set(requirement.evidence.map((entry) => entry.file.id));
  const availableFiles = files.filter((file) => !activeEvidenceIds.has(file.id));
  const failure = [editState, satisfyState, reopenState, archiveState, restoreState, linkState].find((state) => state?.ok === false)?.error.safeMessage;

  return (
    <li className="border-b border-line-subtle px-3.5 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{requirement.title}</span>
            <Badge tone={requirement.archived_at ? "warning" : undefined}>{requirement.archived_at ? "ARCHIVED" : requirement.satisfaction_state}</Badge>
          </div>
          {requirement.description ? <p className="mt-0.5 text-sm text-ink-secondary">{requirement.description}</p> : null}
          {requirement.satisfaction_state === "SATISFIED" && requirement.satisfaction_note ? <p className="mt-1 text-xs text-ink-tertiary">Note: {requirement.satisfaction_note}</p> : null}
          {requirement.evidence.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">{requirement.evidence.map((entry) => <Badge key={entry.id}>{entry.file.filename}</Badge>)}</div> : null}
        </div>
      </div>
      {failure ? <div className="mt-2"><InlineError>{failure}</InlineError></div> : null}
      {canManage && !requirement.archived_at ? (
        <div className="mt-3 grid gap-2">
          <form action={editAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] sm:items-end">
            <Field label="Title"><Input name="title" defaultValue={requirement.title} maxLength={200} /></Field>
            <Field label="Description"><Input name="description" defaultValue={requirement.description ?? ""} maxLength={2000} /></Field>
            <Field label="Order"><Input name="sort_order" type="number" min={0} defaultValue={requirement.sort_order} /></Field>
            <Button type="submit" variant="secondary" pending={editPending}>Save</Button>
          </form>
          {requirement.satisfaction_state === "OPEN" ? (
            <form action={satisfyAction} className="flex flex-wrap items-end gap-2"><Field label="Satisfaction note" required><Input name="satisfaction_note" required maxLength={500} /></Field><Button type="submit" variant="primary" pending={satisfyPending}>Satisfy</Button></form>
          ) : <ReasonAction label="Reopen" action={reopenAction} pending={reopenPending} />}
          <ReasonAction label="Archive" action={archiveAction} pending={archivePending} tone="danger" />
          {availableFiles.length > 0 ? <form action={linkAction} className="flex flex-wrap items-end gap-2"><Field label="Link existing project file"><Select name="file_id" required defaultValue=""><option value="">Choose a file</option>{availableFiles.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}</Select></Field><Button type="submit" variant="secondary" pending={linkPending}>Link evidence</Button></form> : null}
        </div>
      ) : canManage ? (
        <div className="mt-3"><ReasonAction label="Restore" action={restoreAction} pending={restorePending} /></div>
      ) : null}
      {canManage && requirement.evidence.length > 0 ? <div className="mt-2 grid gap-1">{requirement.evidence.map((entry) => <EvidenceUnlinkForm key={entry.id} projectId={projectId} requirementId={requirement.id} evidenceId={entry.id} />)}</div> : null}
    </li>
  );
}

function EvidenceUnlinkForm({ projectId, requirementId, evidenceId }: { projectId: string; requirementId: string; evidenceId: string }) {
  const [state, action, pending] = useActionState(unlinkEvidenceAction.bind(null, projectId, requirementId, evidenceId), INITIAL);
  return <form action={action} className="flex flex-wrap items-center gap-2"><Input name="reason" required maxLength={500} placeholder="Reason to unlink evidence" aria-label="Unlink evidence reason" /><Button type="submit" variant="secondary" pending={pending}>Unlink evidence</Button>{state?.ok === false ? <InlineError>{state.error.safeMessage}</InlineError> : null}</form>;
}
