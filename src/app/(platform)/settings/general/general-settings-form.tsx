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
  Text,
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
      <form action={action} encType="multipart/form-data">
        <div className="grid gap-4 md:grid-cols-2">
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
            <Input id="settings-currency" name="currency" defaultValue={settings.currency} required minLength={3} maxLength={3} disabled={disabled} className="uppercase" />
          </Field>
          <Field id="settings-week-start" label="Week starts on">
            <Select id="settings-week-start" name="weekStartsOn" defaultValue={String(settings.weekStartsOn)} disabled={disabled}>
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
            </Select>
          </Field>
          <input type="hidden" name="brandMarkUrl" value={settings.brandMarkUrl ?? ""} />
          <Field id="settings-brand-mark" label="Brand mark" description="Optional PNG, maximum 2 MB. It is fitted into the header mark without changing its height.">
            <Input id="settings-brand-mark" name="brandMarkFile" type="file" accept="image/png,.png" disabled={disabled} />
          </Field>
        </div>

        {state && !state.ok ? (
          <div role="alert" className="mt-3">
            <InlineError>{state.error.safeMessage}</InlineError>
          </div>
        ) : null}
        {state?.ok ? (
          <div role="status" className="mt-3">
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
          <Text as="p" tone="secondary" size="sm" className="mt-3">
            Read-only: managing settings requires <code>platform.settings.manage</code>.
          </Text>
        )}
      </form>
    </SectionCard>
  );
}
