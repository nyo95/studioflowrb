"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";
import type { BqProjectDetail, BqTemplateRead } from "@/apps/bq/public";
import { createProjectAction, updateProjectAction } from "./actions";

const INITIAL = null;

export function ProjectForm({ project, templates = [] }: { project?: BqProjectDetail; templates?: BqTemplateRead[] }) {
  const action = project ? updateProjectAction : createProjectAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const failure = state?.ok === false ? state.error.safeMessage : null;

  return <form action={formAction} className="grid gap-4">
    {failure ? <InlineError>{failure}</InlineError> : null}
    {project ? <input type="hidden" name="id" value={project.id} /> : null}
    <Field label="Judul project" required><Input name="title" required maxLength={160} defaultValue={project?.title} autoFocus /></Field>
    <Field label="Klien" required><Input name="clientName" required maxLength={160} defaultValue={project?.clientName} /></Field>
    {!project && templates.length > 0 ? <Field label="Template" description="Opsional — memuat scaffold Section dan Subsection dari template."><Select name="templateId" defaultValue=""><option value="">Tanpa template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></Field> : null}
    <Field label="Referensi eksternal"><Input name="externalRef" maxLength={160} defaultValue={project?.externalRef ?? ""} /></Field>
    <Field label="Catatan"><Textarea name="notes" maxLength={2000} defaultValue={project?.notes ?? ""} /></Field>
    <FormActions><Link href={project ? `/bq/${project.id}` : "/bq"} className="text-sm text-action hover:underline">Batal</Link><Button type="submit" variant="primary" pending={pending}>{project ? "Simpan perubahan" : "Buat project"}</Button></FormActions>
  </form>;
}
