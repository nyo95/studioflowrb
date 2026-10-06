"use client";

import { useState, useTransition } from "react";

import { InlineError, RadioGroup, SectionCard, Text } from "@/platform/ui_engine";
import { themeAttribute, type ThemePreference } from "@platform/core/settings/appearance";

import { updateMyPreferencesAction } from "./actions";

const LABELS: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string }> = [
  { value: "system", label: "System", description: "Follow this device's light or dark setting." },
  { value: "light", label: "Light", description: "Always light." },
  { value: "dark", label: "Dark", description: "Always dark." },
];

/** Applies a theme to the open page at once; the server stamps the same value on the next render. */
function applyToDocument(theme: ThemePreference) {
  const attribute = themeAttribute(theme);
  if (attribute) document.documentElement.dataset.theme = attribute;
  else delete document.documentElement.dataset.theme;
}

/**
 * The person's own theme. Saved as soon as it is picked (no Save button) and applied to the page immediately.
 * `theme` null = not chosen yet: the organisation default from General Settings applies.
 */
export function AppearancePreference({ theme, organisationDefault }: { theme: ThemePreference | null; organisationDefault: ThemePreference }) {
  const [chosen, setChosen] = useState<ThemePreference | null>(theme);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (value: string) => {
    const next = value as ThemePreference;
    const previous = chosen;
    setChosen(next);
    setError(null);
    applyToDocument(next);
    startTransition(async () => {
      const result = await updateMyPreferencesAction({ theme: next });
      if (!result.ok) {
        setChosen(previous);
        applyToDocument(previous ?? organisationDefault);
        setError(result.error.safeMessage);
      }
    });
  };

  return (
    <SectionCard title="Appearance" description="Light or dark. Only you see this." padded>
      <div className="grid gap-3">
        <RadioGroup label="Theme" orientation="horizontal" value={chosen ?? ""} onValueChange={choose} disabled={pending} options={OPTIONS} />
        {chosen === null ? (
          <Text size="sm" tone="tertiary">Not chosen yet: following the organisation default ({LABELS[organisationDefault]}).</Text>
        ) : null}
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    </SectionCard>
  );
}
