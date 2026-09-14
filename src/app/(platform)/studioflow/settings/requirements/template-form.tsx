"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ActionResult } from "@platform/core/actions";
import { Button, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";
import { createRequirementTemplateAction, editRequirementTemplateAction } from "./actions";

const INITIAL: ActionResult<void> | null = null;

type PhaseTemplate = { id: string; name: string; key: string };

export function RequirementTemplateForm({ phaseTemplates, fixedPhaseTemplateId }: { phaseTemplates: PhaseTemplate[]; fixedPhaseTemplateId?: string }) {
  const [state, formAction, pending] = useActionState(createRequirementTemplateAction, INITIAL);
  const failure = state?.ok === false ? state.error.safeMessage : null;
  const fixedPhase = fixedPhaseTemplateId ? phaseTemplates.find((phase) => phase.id === fixedPhaseTemplateId) : null;

  return (
    <form action={formAction} className="grid max-w-xl gap-4">
      {failure ? <InlineError>{failure}</InlineError> : null}
      {fixedPhaseTemplateId ? <input type="hidden" name="scope" value="PHASE" /> : null}
      {fixedPhaseTemplateId ? <input type="hidden" name="phase_template_id" value={fixedPhaseTemplateId} /> : null}
      <Field label="Template key" description="Lowercase letters, numbers, hyphens, or underscores." required>
        <Input name="key" required maxLength={100} autoFocus />
      </Field>
      <Field label="Title" required>
        <Input name="title" required maxLength={200} />
      </Field>
      <Field label="Description">
        <Textarea name="description" maxLength={2000} rows={3} />
      </Field>
      {!fixedPhaseTemplateId ? (
        <Field label="Scope" required>
          <Select name="scope" defaultValue="GENERAL">
            <option value="GENERAL">General — every new project</option>
            <option value="PHASE">Phase — choose a phase template</option>
          </Select>
        </Field>
      ) : (
        <p className="text-sm text-ink-secondary">Phase: {fixedPhase?.name ?? "Selected phase template"}</p>
      )}
      {!fixedPhaseTemplateId ? (
        <Field label="Phase template" description="Required only for Phase scope.">
          <Select name="phase_template_id" defaultValue="">
            <option value="">None — General scope</option>
            {phaseTemplates.map((phase) => <option key={phase.id} value={phase.id}>{phase.name} ({phase.key})</option>)}
          </Select>
        </Field>
      ) : null}
      <Field label="Sort order">
        <Input name="sort_order" type="number" min={0} step={1} defaultValue="0" />
      </Field>
      <FormActions>
        <Link href={fixedPhaseTemplateId ? `/studioflow/settings/phases/${fixedPhaseTemplateId}/requirements` : "/studioflow/settings/requirements"} className="text-sm text-action hover:underline">Cancel</Link>
        <Button type="submit" variant="primary" pending={pending}>Create template</Button>
      </FormActions>
    </form>
  );
}

export function EditRequirementTemplateForm({ template }: { template: { id: string; title: string; description: string | null; sort_order: number } }) {
  const [state, formAction, pending] = useActionState(editRequirementTemplateAction.bind(null, template.id), INITIAL);
  const failure = state?.ok === false ? state.error.safeMessage : null;
  return (
    <form action={formAction} className="grid gap-2 rounded-control border border-line-subtle bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] sm:items-end">
      {failure ? <InlineError>{failure}</InlineError> : null}
      <Field label="Title" required><Input name="title" defaultValue={template.title} required maxLength={200} /></Field>
      <Field label="Description"><Input name="description" defaultValue={template.description ?? ""} maxLength={2000} /></Field>
      <Field label="Order"><Input name="sort_order" type="number" min={0} step={1} defaultValue={template.sort_order} /></Field>
      <Button type="submit" variant="secondary" pending={pending}>Save</Button>
    </form>
  );
}
