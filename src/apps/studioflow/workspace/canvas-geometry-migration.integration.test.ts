import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import type { PoolClient } from "pg";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

const MIGRATION = readFileSync("prisma/migrations/20261013180000_studioflow_workspace_canvas_geometry/migration.sql", "utf8")
  .replaceAll('"studioflow".', "pg_temp.");

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

async function createFixture(client: PoolClient) {
  await client.query(`
    CREATE TEMP TABLE sf_workspace_section (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      system_key text,
      title text NOT NULL,
      sort_order integer NOT NULL,
      version integer NOT NULL
    );
    CREATE TEMP TABLE sf_workspace_card (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      section_id text NOT NULL,
      sort_order integer NOT NULL,
      body text NOT NULL,
      version integer NOT NULL
    );
    INSERT INTO sf_workspace_section VALUES
      ('default', 'project-a', 'DEFAULT', 'Workspace', 3, 7),
      ('other', 'project-a', NULL, 'Materials', 1, 2);
    INSERT INTO sf_workspace_card VALUES
      ('card-a', 'project-a', 'default', 4, 'Keep me', 5),
      ('card-b', 'project-a', 'other', 2, 'Keep me too', 9);
  `);
}

describe("WO-SF-WORKSPACE-03 canvas geometry migration", () => {
  it("adds nullable geometry without changing existing Workspace identity, order, versions, or default section", async () => {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await createFixture(client);
      const sectionsBefore = (await client.query("SELECT * FROM sf_workspace_section ORDER BY id")).rows;
      const cardsBefore = (await client.query("SELECT * FROM sf_workspace_card ORDER BY id")).rows;
      await client.query(MIGRATION);

      const sections = (await client.query("SELECT id, project_id, system_key, title, sort_order, version FROM sf_workspace_section ORDER BY id")).rows;
      const cards = (await client.query("SELECT id, project_id, section_id, sort_order, body, version FROM sf_workspace_card ORDER BY id")).rows;
      assert.deepEqual(sections, sectionsBefore);
      assert.deepEqual(cards, cardsBefore);
      assert.deepEqual((await client.query("SELECT canvas_x, canvas_y, canvas_w, canvas_h FROM sf_workspace_section ORDER BY id")).rows, [
        { canvas_x: null, canvas_y: null, canvas_w: null, canvas_h: null },
        { canvas_x: null, canvas_y: null, canvas_w: null, canvas_h: null },
      ]);
      assert.deepEqual((await client.query("SELECT canvas_x, canvas_y, canvas_w FROM sf_workspace_card ORDER BY id")).rows, [
        { canvas_x: null, canvas_y: null, canvas_w: null },
        { canvas_x: null, canvas_y: null, canvas_w: null },
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("enforces paired positions and every canvas range", async () => {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await createFixture(client);
      await client.query(MIGRATION);
      const refusals = [
        "UPDATE sf_workspace_section SET canvas_x = 1 WHERE id = 'default'",
        "UPDATE sf_workspace_section SET canvas_x = 0, canvas_y = 0, canvas_w = 259 WHERE id = 'default'",
        "UPDATE sf_workspace_section SET canvas_h = 119 WHERE id = 'default'",
        "UPDATE sf_workspace_section SET canvas_x = 100001, canvas_y = 0 WHERE id = 'default'",
        "UPDATE sf_workspace_card SET canvas_y = 1 WHERE id = 'card-a'",
        "UPDATE sf_workspace_card SET canvas_x = 0, canvas_y = 0, canvas_w = 179 WHERE id = 'card-a'",
        "UPDATE sf_workspace_card SET canvas_x = -1, canvas_y = 0 WHERE id = 'card-a'",
      ];
      for (const statement of refusals) {
        await client.query("SAVEPOINT geometry_check");
        await assert.rejects(client.query(statement));
        await client.query("ROLLBACK TO SAVEPOINT geometry_check");
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
