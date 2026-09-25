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
import { PLATFORM_APPEARANCE_THEMES, type PlatformTheme } from "@platform/core/settings/appearance";
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

const THEME_LABELS: Record<PlatformTheme, string> = {
  light: "Light",
};

export function GeneralSettingsForm({
  settings,
  canManage,
  apps,
}: {
  settings: PlatformGeneralSettings;
  canManage: boolean;
  /** Registered apps eligible to be chosen as the main or landing app. */
  apps: readonly { appId: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(updateGeneralSettingsAction, INITIAL);
  const disabled = !canManage || pending;

  return (
    <form action={action}>
      <input type="hidden" name="theme" value={settings.theme} />
      <div className="grid gap-5">
        <SectionCard title="General" description="Shared display defaults for every application.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="settings-organization" label="Organization name">
              <Input id="settings-organization" name="organizationName" defaultValue={settings.organizationName} required maxLength={120} disabled={disabled} />
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
            <Field id="settings-main-app" label="Main application" description="Where an eligible user lands instead of the launcher. Leave as Master Data to keep the previous behavior.">
              <Select id="settings-main-app" name="mainAppId" defaultValue={settings.mainAppId ?? ""} disabled={disabled}>
                <option value="">Master Data (previous default)</option>
                {settings.mainAppId && !apps.some((app) => app.appId === settings.mainAppId) ? <option value={settings.mainAppId}>Unavailable application ({settings.mainAppId})</option> : null}
                {apps.map((app) => (
                  <option key={app.appId} value={app.appId}>
                    {app.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="settings-landing-app" label="Landing page for other users" description="Where a user without access to the main application lands, if they can reach it. Leave as first accessible app to keep the previous behavior.">
              <Select id="settings-landing-app" name="landingAppId" defaultValue={settings.landingAppId ?? ""} disabled={disabled}>
                <option value="">First accessible app (previous default)</option>
                {settings.landingAppId && !apps.some((app) => app.appId === settings.landingAppId) ? <option value={settings.landingAppId}>Unavailable application ({settings.landingAppId})</option> : null}
                {apps.map((app) => (
                  <option key={app.appId} value={app.appId}>
                    {app.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Appearance" description="Global visual identity applied across every application.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="settings-app-title" label="Application title">
              <Input id="settings-app-title" name="appTitle" defaultValue={settings.appTitle} required maxLength={120} disabled={disabled} />
            </Field>
            <Field id="settings-brand-mark" label="Brand mark" description="Optional PNG, maximum 2 MB. It is fitted into the header mark without changing its height.">
              <div>
                <label
                  htmlFor="settings-brand-mark"
                  className={disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}
                >
                  <div className="flex flex-col items-center gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted px-4 py-5 text-center transition-colors hover:bg-surface">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span className="text-sm text-ink-2">Drop PNG here or <span className="font-medium text-ink">browse</span></span>
                    <span className="text-xs text-ink-3">Maximum 2 MB</span>
                  </div>
                  <input id="settings-brand-mark" name="brandMarkFile" type="file" accept="image/png,.png" disabled={disabled} className="sr-only" />
                </label>
                {settings.brandMarkUrl ? <label className="mt-2 flex items-center gap-2 text-sm"><input name="removeBrandMark" type="checkbox" disabled={disabled} /> Remove the current Brand mark</label> : null}
              </div>
            </Field>
            <Field id="settings-theme" label="Theme" description="The canonical light theme is the only approved global appearance variant; changing it is a future approved-variant decision.">
              <Select id="settings-theme" value={settings.theme} disabled>
                {PLATFORM_APPEARANCE_THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {THEME_LABELS[theme]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </SectionCard>
      </div>

      {state?.ok === false ? (
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
  );
}