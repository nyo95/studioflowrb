import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { getPermissionRegistry } from "@platform/core/rbac/registry";
import { isSupportedLocale, isSupportedTimezone, isThemePreference, parseStoredTheme, readPlatformGeneralSettings, resolveThemePreference, THEME_PREFERENCES, type ThemePreference } from "@platform/core/settings";

/** A person's own theme choice (`system` | `light` | `dark`); the contract lives in `@platform/core/settings` appearance. */
export const USER_PREFERENCE_THEMES = THEME_PREFERENCES;
export type UserPreferenceTheme = ThemePreference;
/** Null means "not chosen": the organisation default from General Settings applies. */
export type UserPreferences = { theme: UserPreferenceTheme | null; locale: string | null; timezone: string | null; startPage: string | null };
type Db = PrismaClient | Prisma.TransactionClient;

function plainInvalid(code: string, message: string): never { throw new AppError("VALIDATION", code, message); }
function toView(row: { theme: string | null; locale: string | null; timezone: string | null; start_page: string | null } | null): UserPreferences {
  return { theme: parseStoredTheme(row?.theme), locale: row?.locale ?? null, timezone: row?.timezone ?? null, startPage: row?.start_page ?? null };
}

function validateStartPage(value: string, grants: PermissionGrants): string {
  if (value === "/") return value;
  const allowed = getPermissionRegistry().apps.some((app) => app.rootPath === value && grants.includes(app.accessPermission));
  if (!allowed) plainInvalid("PREFERENCE_START_PAGE", "Choose a start page you can access.");
  return value;
}

export function createUserPreferencesService(db: PrismaClient) {
  return {
    async get(input: { userId: string }): Promise<UserPreferences> {
      return toView(await db.userPreference.findUnique({ where: { user_id: input.userId } }));
    },
    async update(input: { userId: string; grants: PermissionGrants; theme?: UserPreferenceTheme | null; locale?: string | null; timezone?: string | null; startPage?: string | null }): Promise<UserPreferences> {
      const data: Prisma.UserPreferenceUpdateInput = {};
      if (input.theme !== undefined) {
        if (input.theme !== null && !isThemePreference(input.theme)) plainInvalid("PREFERENCE_THEME", "Choose System, Light or Dark.");
        data.theme = input.theme;
      }
      if (input.locale !== undefined) {
        if (input.locale !== null && !isSupportedLocale(input.locale)) plainInvalid("PREFERENCE_LOCALE", "Choose a supported locale.");
        data.locale = input.locale;
      }
      if (input.timezone !== undefined) {
        if (input.timezone !== null && !isSupportedTimezone(input.timezone)) plainInvalid("PREFERENCE_TIMEZONE", "Choose a supported timezone.");
        data.timezone = input.timezone;
      }
      if (input.startPage !== undefined) data.start_page = input.startPage === null ? null : validateStartPage(input.startPage, input.grants);
      const row = await db.userPreference.upsert({ where: { user_id: input.userId }, create: { user_id: input.userId, theme: input.theme ?? null, locale: input.locale ?? null, timezone: input.timezone ?? null, start_page: input.startPage === undefined || input.startPage === null ? null : validateStartPage(input.startPage, input.grants) }, update: data });
      return toView(row);
    },
    /**
     * The theme to apply for a person: their own choice, else the organisation default, else `system`.
     * `userId` null (signed out, e.g. the login page) gets the organisation default.
     */
    async resolveTheme(input: { userId: string | null }): Promise<ThemePreference> {
      const [preference, settings] = await Promise.all([
        input.userId ? db.userPreference.findUnique({ where: { user_id: input.userId }, select: { theme: true } }) : Promise.resolve(null),
        readPlatformGeneralSettings(db),
      ]);
      return resolveThemePreference(parseStoredTheme(preference?.theme), parseStoredTheme(settings.theme));
    },
    async resolveDisplay(input: { userId: string }): Promise<{ locale: string; timezone: string }> {
      const [preference, settings] = await Promise.all([db.userPreference.findUnique({ where: { user_id: input.userId } }), readPlatformGeneralSettings(db)]);
      return { locale: preference?.locale ?? settings.locale, timezone: preference?.timezone ?? settings.timezone };
    },
  };
}

export function createStorageUsageService(readUsage: () => Promise<unknown>) {
  return {
    async getStorageUsage(input: { grants: PermissionGrants }) {
      if (!input.grants.includes("platform.settings.read")) throw new AppError("FORBIDDEN", "PERMISSION_DENIED", "You do not have access to storage usage.");
      return readUsage();
    },
  };
}
