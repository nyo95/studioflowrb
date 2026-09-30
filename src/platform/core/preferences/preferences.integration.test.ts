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
    const saved = await preferences.update({ userId: person.id, grants, theme: "DARK", locale: "en-US", timezone: "UTC", startPage: "/masterdata" });
    assert.deepEqual(saved, { theme: "DARK", locale: "en-US", timezone: "UTC", startPage: "/masterdata" });
    await preferences.update({ userId: person.id, grants, theme: null, locale: null, timezone: null, startPage: null });
    assert.deepEqual(await preferences.get({ userId: person.id }), { theme: "SYSTEM", locale: null, timezone: null, startPage: null });
    await assert.rejects(() => preferences.update({ userId: person.id, grants, startPage: "/studioflow" }), (error: unknown) => error instanceof AppError && error.code === "PREFERENCE_START_PAGE");
    assert.deepEqual(await preferences.resolveDisplay({ userId: person.id }), { locale: "id-ID", timezone: "Asia/Jakarta" });
  });

  it("cascades the private row when its user is deleted", async () => {
    const person = await user("cascade@test.local");
    const preferences = createUserPreferencesService(db.prisma);
    await preferences.update({ userId: person.id, grants: [], theme: "LIGHT" });
    await db.prisma.user.delete({ where: { id: person.id } });
    assert.equal(await db.prisma.userPreference.count({ where: { user_id: person.id } }), 0);
  });
});
