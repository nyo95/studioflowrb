import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { AppError } from "@platform/core/errors";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { FakeObjectStorage } from "@platform/core/storage";

import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncatePlatformTables,
  type TestDb,
} from "../db/test-support";
import {
  createPlatformSettingsService,
  parsePlatformGeneralSettingsInput,
  readPlatformGeneralSettings,
  type PlatformSettingsService,
} from "./index";

let db: TestDb;
let service: PlatformSettingsService;
let storage: FakeObjectStorage;
const ACTOR = { kind: "USER" as const, userId: "admin-1", label: "Admin One" };
const READ_GRANTS = ["platform.settings.read"];
const MANAGE_GRANTS = ["platform.settings.manage"];

before(async () => {
  requireDisposableTestDatabaseUrl();
  db = await createTestDb(await requireDisposableTestDatabaseUrl());
  storage = new FakeObjectStorage();
  service = createPlatformSettingsService({
    db: db.prisma,
    runTransaction: (work) => db.prisma.$transaction(work),
    auditWriter: createAuditEventWriter(),
    now: () => new Date(),
    generateId: () => crypto.randomUUID(),
    objectStorage: storage,
    resolveBrandMarkUrl: (key) => `https://public.invalid/${encodeURIComponent(key)}`,
  });
});

beforeEach(async () => {
  await truncatePlatformTables(db);
});

after(async () => {
  await closeTestDb(db);
});

describe("general settings validation", () => {
  it("accepts the locked defaults shape", () => {
    const parsed = parsePlatformGeneralSettingsInput({
      organizationName: "StudioFlow",
      appTitle: "StudioFlow",
      locale: "id-ID",
      timezone: "Asia/Jakarta",
      currency: "IDR",
      weekStartsOn: 1,
      brandMarkUrl: null,
      mainAppId: null,
      landingAppId: null,
    });
    assert.equal(parsed.organizationName, "StudioFlow");
    assert.equal(parsed.brandMarkUrl, null);
    assert.equal(parsed.mainAppId, null);
    assert.equal(parsed.landingAppId, null);
  });

  it("accepts a shape-valid app id for the main/landing route settings", () => {
    const parsed = parsePlatformGeneralSettingsInput({
      organizationName: "StudioFlow",
      appTitle: "StudioFlow",
      locale: "id-ID",
      timezone: "Asia/Jakarta",
      currency: "IDR",
      weekStartsOn: 1,
      brandMarkUrl: null,
      mainAppId: "bq",
      landingAppId: "studioflow",
    });
    assert.equal(parsed.mainAppId, "bq");
    assert.equal(parsed.landingAppId, "studioflow");
  });

  it("rejects invalid locale, timezone, currency, week range, and unsafe URLs", () => {
    const base = {
      organizationName: "A",
      appTitle: "A",
      locale: "id-ID",
      timezone: "Asia/Jakarta",
      currency: "IDR",
      weekStartsOn: 1,
      brandMarkUrl: null,
      mainAppId: null,
      landingAppId: null,
    };
    const bad = [
      { ...base, locale: "nope-nope-nope" },
      { ...base, timezone: "Mars/Olympus" },
      { ...base, currency: "usd" },
      { ...base, currency: "USDD" },
      { ...base, weekStartsOn: 7 },
      { ...base, weekStartsOn: -1 },
      { ...base, brandMarkUrl: "javascript:alert(1)" },
      { ...base, brandMarkUrl: "ftp://host/file" },
      { ...base, brandMarkUrl: "//cdn.example.com/mark.png" },
      { ...base, organizationName: "" },
      { ...base, organizationName: "x".repeat(121) },
      { ...base, mainAppId: "Not-Lowercase" },
      { ...base, mainAppId: "" },
      { ...base, landingAppId: "has spaces" },
    ];
    for (const candidate of bad) {
      assert.throws(() => parsePlatformGeneralSettingsInput(candidate));
    }
  });

  it("rejects unknown keys (strict mutation boundary)", () => {
    assert.throws(() =>
      parsePlatformGeneralSettingsInput({
        organizationName: "A",
        appTitle: "A",
        locale: "id-ID",
        timezone: "Asia/Jakarta",
        currency: "IDR",
        weekStartsOn: 1,
        brandMarkUrl: null,
        mainAppId: null,
        landingAppId: null,
        arbitrarySetting: "nope",
      }),
    );
  });
});

