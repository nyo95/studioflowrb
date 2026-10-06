"use client";

import { useState } from "react";

import { Button, Field, FormActions, InlineError, Notice, SectionCard, Select } from "@/platform/ui_engine";

import { LOCALE_CHOICES, TIMEZONE_CHOICES } from "../settings/display-options";
import { updateMyPreferencesAction } from "./actions";

const DEFAULT = "";

/**
 * Personal display preferences. Empty means "use the organisation default" from General Settings, so a
 * later change of that default still reaches everyone who never chose their own.
 */
export function DisplayPreferencesForm({ locale, timezone, organisationLocale, organisationTimezone }: {
  locale: string | null;
  timezone: string | null;
  organisationLocale: string;
  organisationTimezone: string;
}) {
  const [draft, setDraft] = useState({ locale: locale ?? DEFAULT, timezone: timezone ?? DEFAULT });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = draft.locale !== (locale ?? DEFAULT) || draft.timezone !== (timezone ?? DEFAULT);
  const timezones: readonly string[] = TIMEZONE_CHOICES;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateMyPreferencesAction({ locale: draft.locale || null, timezone: draft.timezone || null });
    setPending(false);
    if (result.ok) setSaved(true);
    else setError(result.error.safeMessage);
  };

  return (
    <SectionCard title="Display" description="How dates, times and numbers look for you. Only you see this." padded>
      <form className="grid gap-3.5" onSubmit={save}>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field id="preference-locale" label="Date and number format">
            <Select id="preference-locale" value={draft.locale} onChange={(event) => { setSaved(false); setDraft((d) => ({ ...d, locale: event.target.value })); }} disabled={pending}>
              <option value={DEFAULT}>Organisation default ({organisationLocale})</option>
              {locale && !LOCALE_CHOICES.some((choice) => choice.value === locale) ? <option value={locale}>{locale}</option> : null}
              {LOCALE_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </Select>
          </Field>
          <Field id="preference-timezone" label="Timezone">
            <Select id="preference-timezone" value={draft.timezone} onChange={(event) => { setSaved(false); setDraft((d) => ({ ...d, timezone: event.target.value })); }} disabled={pending}>
              <option value={DEFAULT}>Organisation default ({organisationTimezone})</option>
              {timezone && !timezones.includes(timezone) ? <option value={timezone}>{timezone}</option> : null}
              {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </Select>
          </Field>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        {saved ? <Notice tone="success" title="Saved">Your display preferences apply on every page.</Notice> : null}
        <FormActions>
          <Button type="submit" variant="primary" disabled={!changed || pending}>{pending ? "Saving…" : "Save preferences"}</Button>
        </FormActions>
      </form>
    </SectionCard>
  );
}
