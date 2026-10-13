import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import type { PoolClient } from "pg";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

const MIGRATION = readFileSync("prisma/migrations/20261013150000_studioflow_workspace_default_section/migration.sql", "utf8")
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
    CREATE TEMP TABLE sf_project (id text PRIMARY KEY);
    CREATE TEMP TABLE sf_workspace_section (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      title text NOT NULL,
      sort_order integer NOT NULL,
      created_by_id text NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      version integer NOT NULL DEFAULT 1
    );
    CREATE TEMP TABLE sf_workspace_card (
      id text PRIMARY KEY,
      project_id text NOT NULL,
      section_id text NOT NULL,
      sort_order integer NOT NULL,
      body text NOT NULL
    );
    CREATE TEMP TABLE sf_workspace_card_image (
      id text PRIMARY KEY,
      card_id text NOT NULL,
      storage_key text NOT NULL,
      sort_order integer NOT NULL
    );

    INSERT INTO sf_project (id) VALUES ('project-a'), ('project-b'), ('project-c'), ('project-empty');
    INSERT INTO sf_workspace_section (id, project_id, title, sort_order, created_by_id, created_at, updated_at, version) VALUES
      ('a-notes', 'project-a', 'Notes', 4, 'owner', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', 3),
      ('a-before', 'project-a', 'Materials', -2, 'owner', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', 1),
      ('b-renamed', 'project-b', 'My inbox', 0, 'owner', '2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z', 5),
      ('b-later', 'project-b', 'Site', 1, 'owner', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z', 1),
      ('c-later', 'project-c', 'Later', 2, 'owner', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', 1),
      ('c-first', 'project-c', 'First by order', 0, 'owner', '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z', 2);

    INSERT INTO sf_workspace_card (id, project_id, section_id, sort_order, body) VALUES
      ('card-a1', 'project-a', 'a-notes', 0, 'Oldest'),
      ('card-a2', 'project-a', 'a-notes', 1, 'Newest'),
      ('card-c1', 'project-c', 'c-later', 7, 'Keep my order');
    INSERT INTO sf_workspace_card_image (id, card_id, storage_key, sort_order) VALUES
      ('image-a1', 'card-a1', 'studioflow/notes/a.png', 1),
      ('image-a2', 'card-a1', 'studioflow/notes/b.png', 0);
  `);
}

describe("WO-SF-WORKSPACE-02 default-section migration", () => {
  it("backfills one default without changing cards, images or ordering", async () => {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await createFixture(client);
      const cardsBefore = (await client.query("SELECT * FROM sf_workspace_card ORDER BY id")).rows;
      const imagesBefore = (await client.query("SELECT * FROM sf_workspace_card_image ORDER BY id")).rows;
      const orderBefore = (await client.query("SELECT id, project_id, sort_order FROM sf_workspace_section ORDER BY id")).rows;

      await client.query(MIGRATION);

      const sections = (await client.query<{ id: string; project_id: string; title: string; sort_order: number; version: number; system_key: string | null }>(
        "SELECT id, project_id, title, sort_order, version, system_key FROM sf_workspace_section ORDER BY id",
      )).rows;
      assert.deepEqual(sections.map((row) => [row.id, row.title, row.version, row.system_key]), [
        ["a-before", "Materials", 1, null],
        ["a-notes", "Workspace", 4, "DEFAULT"],
        ["b-later", "Site", 1, null],
        ["b-renamed", "My inbox", 6, "DEFAULT"],
        ["c-first", "First by order", 3, "DEFAULT"],
        ["c-later", "Later", 1, null],
      ]);
      assert.deepEqual((await client.query("SELECT * FROM sf_workspace_card ORDER BY id")).rows, cardsBefore);
      assert.deepEqual((await client.query("SELECT * FROM sf_workspace_card_image ORDER BY id")).rows, imagesBefore);
      assert.deepEqual((await client.query("SELECT id, project_id, sort_order FROM sf_workspace_section ORDER BY id")).rows, orderBefore);
      assert.equal((await client.query("SELECT count(*)::int AS count FROM sf_project project LEFT JOIN sf_workspace_section section ON section.project_id = project.id WHERE project.id = 'project-empty' AND section.id IS NOT NULL")).rows[0].count, 0, "a project with no sections remains without a section");
      await assert.rejects(
        client.query("INSERT INTO sf_workspace_section (id, project_id, system_key, title, sort_order, created_by_id, created_at, updated_at, version) VALUES ('a-second-default', 'project-a', 'DEFAULT', 'Other', 9, 'owner', now(), now(), 1)"),
        /sf_workspace_section_project_id_system_key_key/u,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("fails closed if the backfill would leave two defaults for one project", async () => {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await createFixture(client);
      const seededDoubleDefault = MIGRATION.replace(
        "-- DEFAULT_SECTION_GUARD:",
        "UPDATE pg_temp.\"sf_workspace_section\" SET \"system_key\" = 'DEFAULT' WHERE \"id\" = 'a-before';\n-- DEFAULT_SECTION_GUARD:",
      );
      await assert.rejects(client.query(seededDoubleDefault), /every project with sections must have exactly one DEFAULT section/u);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
