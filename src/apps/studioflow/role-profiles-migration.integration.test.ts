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

const MIGRATION = readFileSync("prisma/migrations/20261019190000_studioflow_role_profiles/migration.sql", "utf8");

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

describe("StudioFlow role profile migration", () => {
  it("replaces only canonical StudioFlow grants while preserving assignments and other-app grants", async () => {
    await truncatePlatformTables(db);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO platform."Role" (id, code, name, is_system, created_at, updated_at) VALUES
          ('10000000-0000-4000-8000-000000000001', 'designer', 'Old Designer', FALSE, now(), now()),
          ('10000000-0000-4000-8000-000000000002', 'masterdata-staff', 'Master Data Staff', FALSE, now(), now());
        INSERT INTO platform."User" (id, email, display_name, password_hash, status, created_at, updated_at)
          VALUES ('20000000-0000-4000-8000-000000000001', 'designer@example.com', 'Designer', 'fixture', 'ACTIVE', now(), now());
        INSERT INTO platform."UserRole" (id, user_id, role_id, assigned_at)
          VALUES ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now());
        INSERT INTO platform."RolePermission" (id, role_id, permission_id, granted_at) VALUES
          ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'studioflow.project.override', now()),
          ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'masterdata.brand.read', now()),
          ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'masterdata.brand.manage', now());
      `);
      await client.query(MIGRATION);
      await client.query(MIGRATION);

      const rows = await client.query<{ code: string; permission_id: string }>(`
        SELECT role.code, grant_row.permission_id
        FROM platform."RolePermission" AS grant_row
        JOIN platform."Role" AS role ON role.id = grant_row.role_id
        ORDER BY role.code, grant_row.permission_id
      `);
      assert.deepEqual(rows.rows.map((row) => [row.code, row.permission_id]), [
        ['designer', 'masterdata.brand.read'],
        ['designer', 'studioflow.access'],
        ['designer', 'studioflow.mom.manage'],
        ['designer', 'studioflow.phase.review'],
        ['designer', 'studioflow.phase.work'],
        ['designer', 'studioflow.presentation.manage'],
        ['designer', 'studioflow.project.pic-designer'],
        ['designer', 'studioflow.project.read'],
        ['designer', 'studioflow.schedule.manage'],
        ['designer', 'studioflow.task.manage'],
        ['drafter', 'studioflow.access'],
        ['drafter', 'studioflow.mom.manage'],
        ['drafter', 'studioflow.phase.review'],
        ['drafter', 'studioflow.phase.work'],
        ['drafter', 'studioflow.presentation.manage'],
        ['drafter', 'studioflow.project.pic-drafter'],
        ['drafter', 'studioflow.project.read'],
        ['drafter', 'studioflow.schedule.manage'],
        ['drafter', 'studioflow.task.manage'],
        ['masterdata-staff', 'masterdata.brand.manage'],
        ['studio-manager', 'studioflow.access'],
        ['studio-manager', 'studioflow.mom.manage'],
        ['studio-manager', 'studioflow.phase.review'],
        ['studio-manager', 'studioflow.phase.work'],
        ['studio-manager', 'studioflow.presentation.manage'],
        ['studio-manager', 'studioflow.project.manage'],
        ['studio-manager', 'studioflow.project.pic-designer'],
        ['studio-manager', 'studioflow.project.read'],
        ['studio-manager', 'studioflow.schedule.manage'],
        ['studio-manager', 'studioflow.task.manage'],
      ]);
      const assignment = await client.query("SELECT count(*)::int AS count FROM platform.\"UserRole\"");
      assert.equal(assignment.rows[0]?.count, 1);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
