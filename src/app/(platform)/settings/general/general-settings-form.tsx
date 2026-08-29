"use client";

import { useActionState } from "react";

import {
  Button,
  Field,
  FormActions,
  Input,
  InlineError,
  Notice,
  SectionCard,
  Select,
  Spinner,
} from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import type { PlatformGeneralSettings } from "@platform/core/settings";
import { updateGeneralSettingsAction } from "./actions";

const INITIAL: ActionResult<{ changed: boolean }> | null = null;

const TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Tokyo",
  "UTC",
  "Europe/London",
  "America/New_York",
];

export function GeneralSettingsForm({
  settings,
  canManage,
}: {
  settings: PlatformGeneralSettings;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(updateGeneralSettingsAction, INITIAL);
  const disabled = !canManage || pending;

  return (
    <SectionCard>
      <form action={action}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Field id="settings-organization" label="Organization name">
            <Input id="settings-organization" name="organizationName" defaultValue={settings.organizationName} required maxLength={120} disabled={disabled} />
          </Field>
          <Field id="settings-app-title" label="Application title">
            <Input id="settings-app-title" name="appTitle" defaultValue={settings.appTitle} required maxLength={120} disabled={disabled} />
          </Field>
          <Field id="settings-locale" label="Locale">
            <Input id="settings-locale" name="locale" defaultValue={settings.locale} required disabled={disabled} />
          </Field>
          <Field id="settings-timezone" label="Timezone">
            <Select id="settings-timezone" name="timezone" defaultValue={settings.timezone} disabled={disabled}>
              {TIMEZONES.includes(settings.timezone) ? null : <option value={settings.timezone}>{settings.timezone}</option>}
              {TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="settings-currency" label="Currency" description="Three-letter ISO-4217 code.">
            <Input id="settings-currency" name="currency" defaultValue={settings.currency} required minLength={3} maxLength={3} disabled={disabled} style={{ textTransform: "uppercase" }} />
          </Field>
          <Field id="settings-week-start" label="Week starts on">
            <Select id="settings-week-start" name="weekStartsOn" defaultValue={String(settings.weekStartsOn)} disabled={disabled}>
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </Select>
          </Field>
          <Field id="settings-brand-mark" label="Brand mark URL" description="Optional https URL or /path.">
            <Input id="settings-brand-mark" name="brandMarkUrl" defaultValue={settings.brandMarkUrl ?? ""} disabled={disabled} placeholder="https://…" />
          </Field>
        </div>

        {state && !state.ok ? (
          <div role="alert" style={{ marginTop: 12 }}>
            <InlineError>{state.error.safeMessage}</InlineError>
          </div>
        ) : null}
        {state?.ok ? (
          <div role="status" style={{ marginTop: 12 }}>
            <Notice tone="success" title={state.data.changed ? "Settings updated" : "No changes to save"} />
          </div>
        ) : null}

        {canManage ? (
          <FormActions>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Spinner aria-hidden="true" /> : null}
              <span>{pending ? "Saving…" : "Save settings"}</span>
            </Button>
          </FormActions>
        ) : (
          <p style={{ marginTop: 12, fontSize: 13 }}>
            Read-only: managing settings requires <code>platform.settings.manage</code>.
          </p>
        )}
      </form>
    </SectionCard>
  );
}
