"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@platform/core/actions";
import { Button, Field, FormActions, InlineError, Input } from "@/platform/ui_engine";

import { updateNamingTemplateAction } from "./actions";

const INITIAL: ActionResult<void> | null = null;

/** The vocabulary the service accepts (§8.5). Anything else is rejected. */
const TOKENS = [
  { token: "{date}", label: "Tanggal drop, format YYYYMMDD" },
  { token: "{project}", label: "Nama project" },
  { token: "{location}", label: "Lokasi singkat project" },
  { token: "{round}", label: "Label round, misal “D4 2”" },
  { token: "{code}", label: "Kode project, misal SF26-0001" },
] as const;

/** Mirrors the service preview so the studio sees the shape before saving. */
function preview(template: string): string {
  return template
    .replace("{date}", "20260908")
    .replace("{project}", "Rumah Bu Sari")
    .replace("{location}", "Funan")
    .replace("{round}", "D4 2")
    .replace("{code}", "SF26-0001")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function NamingTemplateForm({
  template,
  canManage,
}: {
  template: string;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateNamingTemplateAction, INITIAL);
  const [draft, setDraft] = useState(template);
  const failure = state && !state.ok ? state.error.safeMessage : null;
  const saved = state?.ok === true;

  return (
    <form action={formAction} className="grid gap-4 max-w-xl">
      {failure ? <InlineError>{failure}</InlineError> : null}
      {saved && !failure ? (
        <p className="text-sm text-green-600 dark:text-green-400">Template tersimpan.</p>
      ) : null}

      <Field label="Template nama file" required>
        <Input
          name="naming_template"
          required
          maxLength={300}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!canManage}
        />
      </Field>

      <div className="rounded border border-[var(--ui-border)] bg-[var(--ui-surface-raised)] px-4 py-3">
        <p className="text-xs text-[var(--ui-muted)]">Contoh hasil</p>
        <p className="mt-1 font-mono text-sm">{preview(draft) || "—"}.pdf</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-[var(--ui-muted)]">Token yang tersedia</p>
        <dl className="grid gap-1 text-sm">
          {TOKENS.map((entry) => (
            <div key={entry.token} className="flex gap-3">
              <dt className="w-24 shrink-0 font-mono text-xs">{entry.token}</dt>
              <dd className="text-[var(--ui-muted)]">{entry.label}</dd>
            </div>
          ))}
        </dl>
      </div>

      {canManage && (
        <FormActions>
          <Button type="submit" variant="primary" pending={pending}>Simpan template</Button>
        </FormActions>
      )}
    </form>
  );
}
