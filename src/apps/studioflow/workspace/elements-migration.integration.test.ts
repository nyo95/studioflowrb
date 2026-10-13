import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import type { PoolClient } from "pg";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";

const MIGRATION = readFileSync("prisma/migrations/20261013210000_studioflow_workspace_elements/migration.sql", "utf8")
  .replaceAll('"studioflow".', "pg_temp.");

let db: TestDb;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

async function createTables(client: PoolClient) {
  await client.query(`
    CREATE TEMP TABLE sf_workspace_section (
      id text PRIMARY KEY, project_id text NOT NULL, system_key text, title text NOT NULL, sort_order integer NOT NULL,
      created_by_id text NOT NULL, created_at timestamp(3) NOT NULL, version integer NOT NULL DEFAULT 1,
      canvas_x integer, canvas_y integer, canvas_w integer, canvas_h integer
    );
    CREATE TEMP TABLE sf_workspace_card (
      id text PRIMARY KEY, project_id text NOT NULL, section_id text NOT NULL, sort_order integer NOT NULL,
      phase_id text, iteration_id text, body text NOT NULL DEFAULT '', is_pinned boolean NOT NULL DEFAULT false,
      origin text NOT NULL DEFAULT 'NOTE', author_id text, author_name text, created_at timestamp(3) NOT NULL,
      edited_at timestamp(3), updated_at timestamp(3) NOT NULL, version integer NOT NULL DEFAULT 1,
      canvas_x integer, canvas_y integer, canvas_w integer,
      CONSTRAINT sf_workspace_card_canvas_w_range CHECK (canvas_w IS NULL OR (canvas_w >= 180 AND canvas_w <= 100000))
    );
    CREATE TEMP TABLE sf_workspace_card_image (
      id text PRIMARY KEY, card_id text NOT NULL REFERENCES sf_workspace_card(id) ON DELETE CASCADE, storage_key text NOT NULL UNIQUE,
      content_type text NOT NULL, bytes integer NOT NULL, sort_order integer NOT NULL, uploaded_by_id text NOT NULL,
      uploaded_by_name text NOT NULL, created_at timestamp(3) NOT NULL
    );
  `);
}

async function createFixture(client: PoolClient) {
  await createTables(client);
  await client.query(`
    INSERT INTO sf_workspace_section (id, project_id, system_key, title, sort_order, created_by_id, created_at, canvas_x, canvas_y, canvas_w, canvas_h) VALUES
      ('board-a', 'project-a', 'DEFAULT', 'Workspace', 0, 'u1', '2026-10-01', 100, 50, 400, 300),
      ('frame-p', 'project-a', NULL, 'Materials', 1, 'u2', '2026-10-02', 600, 40, 400, 300),
      ('frame-u', 'project-a', NULL, 'Ideas', 2, 'u3', '2026-10-03', NULL, NULL, NULL, NULL),
      ('board-b', 'project-b', 'DEFAULT', 'Workspace', 0, 'u1', '2026-10-01', NULL, NULL, NULL, NULL);
    INSERT INTO sf_workspace_card (id, project_id, section_id, sort_order, phase_id, iteration_id, body, is_pinned, origin, author_id, author_name, created_at, updated_at, version, canvas_x, canvas_y, canvas_w) VALUES
      ('t1', 'project-a', 'board-a', 0, NULL, NULL, 'Text only', false, 'NOTE', 'u1', 'Ana', '2026-10-04', '2026-10-04', 3, 16, 56, 256),
      ('t2', 'project-a', 'board-a', 1, 'phase-1', 'round-2', 'Text with images', true, 'CLIENT_ANSWER', 'u2', 'Budi', '2026-10-05', '2026-10-05', 4, 16, 200, 256),
      ('e1', 'project-a', 'frame-p', 0, 'phase-1', NULL, '', false, 'SITE_VISIT', 'u2', 'Budi', '2026-10-06', '2026-10-06', 1, 16, 56, 256),
      ('t3', 'project-a', 'frame-p', 1, NULL, NULL, 'Loose', false, 'NOTE', 'u1', 'Ana', '2026-10-07', '2026-10-07', 2, NULL, NULL, NULL),
      ('e2', 'project-a', 'frame-u', 0, NULL, NULL, '', false, 'NOTE', 'u3', 'Citra', '2026-10-08', '2026-10-08', 1, NULL, NULL, NULL),
      ('b1', 'project-b', 'board-b', 0, NULL, NULL, '', false, 'NOTE', 'u1', 'Ana', '2026-10-01', '2026-10-01', 1, NULL, NULL, NULL);
    INSERT INTO sf_workspace_card_image (id, card_id, storage_key, content_type, bytes, sort_order, uploaded_by_id, uploaded_by_name, created_at) VALUES
      ('i1', 't2', 'k/1.png', 'image/png', 11, 1, 'u2', 'Budi', '2026-10-05 00:00:01'),
      ('i2', 't2', 'k/2.png', 'image/png', 12, 2, 'u2', 'Budi', '2026-10-05 00:00:02'),
      ('i3', 't2', 'k/3.jpg', 'image/jpeg', 13, 3, 'u2', 'Budi', '2026-10-05 00:00:03'),
      ('i4', 'e1', 'k/4.png', 'image/png', 14, 1, 'u2', 'Budi', '2026-10-06 00:00:01'),
      ('i5', 'e1', 'k/5.png', 'image/png', 15, 2, 'u2', 'Budi', '2026-10-06 00:00:02'),
      ('i6', 'e2', 'k/6.webp', 'image/webp', 16, 1, 'u3', 'Citra', '2026-10-08 00:00:01'),
      ('i7', 'b1', 'k/7.png', 'image/png', 17, 1, 'u1', 'Ana', '2026-10-01 00:00:01');
  `);
}

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