describe("general settings service", () => {
  it("lazily seeds the locked defaults exactly once", async () => {
    const settings = await service.read({ grants: READ_GRANTS });
    assert.equal(settings.organizationName, "StudioFlow");
    assert.equal(settings.appTitle, "StudioFlow");
    assert.equal(settings.locale, "id-ID");
    assert.equal(settings.timezone, "Asia/Jakarta");
    assert.equal(settings.currency, "IDR");
    assert.equal(settings.weekStartsOn, 1);
    assert.equal(settings.brandMarkUrl, null);
    assert.equal(settings.mainAppId, null);
    assert.equal(settings.landingAppId, null);
    const rows = await db.prisma.platformGeneralSettings.findMany();
    assert.equal(rows.length, 1);
  });

  it("reads an existing singleton without a write and handles concurrent first reads", async () => {
    const first = await readPlatformGeneralSettings(db.prisma);
    const second = await readPlatformGeneralSettings(db.prisma);
    assert.deepEqual(second, first);

    await truncatePlatformTables(db);
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => readPlatformGeneralSettings(db.prisma)));
    assert.ok(concurrent.every((settings) => settings.appTitle === "StudioFlow"));
    assert.equal(await db.prisma.platformGeneralSettings.count(), 1);
  });

  it("requires platform.settings.read and platform.settings.manage", async () => {
    await assert.rejects(
      () => service.read({ grants: [] }),
      (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN",
    );
    await assert.rejects(
      () =>
        service.update({
          grants: READ_GRANTS,
          actor: ACTOR,
          values: parsePlatformGeneralSettingsInput({
            organizationName: "Changed",
            appTitle: "Changed",
            locale: "id-ID",
            timezone: "Asia/Jakarta",
            currency: "IDR",
            weekStartsOn: 1,
            brandMarkUrl: null,
            mainAppId: null,
            landingAppId: null,
          }),
        }),
      (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN",
    );
  });

  it("updates atomically with an audited safe delta and no-ops emit nothing", async () => {
    await readPlatformGeneralSettings(db.prisma);
    const before = await db.prisma.auditEvent.count();
    const noOp = await service.update({
      grants: MANAGE_GRANTS,
      actor: ACTOR,
      values: parsePlatformGeneralSettingsInput({
        organizationName: "StudioFlow",
        appTitle: "StudioFlow",
        locale: "id-ID",
        timezone: "Asia/Jakarta",
        currency: "IDR",
        weekStartsOn: 1,
        brandMarkUrl: null,
        mainAppId: null,
        landingAppId: null,
      }),
    });
    assert.equal(noOp.changed, false);
    assert.equal(await db.prisma.auditEvent.count(), before);

    const changed = await service.update({
      grants: MANAGE_GRANTS,
      actor: ACTOR,
      values: parsePlatformGeneralSettingsInput({
        organizationName: "Dapur Sinyo",
        appTitle: "Dapur Sinyo",
        locale: "id-ID",
        timezone: "Asia/Jakarta",
        currency: "IDR",
        weekStartsOn: 1,
        brandMarkUrl: "https://cdn.example.com/mark.png",
        mainAppId: "bq",
        landingAppId: null,
      }),
    });
    assert.equal(changed.changed, true);
    assert.equal(changed.settings.organizationName, "Dapur Sinyo");
    const event = await db.prisma.auditEvent.findFirst({ where: { action: "settings.general.update" } });
    assert.notEqual(event, null);
    const keys = Object.keys((event?.changes ?? {}) as Record<string, unknown>);
    assert.deepEqual(keys.sort(), ["appTitle", "brandMarkUrl", "mainAppId", "organizationName"]);
    const rows = await db.prisma.platformGeneralSettings.findMany();
    assert.equal(rows.length, 1, "singleton must never grow a second row");
  });

  it("stores a managed key, resolves a temporary presentation URL, and cleans up the replaced object", async () => {
    const firstKey = "brand-marks/first.png";
    const secondKey = "brand-marks/second.png";
    const body = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await storage.put({ key: firstKey, body, bytes: body.length, contentType: "image/png" });
    await storage.put({ key: secondKey, body, bytes: body.length, contentType: "image/png" });
    const values = parsePlatformGeneralSettingsInput({ organizationName: "StudioFlow", appTitle: "StudioFlow", locale: "id-ID", timezone: "Asia/Jakarta", currency: "IDR", weekStartsOn: 1, brandMarkUrl: null, mainAppId: null, landingAppId: null });

    await service.update({ grants: MANAGE_GRANTS, actor: ACTOR, values, brandMarkChange: { kind: "managed", storageKey: firstKey } });
    const first = await service.read({ grants: READ_GRANTS });
    assert.equal(first.brandMarkUrl, "https://public.invalid/brand-marks%2Ffirst.png");
    assert.equal((await db.prisma.platformGeneralSettings.findUniqueOrThrow({ where: { id: "platform_general_settings" } })).brand_mark_storage_key, firstKey);
    assert.equal((await db.prisma.platformGeneralSettings.findUniqueOrThrow({ where: { id: "platform_general_settings" } })).brand_mark_url, null);

    await service.update({ grants: MANAGE_GRANTS, actor: ACTOR, values, brandMarkChange: { kind: "managed", storageKey: secondKey } });
    assert.equal(storage.objects.has(firstKey), false);
    assert.equal(storage.objects.has(secondKey), true);
  });

  it("clears the durable reference before best-effort removal", async () => {
    const key = "brand-marks/remove.png";
    const body = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await storage.put({ key, body, bytes: body.length, contentType: "image/png" });
    const values = parsePlatformGeneralSettingsInput({ organizationName: "StudioFlow", appTitle: "StudioFlow", locale: "id-ID", timezone: "Asia/Jakarta", currency: "IDR", weekStartsOn: 1, brandMarkUrl: null, mainAppId: null, landingAppId: null });
    await service.update({ grants: MANAGE_GRANTS, actor: ACTOR, values, brandMarkChange: { kind: "managed", storageKey: key } });
    await service.update({ grants: MANAGE_GRANTS, actor: ACTOR, values, brandMarkChange: { kind: "remove" } });
    const row = await db.prisma.platformGeneralSettings.findUniqueOrThrow({ where: { id: "platform_general_settings" } });
    assert.equal(row.brand_mark_storage_key, null);
    assert.equal(storage.objects.has(key), false);
  });

  it("cleans up a newly uploaded object when persistence fails", async () => {
    const key = "brand-marks/rollback.png";
    const body = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await storage.put({ key, body, bytes: body.length, contentType: "image/png" });
    const failing = createPlatformSettingsService({
      db: db.prisma,
      runTransaction: (work) => db.prisma.$transaction(work),
      auditWriter: { write: async () => { throw new Error("persistence failure"); } },
      now: () => new Date(), generateId: () => crypto.randomUUID(), objectStorage: storage,
      resolveBrandMarkUrl: (key) => `https://public.invalid/${encodeURIComponent(key)}`,
    });
    const values = parsePlatformGeneralSettingsInput({ organizationName: "StudioFlow", appTitle: "StudioFlow", locale: "id-ID", timezone: "Asia/Jakarta", currency: "IDR", weekStartsOn: 1, brandMarkUrl: null, mainAppId: null, landingAppId: null });
    await assert.rejects(() => failing.update({ grants: MANAGE_GRANTS, actor: ACTOR, values, brandMarkChange: { kind: "managed", storageKey: key } }));
    assert.equal(storage.objects.has(key), false);
    assert.equal(await db.prisma.platformGeneralSettings.count(), 0);
  });
});
