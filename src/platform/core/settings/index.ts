import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, reportOperationalError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import type { ObjectStorage } from "@platform/core/storage";
import { validationError } from "@platform/core/validation";
import { normalizeText } from "@platform/utilities/normalization";

import {
  PLATFORM_APPEARANCE_THEME_DEFAULT,
  PLATFORM_APPEARANCE_THEMES,
  type PlatformTheme,
} from "./appearance";

export { PLATFORM_APPEARANCE_THEME_DEFAULT, PLATFORM_APPEARANCE_THEMES };
export type { PlatformTheme };

/**
 * Typed Platform General Settings singleton (CORE.md §11, Foundation F0 §7).
 *
 * Exactly one row exists with the stable singleton ID pinned by a SQL check
 * constraint. Reads require `platform.settings.read`; writes require
 * `platform.settings.manage`, are transactional, audited with safe field
 * deltas, and emit no audit event on a no-op. There is no arbitrary key/value
 * API, no file upload, and no per-user preference surface here.
 *
 * Platform Appearance (`theme`) is global and typed — it belongs to the same
 * singleton row, never to per-app or per-user storage.
 */

export const PLATFORM_GENERAL_SETTINGS_ID = "platform_general_settings";

export type PlatformGeneralSettings = {
  organizationName: string;
  appTitle: string;
  locale: string;
  timezone: string;
  currency: string;
  weekStartsOn: 0 | 1;
  brandMarkUrl: string | null;
  /** Typed global appearance theme (D-SF-02: Platform owns appearance/theme). */
  theme: PlatformTheme;
  /**
   * Owner-chosen launcher routing (roadmap: configurable main-route
   * settings). Advisory only — resolved defensively against the current
   * user's accessible apps at read time; see `resolveMainRoute` in
   * `src/app/(platform)/main-route.ts`. `null` means no preference recorded.
   */
  mainAppId: string | null;
  landingAppId: string | null;
};

export const DEFAULT_PLATFORM_GENERAL_SETTINGS: PlatformGeneralSettings = Object.freeze({
  organizationName: "StudioFlow",
  appTitle: "StudioFlow",
  locale: "id-ID",
  timezone: "Asia/Jakarta",
  currency: "IDR",
  weekStartsOn: 1,
  brandMarkUrl: null,
  theme: PLATFORM_APPEARANCE_THEME_DEFAULT,
  mainAppId: null,
  landingAppId: null,
});

export type DbClient = PrismaClient | Prisma.TransactionClient;

// ─── Validation ──────────────────────────────────────────────────────────────

const NAME_MAX = 120;

function isSupportedLocale(value: string): boolean {
  if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat(value);
    return true;
  } catch {
    return false;
  }
}

function isSupportedTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isSupportedCurrency(value: string): boolean {
  if (!/^[A-Z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Shape-only check for an app id referenced by a setting. Core validates the
 * pattern, never membership in the app registry — platform must not depend
 * on app code, and an id that later stops matching a registered app should
 * degrade gracefully (see `resolveMainRoute`), not throw here or at write
 * time.
 */
function isAppIdShape(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value) && value.length <= 64;
}

/** Safe brand mark target: absolute https URL or a site-relative root path. */
function isSafeBrandMarkUrl(value: string): boolean {
  if (value.startsWith("/")) {
    return !/\s/.test(value) && !value.startsWith("//") && value.length <= 500;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && value.length <= 500;
  } catch {
    return false;
  }
}

export const PlatformGeneralSettingsSchema = z.strictObject({
  organizationName: z.string().transform(normalizeText).pipe(z.string().min(1).max(NAME_MAX)),
  appTitle: z.string().transform(normalizeText).pipe(z.string().min(1).max(NAME_MAX)),
  locale: z.string().refine(isSupportedLocale, "Unsupported locale"),
  timezone: z.string().refine(isSupportedTimezone, "Unsupported IANA timezone"),
  currency: z.string().refine(isSupportedCurrency, "Unsupported ISO-4217 currency code"),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  brandMarkUrl: z.string().refine(isSafeBrandMarkUrl, "Unsafe brand mark URL").nullable(),
  theme: z.enum([...PLATFORM_APPEARANCE_THEMES]),
  mainAppId: z.string().refine(isAppIdShape, "Invalid app id").nullable(),
  landingAppId: z.string().refine(isAppIdShape, "Invalid app id").nullable(),
});

export function parsePlatformGeneralSettingsInput(input: unknown): PlatformGeneralSettings {
  const result = PlatformGeneralSettingsSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return {
    organizationName: result.data.organizationName,
    appTitle: result.data.appTitle,
    locale: result.data.locale,
    timezone: result.data.timezone,
    currency: result.data.currency,
    weekStartsOn: result.data.weekStartsOn as PlatformGeneralSettings["weekStartsOn"],
    brandMarkUrl: result.data.brandMarkUrl,
    theme: result.data.theme,
    mainAppId: result.data.mainAppId,
    landingAppId: result.data.landingAppId,
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

type SettingsRow = {
  organization_name: string;
  app_title: string;
  locale: string;
  timezone: string;
  currency: string;
  week_starts_on: number;
  brand_mark_url: string | null;
  brand_mark_storage_key: string | null;
  theme: string;
  main_app_id: string | null;
  landing_app_id: string | null;
};

type StoredPlatformGeneralSettings = PlatformGeneralSettings & { brandMarkStorageKey: string | null };

function rowToStoredSettings(row: SettingsRow): StoredPlatformGeneralSettings {
  return {
    organizationName: row.organization_name,
    appTitle: row.app_title,
    locale: row.locale,
    timezone: row.timezone,
    currency: row.currency,
    weekStartsOn: row.week_starts_on as PlatformGeneralSettings["weekStartsOn"],
    brandMarkUrl: row.brand_mark_url,
    brandMarkStorageKey: row.brand_mark_storage_key,
    theme: row.theme as PlatformTheme,
    mainAppId: row.main_app_id,
    landingAppId: row.landing_app_id,
  };
}

async function toPresentationSettings(settings: StoredPlatformGeneralSettings, resolveBrandMarkUrl?: (key: string) => string | Promise<string>): Promise<PlatformGeneralSettings> {
  if (!settings.brandMarkStorageKey) {
    const { brandMarkStorageKey: _unused, ...presentation } = settings;
    return presentation;
  }
  try {
    const brandMarkUrl = await resolveBrandMarkUrl?.(settings.brandMarkStorageKey);
    const { brandMarkStorageKey: _unused, ...presentation } = settings;
    return { ...presentation, brandMarkUrl: brandMarkUrl ?? null };
  } catch {
    // A missing provider or object must never make login/the app shell expose
    // an infrastructure error. The text fallback remains usable.
    const { brandMarkStorageKey: _unused, ...presentation } = settings;
    return { ...presentation, brandMarkUrl: null };
  }
}

/**
 * Reads the singleton without writing on the normal path, seeding locked
 * defaults only when absent. A concurrent first read may lose the create race;
 * it re-reads the row after that expected unique conflict.
 */
async function readStoredPlatformGeneralSettings(db: DbClient): Promise<StoredPlatformGeneralSettings> {
  const defaults = DEFAULT_PLATFORM_GENERAL_SETTINGS;
  const existing = await db.platformGeneralSettings.findUnique({
    where: { id: PLATFORM_GENERAL_SETTINGS_ID },
  });
  if (existing) return rowToStoredSettings(existing);

  try {
    const created = await db.platformGeneralSettings.create({
      data: {
        id: PLATFORM_GENERAL_SETTINGS_ID,
        organization_name: defaults.organizationName,
        app_title: defaults.appTitle,
        locale: defaults.locale,
        timezone: defaults.timezone,
        currency: defaults.currency,
        week_starts_on: defaults.weekStartsOn,
        brand_mark_url: defaults.brandMarkUrl,
        brand_mark_storage_key: null,
        theme: defaults.theme,
        main_app_id: defaults.mainAppId,
        landing_app_id: defaults.landingAppId,
      },
    });
    return rowToStoredSettings(created);
  } catch (error) {
    // Another request may seed the singleton between our read and create.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await db.platformGeneralSettings.findUnique({ where: { id: PLATFORM_GENERAL_SETTINGS_ID } });
    if (!raced) throw error;
    return rowToStoredSettings(raced);
  }
}

/** Resolves a managed Brand mark only for presentation; its durable key stays private. */
export async function readPlatformGeneralSettings(db: DbClient, resolveBrandMarkUrl?: (key: string) => string | Promise<string>): Promise<PlatformGeneralSettings> {
  return toPresentationSettings(await readStoredPlatformGeneralSettings(db), resolveBrandMarkUrl);
}

export type SettingsUpdateResult = { changed: boolean; settings: PlatformGeneralSettings };

export type PlatformSettingsPorts = {
  db: DbClient;
  runTransaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  now: () => Date;
  generateId: () => string;
  objectStorage?: ObjectStorage;
  resolveBrandMarkUrl?: (key: string) => string | Promise<string>;
};

export type BrandMarkChange =
  | { kind: "preserve" }
  | { kind: "managed"; storageKey: string }
  | { kind: "remove" }
  | { kind: "external"; url: string | null };

export function createPlatformSettingsService(ports: PlatformSettingsPorts) {
  const { db, runTransaction, auditWriter, now, generateId, objectStorage, resolveBrandMarkUrl } = ports;

  return {
    /** Reads settings. Requires `platform.settings.read`. */
    async read(input: { grants: PermissionGrants }): Promise<PlatformGeneralSettings> {
      requirePermission(input.grants, "platform.settings.read");
      // Simple independent read: no transaction (CORE.md §2).
      return readPlatformGeneralSettings(db, resolveBrandMarkUrl);
    },

    /**
     * Updates the singleton atomically with an audited safe delta. Requires
     * `platform.settings.manage`. A no-op emits no audit event.
     */
    async update(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      values: PlatformGeneralSettings;
      brandMarkChange?: BrandMarkChange;
    }): Promise<SettingsUpdateResult> {
      requirePermission(input.grants, "platform.settings.manage");
      const values = input.values;
      const brandMarkChange = input.brandMarkChange ?? { kind: "external" as const, url: values.brandMarkUrl };
      let cleanupKey: string | null = null;
      try {
        const result = await runTransaction(async (tx) => {
        const current = await readStoredPlatformGeneralSettings(tx);
        const nextBrandMarkUrl = brandMarkChange.kind === "external" ? brandMarkChange.url
          : brandMarkChange.kind === "remove" || brandMarkChange.kind === "managed" ? null : current.brandMarkUrl;
        const nextBrandMarkStorageKey = brandMarkChange.kind === "managed"
          ? brandMarkChange.storageKey
          : brandMarkChange.kind === "remove" || brandMarkChange.kind === "external" ? null : current.brandMarkStorageKey;
        const before = {
          organizationName: current.organizationName,
          appTitle: current.appTitle,
          locale: current.locale,
          timezone: current.timezone,
          currency: current.currency,
          weekStartsOn: current.weekStartsOn,
          brandMarkUrl: current.brandMarkUrl,
          brandMarkStorageKey: current.brandMarkStorageKey,
          theme: current.theme,
          mainAppId: current.mainAppId,
          landingAppId: current.landingAppId,
        };
        const after = { ...values, brandMarkUrl: nextBrandMarkUrl, brandMarkStorageKey: nextBrandMarkStorageKey };
        const changedKeys = Object.keys(after).filter((key) =>
          JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]));
        if (changedKeys.length === 0) {
          return { changed: false, settings: await toPresentationSettings(current, resolveBrandMarkUrl) };
        }
        await tx.platformGeneralSettings.update({
          where: { id: PLATFORM_GENERAL_SETTINGS_ID },
          data: {
            organization_name: after.organizationName,
            app_title: after.appTitle,
            locale: after.locale,
            timezone: after.timezone,
            currency: after.currency,
            week_starts_on: after.weekStartsOn,
            brand_mark_url: after.brandMarkUrl,
            brand_mark_storage_key: after.brandMarkStorageKey,
            theme: after.theme,
            main_app_id: after.mainAppId,
            landing_app_id: after.landingAppId,
          },
        });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of changedKeys) {
          changes[key] = {
            from: before[key as keyof typeof before] ?? null,
            to: after[key as keyof typeof after] ?? null,
          };
        }
        await auditWriter.write(
          prepareAuditEvent({
            appId: "platform",
            action: "settings.general.update",
            entityType: "platform_general_settings",
            entityId: PLATFORM_GENERAL_SETTINGS_ID,
            actor: input.actor,
            occurredAt: now(),
            changes,
          }, { now }),
          tx,
        );
        cleanupKey = current.brandMarkStorageKey && current.brandMarkStorageKey !== nextBrandMarkStorageKey
          ? current.brandMarkStorageKey : null;
        return { changed: true, settings: await toPresentationSettings(after, resolveBrandMarkUrl) };
      });
        if (cleanupKey) {
          await objectStorage?.remove(cleanupKey).catch((cleanupError) => {
            reportOperationalError({ context: "platform.settings.brand_mark.cleanup", error: cleanupError });
          });
        }
        return result;
      } catch (error) {
        if (brandMarkChange.kind === "managed") {
          await objectStorage?.remove(brandMarkChange.storageKey).catch((cleanupError) => {
            reportOperationalError({ context: "platform.settings.brand_mark.rollback_cleanup", error: cleanupError });
          });
        }
        throw error;
      }
    },
  };
}

export type PlatformSettingsService = ReturnType<typeof createPlatformSettingsService>;
