/**
 * Typed global Platform Appearance (CORE.md §11, F-C / PF-4, D-SF-02).
 *
 * Platform Appearance is the global, platform-owned visual identity of the
 * workspace. It is typed, never per-app and never per-user, and it carries
 * no route or local-storage preferences. The `theme` union is the durable
 * contract; the SQL CHECK constraint on the General Settings singleton
 * mirrors it at the storage layer.
 *
 * DESIGN.md locks exactly one canonical theme — `"light"`. A future approved
 * variant extends the union, the check constraint, and the Zod schema in a
 * single changelog-scoped change.
 */

/** Canonical global appearance themes approved by DESIGN.md. */
export const PLATFORM_APPEARANCE_THEMES = ["light"] as const;

export type PlatformTheme = (typeof PLATFORM_APPEARANCE_THEMES)[number];

export const PLATFORM_APPEARANCE_THEME_DEFAULT: PlatformTheme = PLATFORM_APPEARANCE_THEMES[0];
