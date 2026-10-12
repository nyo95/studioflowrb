import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncatePlatformTables,
  type TestDb,
} from "@platform/core/db/test-support";

const MIGRATION = readFileSync(
  "prisma/migrations/20261011190000_platform_owner_role_matrix/migration.sql",
  "utf8",
);

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

describe("Platform Owner role cleanup migration", () => {
  it("removes owner-only and generated override grants while preserving deliberate manager grants", async () => {
    await truncatePlatformTables(db);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO platform."Role" (id, code, name, is_system, created_at, updated_at) VALUES
          ('10000000-0000-4000-8000-000000000001', 'platform-owner', 'Platform Owner', TRUE, now(), now()),
          ('10000000-0000-4000-8000-000000000002', 'studio-manager', 'Studio Manager', FALSE, now(), now()),
          ('10000000-0000-4000-8000-000000000003', 'designer', 'Designer', FALSE, now(), now());
        INSERT INTO platform."User" (id, email, display_name, password_hash, status, created_at, updated_at)
          VALUES ('20000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner', 'fixture', 'ACTIVE', now(), now());
        INSERT INTO platform."UserRole" (id, user_id, role_id, assigned_at)
          VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now());
        INSERT INTO platform."RolePermission" (id, role_id, permission_id, granted_at) VALUES
          ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'platform.user.manage', now()),
          ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'studioflow.project.override', now()),
          ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'studioflow.project.override', now()),
          ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', 'platform.settings.read', now()),
          (md5('10000000-0000-4000-8000-000000000003:studioflow.project.override')::uuid, '10000000-0000-4000-8000-000000000003', 'studioflow.project.override', now());
      `);
      await client.query(MIGRATION);
      const rows = await client.query<{ code: string; permission_id: string }>(`
        SELECT r.code, rp.permission_id
        FROM platform."RolePermission" rp
        JOIN platform."Role" r ON r.id = rp.role_id
        ORDER BY r.code, rp.permission_id
      `);
      assert.deepEqual(rows.rows.map((row) => [row.code, row.permission_id]), [
        ["platform-owner", "platform.user.manage"],
        ["platform-owner", "studioflow.project.override"],
        ["studio-manager", "studioflow.project.override"],
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("fails closed when an existing installation has no active Platform Owner", async () => {
    await truncatePlatformTables(db);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO platform."User" (id, email, display_name, password_hash, status, created_at, updated_at)
          VALUES ('20000000-0000-4000-8000-000000000002', 'admin@example.com', 'Admin', 'fixture', 'ACTIVE', now(), now());
      `);
      await assert.rejects(client.query(MIGRATION), /assign an active Platform Owner first/u);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
