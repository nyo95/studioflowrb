import "server-only";

import { getPrincipalGrants } from "@platform/core/auth";
import { themeAttribute, type ThemePreference } from "@platform/core/settings";
import { userPreferences } from "@platform/runtime";

/**
 * The `<html data-theme>` for this request: the signed-in person's own choice, else the organisation default,
 * else nothing (follow the device). Read once per request (the principal read is memoised and shared with the
 * platform layout). A failure never blocks the page: it falls back to following the device.
 */
export async function activeThemeAttribute(): Promise<"light" | "dark" | undefined> {
  let theme: ThemePreference = "system";
  try {
    const principal = await getPrincipalGrants();
    theme = await userPreferences.resolveTheme({ userId: principal?.principal.userId ?? null });
  } catch {
    // Theme is presentation only; a database hiccup must not take the page down.
  }
  return themeAttribute(theme);
}
