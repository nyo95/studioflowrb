import { z } from "zod";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { validationError } from "@platform/core/validation";
import { normalizeText } from "@platform/utilities/normalization";

/**
 * Typed Platform General Settings singleton (CORE.md §11, Foundation F0 §7).
 *
 * Exactly one row exists with the stable singleton ID pinned by a SQL check
 * constraint. Reads require `platform.settings.read`; writes require
 * `platform.settings.manage`, are transactional, audited with safe field
 * deltas, and emit no audit event on a no-op. There is no arbitrary key/value
 * API, no file upload, and no per-user preference surface here.
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
};

export const DEFAULT_PLATFORM_GENERAL_SETTINGS: PlatformGeneralSettings = Object.freeze({
  organizationName: "StudioFlow",
  appTitle: "StudioFlow",
  locale: "id-ID",
  timezone: "Asia/Jakarta",
  currency: "IDR",
  weekStartsOn: 1,
  brandMarkUrl: null,
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
};

function rowToSettings(row: SettingsRow): PlatformGeneralSettings {
  return {
    organizationName: row.organization_name,
    appTitle: row.app_title,
    locale: row.locale,
    timezone: row.timezone,
    currency: row.currency,
    weekStartsOn: row.week_starts_on as PlatformGeneralSettings["weekStartsOn"],
    brandMarkUrl: row.brand_mark_url,
  };
}

/**
 * Reads the singleton without writing on the normal path, seeding locked
 * defaults only when absent. A concurrent first read may lose the create race;
 * it re-reads the row after that expected unique conflict.
 */
export async function readPlatformGeneralSettings(db: DbClient): Promise<PlatformGeneralSettings> {
  const defaults = DEFAULT_PLATFORM_GENERAL_SETTINGS;
  const existing = await db.platformGeneralSettings.findUnique({
    where: { id: PLATFORM_GENERAL_SETTINGS_ID },
  });
  if (existing) return rowToSettings(existing);

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
      },
    });
    return rowToSettings(created);
  } catch (error) {
    // Another request may seed the singleton between our read and create.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await db.platformGeneralSettings.findUnique({ where: { id: PLATFORM_GENERAL_SETTINGS_ID } });
    if (!raced) throw error;
    return rowToSettings(raced);
  }
}

export type SettingsUpdateResult = { changed: boolean; settings: PlatformGeneralSettings };

export type PlatformSettingsPorts = {
  db: DbClient;
  runTransaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  now: () => Date;
  generateId: () => string;
};

export function createPlatformSettingsService(ports: PlatformSettingsPorts) {
  const { db, runTransaction, auditWriter, now, generateId } = ports;

  return {
    /** Reads settings. Requires `platform.settings.read`. */
    async read(input: { grants: PermissionGrants }): Promise<PlatformGeneralSettings> {
      requirePermission(input.grants, "platform.settings.read");
      // Simple independent read: no transaction (CORE.md §2).
      return readPlatformGeneralSettings(db);
    },

    /**
     * Updates the singleton atomically with an audited safe delta. Requires
     * `platform.settings.manage`. A no-op emits no audit event.
     */
    async update(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      values: PlatformGeneralSettings;
    }): Promise<SettingsUpdateResult> {
      requirePermission(input.grants, "platform.settings.manage");
      const values = input.values;
      return runTransaction(async (tx) => {
        const current = await readPlatformGeneralSettings(tx);
        const before = {
          organizationName: current.organizationName,
          appTitle: current.appTitle,
          locale: current.locale,
          timezone: current.timezone,
          currency: current.currency,
          weekStartsOn: current.weekStartsOn,
          brandMarkUrl: current.brandMarkUrl,
        };
        const after = values;
        const changedKeys = Object.keys(after).filter((key) =>
          JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]));
        if (changedKeys.length === 0) {
          return { changed: false, settings: current };
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
        return { changed: true, settings: after };
      });
    },
  };
}

export type PlatformSettingsService = ReturnType<typeof createPlatformSettingsService>;