describe("WO-SF-WORKSPACE-04 Workspace elements migration", () => {
  it("folds frames into the board and turns every card image into an image element", async () => {
    await inTransaction(async (client) => {
      await createFixture(client);
      await client.query(MIGRATION);

      const sections = (await client.query("SELECT id, title, canvas_x, canvas_y, canvas_w, canvas_h FROM sf_workspace_section ORDER BY id")).rows;
      assert.deepEqual(sections, [
        { id: "board-a", title: "Workspace", canvas_x: 0, canvas_y: 0, canvas_w: 400, canvas_h: 300 },
        { id: "board-b", title: "Workspace", canvas_x: 0, canvas_y: 0, canvas_w: 384, canvas_h: 240 },
      ]);
      assert.equal((await client.query("SELECT to_regclass('pg_temp.sf_workspace_card_image') AS t")).rows[0].t, null);

      const rows = (await client.query(`
        SELECT id, project_id, section_id, sort_order, phase_id, iteration_id, body, is_pinned, origin, author_name, version,
               canvas_x, canvas_y, canvas_w, kind::text AS kind, text_style::text AS text_style, storage_key, content_type, bytes, uploaded_by_name
        FROM sf_workspace_card ORDER BY project_id, sort_order`)).rows;
      const byId = new Map(rows.map((row) => [row.id, row]));

      // Surviving text cards keep id, text, labels and version; placed ones take board coordinates.
      assert.deepEqual(
        [byId.get("t1")!.canvas_x, byId.get("t1")!.canvas_y, byId.get("t1")!.canvas_w, byId.get("t1")!.version, byId.get("t1")!.kind],
        [116, 106, 256, 3, "TEXT"],
      );
      assert.deepEqual([byId.get("t2")!.canvas_x, byId.get("t2")!.canvas_y, byId.get("t2")!.body, byId.get("t2")!.version], [116, 250, "Text with images", 4]);
      assert.deepEqual([byId.get("t3")!.section_id, byId.get("t3")!.canvas_x], ["board-a", null]);

      // A text card's images line up to its right with its labels.
      for (const [id, x] of [["i1", 388], ["i2", 644], ["i3", 900]] as const) {
        const image = byId.get(id)!;
        assert.deepEqual(
          [image.kind, image.canvas_x, image.canvas_y, image.canvas_w, image.phase_id, image.iteration_id, image.origin, image.is_pinned, image.author_name, image.body],
          ["IMAGE", x, 250, 240, "phase-1", "round-2", "CLIENT_ANSWER", true, "Budi", ""],
        );
      }
      assert.deepEqual([byId.get("i3")!.storage_key, byId.get("i3")!.content_type, byId.get("i3")!.bytes, byId.get("i3")!.uploaded_by_name], ["k/3.jpg", "image/jpeg", 13, "Budi"]);

      // An image-only card is replaced by its first image; the rest follow to the right.
      assert.equal(byId.has("e1"), false);
      assert.deepEqual([byId.get("i4")!.canvas_x, byId.get("i4")!.canvas_y, byId.get("i4")!.canvas_w, byId.get("i4")!.origin, byId.get("i4")!.section_id], [616, 96, 256, "SITE_VISIT", "board-a"]);
      assert.deepEqual([byId.get("i5")!.canvas_x, byId.get("i5")!.canvas_y, byId.get("i5")!.canvas_w], [888, 96, 240]);
      assert.equal(byId.has("e2"), false);
      assert.deepEqual([byId.get("i6")!.canvas_x, byId.get("i6")!.canvas_y, byId.get("i6")!.section_id], [null, null, "board-a"]);
      assert.equal(byId.has("b1"), false);
      assert.deepEqual([byId.get("i7")!.project_id, byId.get("i7")!.section_id, byId.get("i7")!.canvas_x], ["project-b", "board-b", null]);

      // Frame titles become headings where the frames were drawn (an unplaced frame right of the placed ones).
      const headings = rows.filter((row) => row.text_style === "HEADING").map((row) => [row.body, row.canvas_x, row.canvas_y, row.canvas_w, row.section_id]);
      assert.deepEqual(headings, [["Ideas", 1032, 32, 384, "board-a"], ["Materials", 600, 40, 400, "board-a"]]);

      // The phone order follows the board: placed by (y, x), then unplaced oldest first.
      const order = rows.filter((row) => row.project_id === "project-a").map((row) => row.body || row.id);
      assert.deepEqual(order, ["Ideas", "Materials", "i4", "i5", "Text only", "Text with images", "i1", "i2", "i3", "Loose", "i6"]);
    });
  });

  it("enforces what each kind holds and the narrower minimum width", async () => {
    await inTransaction(async (client) => {
      await createFixture(client);
      await client.query(MIGRATION);
      await client.query("UPDATE sf_workspace_card SET canvas_w = 120 WHERE id = 'i4'");
      const refusals = [
        "UPDATE sf_workspace_card SET canvas_w = 119 WHERE id = 'i4'",
        "UPDATE sf_workspace_card SET storage_key = 'k/x' WHERE id = 't1'",
        "UPDATE sf_workspace_card SET body = 'caption' WHERE id = 'i4'",
        "UPDATE sf_workspace_card SET storage_key = NULL WHERE id = 'i4'",
        "UPDATE sf_workspace_card SET kind = 'FILE' WHERE id = 'i4'",
        "UPDATE sf_workspace_card SET storage_key = 'k/1.png' WHERE id = 'i2'",
      ];
      for (const statement of refusals) {
        await client.query("SAVEPOINT kind_check");
        await assert.rejects(client.query(statement), statement);
        await client.query("ROLLBACK TO SAVEPOINT kind_check");
      }
      await client.query("UPDATE sf_workspace_card SET kind = 'FILE', file_name = 'plan.pdf' WHERE id = 'i4'");
    });
  });

  it("refuses a project whose sections have no default section", async () => {
    await inTransaction(async (client) => {
      await createTables(client);
      await client.query(`
        INSERT INTO sf_workspace_section (id, project_id, system_key, title, sort_order, created_by_id, created_at) VALUES ('lonely', 'project-c', NULL, 'Notes', 0, 'u1', '2026-10-01');
      `);
      await assert.rejects(client.query(MIGRATION), /no single DEFAULT section/);
    });
  });
});
