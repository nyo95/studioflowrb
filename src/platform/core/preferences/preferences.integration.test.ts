import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { APP_REGISTRATIONS } from "@/app/app-registrations";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";

import { createUserPreferencesService } from "./index";

let db: TestDb;
before(async () => { initializePermissionRegistry(APP_REGISTRATIONS); db = await createTestDb(requireDisposableTestDatabaseUrl()); });
beforeEach(async () => { await truncatePlatformTables(db); });
after(async () => { await closeTestDb(db); });

async function user(email: string) { return db.prisma.user.create({ data: { email, display_name: email, password_hash: "x" } }); }

describe("personal preferences", () => {
  it("upserts, clears, validates an accessible start page, and resolves platform fallback", async () => {
    const person = await user("preference@test.local");
    const preferences = createUserPreferencesService(db.prisma);
    const grants = ["masterdata.access"];
    const saved = await preferences.update({ userId: person.id, grants, theme: "dark", locale: "en-US", timezone: "UTC", startPage: "/masterdata" });
    assert.deepEqual(saved, { theme: "dark", locale: "en-US", timezone: "UTC", startPage: "/masterdata", language: null });
    await preferences.update({ userId: person.id, grants, theme: null, locale: null, timezone: null, startPage: null });
    assert.deepEqual(await preferences.get({ userId: person.id }), { theme: null, locale: null, timezone: null, startPage: null, language: null });
    await assert.rejects(() => preferences.update({ userId: person.id, grants, startPage: "/studioflow" }), (error: unknown) => error instanceof AppError && error.code === "PREFERENCE_START_PAGE");
    assert.deepEqual(await preferences.resolveDisplay({ userId: person.id }), { locale: "id-ID", timezone: "Asia/Jakarta", language: null });
  });

  it("persists each theme choice and resolves the active theme: own choice, else organisation default, else system", async () => {
    const person = await user("theme@test.local");
    const preferences = createUserPreferencesService(db.prisma);
    assert.equal(await preferences.resolveTheme({ userId: person.id }), "system", "nothing chosen anywhere follows the device");
    assert.equal(await preferences.resolveTheme({ userId: null }), "system", "signed out gets the organisation default");
    for (const theme of ["light", "dark", "system"] as const) {
      await preferences.update({ userId: person.id, grants: [], theme });
      assert.equal((await preferences.get({ userId: person.id })).theme, theme);
      assert.equal(await preferences.resolveTheme({ userId: person.id }), theme);
    }
    await db.prisma.platformGeneralSettings.update({ where: { id: "platform_general_settings" }, data: { theme: "dark" } });
    await preferences.update({ userId: person.id, grants: [], theme: null });
    assert.equal(await preferences.resolveTheme({ userId: person.id }), "dark", "not chosen follows the organisation default");
    assert.equal(await preferences.resolveTheme({ userId: null }), "dark");
    await preferences.update({ userId: person.id, grants: [], theme: "light" });
    assert.equal(await preferences.resolveTheme({ userId: person.id }), "light", "the person's own choice wins");
  });

  it("rejects unknown themes in the service and in the database, and reads the legacy uppercase spelling", async () => {
    const person = await user("theme-guard@test.local");
    const preferences = createUserPreferencesService(db.prisma);
    await preferences.resolveTheme({ userId: null }); // creates the settings singleton
    await assert.rejects(() => preferences.update({ userId: person.id, grants: [], theme: "sepia" as "light" }), (error: unknown) => error instanceof AppError && error.code === "PREFERENCE_THEME");
    await assert.rejects(() => db.prisma.userPreference.create({ data: { user_id: person.id, theme: "sepia" } }));
    await assert.rejects(() => db.prisma.platformGeneralSettings.update({ where: { id: "platform_general_settings" }, data: { theme: "sepia" } }));
    await db.prisma.$executeRawUnsafe(`ALTER TABLE "platform"."user_preference" DROP CONSTRAINT "user_preference_theme_check"`);
    try {
      await db.prisma.userPreference.create({ data: { user_id: person.id, theme: "DARK" } });
      assert.equal((await preferences.get({ userId: person.id })).theme, "dark");
    } finally {
      await db.prisma.userPreference.deleteMany({ where: { user_id: person.id } });
      await db.prisma.$executeRawUnsafe(`ALTER TABLE "platform"."user_preference" ADD CONSTRAINT "user_preference_theme_check" CHECK ("theme" IS NULL OR "theme" IN ('system', 'light', 'dark'))`);
    }
  });

  it("cascades the private row when its user is deleted", async () => {
    const person = await user("cascade@test.local");
    const preferences = createUserPreferencesService(db.prisma);
    await preferences.update({ userId: person.id, grants: [], theme: "light" });
    await db.prisma.user.delete({ where: { id: person.id } });
    assert.equal(await db.prisma.userPreference.count({ where: { user_id: person.id } }), 0);
  });

  it("stores the guide language separately from display locale and rejects unsupported languages", async () => {
    const person = await user("guide-language@test.local");
    const preferences = createUserPreferencesService(db.prisma);
    assert.equal((await preferences.update({ userId: person.id, grants: [], language: "id" })).language, "id");
    assert.equal((await preferences.update({ userId: person.id, grants: [], language: "en" })).language, "en");
    assert.equal((await preferences.update({ userId: person.id, grants: [], language: null })).language, null);
    await assert.rejects(() => preferences.update({ userId: person.id, grants: [], language: "fr" as "id" }), (error: unknown) => error instanceof AppError && error.code === "PREFERENCE_LANGUAGE");
    await assert.rejects(() => db.prisma.userPreference.upsert({ where: { user_id: person.id }, create: { user_id: person.id, language: "fr" }, update: { language: "fr" } }));
  });
});
