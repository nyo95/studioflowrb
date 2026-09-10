"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";
import { createProjectAction } from "./actions";

type ClientOption = { id: string; name: string };

const INITIAL = null;

const TYPE_OPTIONS = [
  { value: "RESIDENTIAL", label: "Residential" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "HOSPITALITY", label: "Hospitality" },
  { value: "OTHER", label: "Other" },
];

export function ProjectForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState(createProjectAction, INITIAL);
  const failure = state && !state.ok ? state.error.safeMessage : null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="grid gap-4 max-w-lg">
      {failure ? <InlineError>{failure}</InlineError> : null}
      <Field label="Project name" required>
        <Input name="name" required maxLength={200} autoFocus />
      </Field>
      <Field label="Client" required>
        <Select name="client_id" required defaultValue="">
          <option value="" disabled>Select a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Project type" required>
        <Select name="type" required defaultValue="">
          <option value="" disabled>Select a type…</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Opened on" required>
        <Input name="opened_at" type="date" required defaultValue={today} />
      </Field>
      <Field label="Location" description="Short label used in file names, for example: Funan">
        <Input name="location" maxLength={100} />
      </Field>
      <Field label="Site address">
        <Textarea name="address" maxLength={500} rows={2} />
      </Field>
      <Field label="Area (m²)">
        <Input name="area" type="number" min="0" step="0.01" />
      </Field>
      <FormActions>
        <Link href="/studioflow" className="text-sm text-action hover:underline">Cancel</Link>
        <Button type="submit" variant="primary" pending={pending}>Create project</Button>
      </FormActions>
    </form>
  );
}
