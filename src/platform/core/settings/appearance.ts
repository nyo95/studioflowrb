/**
 * Theme contract (owner, 2026-10-06: dark mode is an approved UI mode).
 *
 * Ownership:
 * - **User preference** (`UserPreference.theme`) is the active choice: `light`, `dark` or `system`. Null means
 *   the person has not chosen, and the organisation default applies.
 * - **Platform General Settings** (`PlatformGeneralSettings.theme`) holds only that organisation default for
 *   people who have not chosen. It is never the active switch for anyone who has.
 * - The UI Engine tokens (`tokens.css`) are the only theme implementation: `<html data-theme="light|dark">`
 *   forces a theme, no attribute follows the operating system (`prefers-color-scheme`).
 *
 * The SQL CHECK constraints on both columns mirror `THEME_PREFERENCES`.
 */

/** Every theme a person or the organisation default may select. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The organisation default may be any theme preference; `system` follows each person's device. */
export const PLATFORM_APPEARANCE_THEMES = THEME_PREFERENCES;

export type PlatformTheme = ThemePreference;

export const PLATFORM_APPEARANCE_THEME_DEFAULT: PlatformTheme = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Reads a stored theme: canonical lowercase, plus the uppercase spelling the first preference service wrote
 * (`SYSTEM`/`LIGHT`/`DARK`). Anything else counts as "not chosen".
 */
export function parseStoredTheme(value: string | null | undefined): ThemePreference | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return isThemePreference(normalized) ? normalized : null;
}

/** The person's choice wins; otherwise the organisation default; otherwise follow the device. */
export function resolveThemePreference(user: ThemePreference | null | undefined, organisation: ThemePreference | null | undefined): ThemePreference {
  return user ?? organisation ?? PLATFORM_APPEARANCE_THEME_DEFAULT;
}

/** The `<html data-theme>` value for a resolved preference; `undefined` (no attribute) lets the OS decide. */
export function themeAttribute(theme: ThemePreference): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
