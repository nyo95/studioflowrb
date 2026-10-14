import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import type { PoolClient } from "pg";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

const MIGRATION = readFileSync("prisma/migrations/20261014150000_studioflow_phase_iteration_kinds_snapshot/migration.sql", "utf8")
  .replaceAll('"studioflow".', "pg_temp.");

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

async function inTransaction(run: (client: PoolClient) => Promise<void>) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

describe("R9.30 phase iteration-kinds snapshot migration", () => {
  it("backfills every phase from its definition and makes the snapshot required", async () => {
    await inTransaction(async (client) => {
      await client.query(`
        CREATE TEMP TABLE sf_phase_definition (id text PRIMARY KEY, default_iteration_kinds jsonb);
        CREATE TEMP TABLE sf_phase (id text PRIMARY KEY, definition_id text NOT NULL);
        INSERT INTO sf_phase_definition (id, default_iteration_kinds) VALUES
          ('named', '[{"name":"CD Mall"},{"name":"CD Final"}]'::jsonb),
          ('ordinary', NULL);
        INSERT INTO sf_phase (id, definition_id) VALUES ('old-named', 'named'), ('old-ordinary', 'ordinary');
      `);
      await client.query(MIGRATION);
      const rows = await client.query<{ id: string; snapshot: string }>(
        "SELECT id, iteration_kinds_snapshot::text AS snapshot FROM sf_phase ORDER BY id",
      );
      assert.deepEqual(rows.rows, [
        { id: "old-named", snapshot: '[{"name": "CD Mall"}, {"name": "CD Final"}]' },
        { id: "old-ordinary", snapshot: "null" },
      ]);
      const column = await client.query<{ is_nullable: string }>(
        "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'sf_phase' AND column_name = 'iteration_kinds_snapshot'",
      );
      assert.equal(column.rows[0]?.is_nullable, "NO");
    });
  });
});
