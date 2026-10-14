import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import type { PoolClient } from "pg";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

const MIGRATION = readFileSync("prisma/migrations/20261014120000_studioflow_workspace_workflow_record/migration.sql", "utf8")
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

describe("R9.07 Workspace workflow-record migration", () => {
  it("marks site visits and the answer step's feedback as records, and leaves notes marked by hand switchable", async () => {
    await inTransaction(async (client) => {
      await client.query(`
        CREATE TEMP TABLE sf_revision (id text PRIMARY KEY, answered_at timestamp(3));
        CREATE TEMP TABLE sf_workspace_card (id text PRIMARY KEY, iteration_id text, origin text NOT NULL, created_at timestamp(3) NOT NULL);
        INSERT INTO sf_revision (id, answered_at) VALUES ('answered', '2026-10-10 09:00:00'), ('open', NULL);
        INSERT INTO sf_workspace_card (id, iteration_id, origin, created_at) VALUES
          ('visit', NULL, 'SITE_VISIT', '2026-10-01'),
          ('answer-text', 'answered', 'CLIENT_ANSWER', '2026-10-10 09:00:00'),
          ('answer-shot', 'answered', 'CLIENT_ANSWER', '2026-10-10 09:00:40'),
          ('later-by-hand', 'answered', 'CLIENT_ANSWER', '2026-10-11 10:00:00'),
          ('before-answer', 'answered', 'CLIENT_ANSWER', '2026-10-09 15:00:00'),
          ('unanswered', 'open', 'CLIENT_ANSWER', '2026-10-10 09:00:00'),
          ('plain-note', 'answered', 'NOTE', '2026-10-10 09:00:00');
      `);
      await client.query(MIGRATION);
      const rows = await client.query<{ id: string; workflow_record: boolean }>("SELECT id, workflow_record FROM sf_workspace_card ORDER BY id");
      assert.deepEqual(Object.fromEntries(rows.rows.map((row) => [row.id, row.workflow_record])), {
        "answer-shot": true,
        "answer-text": true,
        "before-answer": false,
        "later-by-hand": false,
        "plain-note": false,
        unanswered: false,
        visit: true,
      });
      const column = await client.query<{ is_nullable: string; column_default: string }>(
        "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'sf_workspace_card' AND column_name = 'workflow_record'",
      );
      assert.deepEqual([column.rows[0]?.is_nullable, column.rows[0]?.column_default], ["NO", "false"]);
    });
  });
});
