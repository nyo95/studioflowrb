import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";

import { STUDIOFLOW_ROLE_PROFILES } from "./role-profiles";

const PROFILES = readFileSync("prisma/migrations/20261019190000_studioflow_role_profiles/migration.sql", "utf8");
const MANAGER = readFileSync("prisma/migrations/20261024200000_studioflow_manager_profile/migration.sql", "utf8");

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

describe("StudioFlow Manager profile migration (WO-SF-ROLES-01)", () => {
  it("gives the Manager role exactly the code profile, leaves Designer, Drafter, assignments and other apps alone, and is repeatable", async () => {
    await truncatePlatformTables(db);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(PROFILES);
      await client.query(`
        INSERT INTO platform."User" (id, email, display_name, password_hash, status, created_at, updated_at)
          VALUES ('20000000-0000-4000-8000-000000000001', 'manager@example.com', 'Manager', 'fixture', 'ACTIVE', now(), now());
        INSERT INTO platform."UserRole" (id, user_id, role_id, assigned_at)
          SELECT '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', id, now() FROM platform."Role" WHERE code = 'studio-manager';
        INSERT INTO platform."RolePermission" (id, role_id, permission_id, granted_at)
          SELECT '40000000-0000-4000-8000-000000000001', id, 'masterdata.brand.read', now() FROM platform."Role" WHERE code = 'studio-manager';
      `);
      const before = await client.query<{ code: string; permission_id: string }>(`
        SELECT role.code, grant_row.permission_id FROM platform."RolePermission" grant_row JOIN platform."Role" role ON role.id = grant_row.role_id
        WHERE role.code IN ('designer', 'drafter') ORDER BY 1, 2`);

      await client.query(MANAGER);
      await client.query(MANAGER);

      const manager = await client.query<{ permission_id: string }>(`
        SELECT grant_row.permission_id FROM platform."RolePermission" grant_row JOIN platform."Role" role ON role.id = grant_row.role_id
        WHERE role.code = 'studio-manager' AND grant_row.permission_id LIKE 'studioflow.%' ORDER BY 1`);
      const expected = [...STUDIOFLOW_ROLE_PROFILES.find((profile) => profile.code === "studio-manager")!.permissionIds].sort();
      assert.deepEqual(manager.rows.map((row) => row.permission_id), expected, "the migration and the code profile agree");
      assert.equal(manager.rows.some((row) => row.permission_id.includes("pic-")), false, "no PIC position");

      const other = await client.query(`SELECT count(*)::int AS count FROM platform."RolePermission" grant_row JOIN platform."Role" role ON role.id = grant_row.role_id WHERE role.code = 'studio-manager' AND grant_row.permission_id = 'masterdata.brand.read'`);
      assert.equal(other.rows[0]?.count, 1, "other apps' grants stay");
      assert.equal((await client.query("SELECT count(*)::int AS count FROM platform.\"UserRole\"")).rows[0]?.count, 1, "assignments stay");
      const after = await client.query<{ code: string; permission_id: string }>(`
        SELECT role.code, grant_row.permission_id FROM platform."RolePermission" grant_row JOIN platform."Role" role ON role.id = grant_row.role_id
        WHERE role.code IN ('designer', 'drafter') ORDER BY 1, 2`);
      assert.deepEqual(after.rows, before.rows, "Designer and Drafter are untouched");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
