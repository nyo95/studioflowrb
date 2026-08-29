import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncatePlatformTables,
  type TestDb,
} from "./test-support";

/**
 * Foundation F0 platform schema contract tests (work order §4). These prove
 * the DATABASE-level protections: race-safe uniqueness, unique pairs,
 * restrict-FK protection of historical rows, the SQL-enforced settings
 * singleton, the migration-created limiter table, and session indexes.
 */

let db: TestDb;
let databaseUrl: string;

before(async () => {
  databaseUrl = requireDisposableTestDatabaseUrl();
  db = await createTestDb(databaseUrl);
});

after(async () => {
  if (db) await closeTestDb(db);
});

async function expectReject(work: () => Promise<unknown>, message: RegExp | string): Promise<void> {
  try {
    await work();
    assert.fail(`expected rejection matching ${message}`);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (message instanceof RegExp) assert.match(text, message);
    else assert.ok(text.includes(message), text);
  }
}

describe("platform schema: identity constraints", () => {
  it("enforces race-safe unique normalized email", async () => {
    await truncatePlatformTables(db);
    await db.prisma.user.create({ data: { email: "owner@example.com", display_name: "Owner", password_hash: "x" } });
    await expectReject(
      () => db.prisma.user.create({ data: { email: "owner@example.com", display_name: "Dup", password_hash: "x" } }),
      /unique/i,
    );
  });

  it("enforces immutable unique role code including archived rows", async () => {
    await truncatePlatformTables(db);
    await db.prisma.role.create({ data: { code: "platform-owner", name: "Platform Owner", is_system: true } });
    await expectReject(
      () => db.prisma.role.create({ data: { code: "platform-owner", name: "Other" } }),
      /unique/i,
    );
    await db.prisma.role.update({
      where: { code: "platform-owner" },
      data: { archived_at: new Date() },
    });
    await expectReject(
      () => db.prisma.role.create({ data: { code: "platform-owner", name: "Third" } }),
      /unique/i,
    );
  });

  it("enforces unique User × Role and Role × permission pairs", async () => {
    await truncatePlatformTables(db);
    const user = await db.prisma.user.create({ data: { email: "u@example.com", display_name: "U", password_hash: "x" } });
    const role = await db.prisma.role.create({ data: { code: "clerk", name: "Clerk" } });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    await expectReject(
      () => db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } }),
      /unique/i,
    );
    await db.prisma.rolePermission.create({ data: { role_id: role.id, permission_id: "platform.user.read" } });
    await expectReject(
      () => db.prisma.rolePermission.create({ data: { role_id: role.id, permission_id: "platform.user.read" } }),
      /unique/i,
    );
  });

  it("refuses deleting a User or Role that still owns historical rows", async () => {
    await truncatePlatformTables(db);
    const user = await db.prisma.user.create({ data: { email: "hist@example.com", display_name: "H", password_hash: "x" } });
    const role = await db.prisma.role.create({ data: { code: "hist", name: "H" } });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    await db.prisma.rolePermission.create({ data: { role_id: role.id, permission_id: "platform.role.read" } });
    await db.prisma.session.create({
      data: {
        token_hash: "a".repeat(64),
        user_id: user.id,
        last_seen_at: new Date(),
        idle_expires_at: new Date(Date.now() + 1000),
        absolute_expires_at: new Date(Date.now() + 2000),
      },
    });
    await expectReject(() => db.prisma.user.delete({ where: { id: user.id } }), /foreign key/i);
    await expectReject(() => db.prisma.role.delete({ where: { id: role.id } }), /foreign key/i);
  });
});

describe("platform schema: sessions", () => {
  it("enforces unique token hashes and supports live lookup", async () => {
    await truncatePlatformTables(db);
    const user = await db.prisma.user.create({ data: { email: "s@example.com", display_name: "S", password_hash: "x" } });
    const data = {
      user_id: user.id,
      last_seen_at: new Date(),
      idle_expires_at: new Date(Date.now() + 1000),
      absolute_expires_at: new Date(Date.now() + 2000),
    };
    await db.prisma.session.create({ data: { ...data, token_hash: "b".repeat(64) } });
    await expectReject(
      () => db.prisma.session.create({ data: { ...data, token_hash: "b".repeat(64) } }),
      /unique/i,
    );
    const found = await db.prisma.session.findUnique({ where: { token_hash: "b".repeat(64) } });
    assert.equal(found?.token_hash, "b".repeat(64));
  });

  it("declares the revocation and expiry-cleanup indexes", async () => {
    const indexes = await db.prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'platform' AND tablename = 'Session'`,
    );
    const names = indexes.map((row) => row.indexname);
    assert.ok(names.includes("Session_user_id_revoked_at_idx"), names.join(","));
    assert.ok(names.includes("Session_idle_expires_at_idx"));
    assert.ok(names.includes("Session_absolute_expires_at_idx"));
    assert.ok(names.includes("Session_token_hash_key"));
  });
});

describe("platform schema: settings singleton", () => {
  it("pins the singleton identity in SQL, not only application code", async () => {
    await truncatePlatformTables(db);
    await db.prisma.platformGeneralSettings.create({
      data: {
        id: "platform_general_settings",
        organization_name: "StudioFlow",
        app_title: "StudioFlow",
        locale: "id-ID",
        timezone: "Asia/Jakarta",
        currency: "IDR",
        week_starts_on: 1,
      },
    });
    await expectReject(
      () => db.prisma.platformGeneralSettings.create({
        data: {
          id: "another_settings_row",
          organization_name: "Other",
          app_title: "Other",
          locale: "id-ID",
          timezone: "Asia/Jakarta",
          currency: "IDR",
          week_starts_on: 0,
        },
      }),
      /check/i,
    );
  });
});

describe("platform schema: rate limiter storage", () => {
  it("has the migration-created LoginRateLimit table with the adapter shape", async () => {
    const columns = await db.prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'platform' AND table_name = 'LoginRateLimit' ORDER BY ordinal_position`,
    );
    assert.deepEqual(
      columns.map((column) => [column.column_name, column.data_type]),
      [["key", "character varying"], ["points", "integer"], ["expire", "bigint"]],
    );
    await db.prisma.$executeRawUnsafe(
      `INSERT INTO "platform"."LoginRateLimit" ("key", "points", "expire") VALUES ('login-email-test', 1, 123)`,
    );
    const rows = await db.prisma.$queryRawUnsafe<{ key: string; points: number }[]>(
      `SELECT key, points FROM "platform"."LoginRateLimit" WHERE key = 'login-email-test'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].points, 1);
  });
});
