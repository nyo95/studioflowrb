import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { AppError } from "@platform/core/errors";
import { createAuditEventWriter } from "@platform/core/audit/persistence";

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
const ACTOR = { kind: "USER" as const, userId: "admin-1", label: "Admin One" };
const READ_GRANTS = ["platform.settings.read"];
const MANAGE_GRANTS = ["platform.settings.manage"];

before(async () => {
  requireDisposableTestDatabaseUrl();
  db = await createTestDb(await requireDisposableTestDatabaseUrl());
  service = createPlatformSettingsService({
    db: db.prisma,
    runTransaction: (work) => db.prisma.$transaction(work),
    auditWriter: createAuditEventWriter(),
    now: () => new Date(),
    generateId: () => crypto.randomUUID(),
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
    });
    assert.equal(parsed.organizationName, "StudioFlow");
    assert.equal(parsed.brandMarkUrl, null);
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
    const rows = await db.prisma.platformGeneralSettings.findMany();
    assert.equal(rows.length, 1);
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
      }),
    });
    assert.equal(changed.changed, true);
    assert.equal(changed.settings.organizationName, "Dapur Sinyo");
    const event = await db.prisma.auditEvent.findFirst({ where: { action: "settings.general.update" } });
    assert.notEqual(event, null);
    const keys = Object.keys((event?.changes ?? {}) as Record<string, unknown>);
    assert.deepEqual(keys.sort(), ["appTitle", "brandMarkUrl", "organizationName"]);
    const rows = await db.prisma.platformGeneralSettings.findMany();
    assert.equal(rows.length, 1, "singleton must never grow a second row");
  });
});
