import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";

import { createUserTutorialService } from "./index";

let db: TestDb;
before(async () => { db = await createTestDb(requireDisposableTestDatabaseUrl()); });
beforeEach(async () => { await truncatePlatformTables(db); });
after(async () => { await closeTestDb(db); });

async function user(email: string) { return db.prisma.user.create({ data: { email, display_name: email, password_hash: "x" } }); }

describe("personal tutorial progress", () => {
  it("records, overwrites, lists only the owner rows, and clears one tour", async () => {
    const [first, second] = await Promise.all([user("tour-first@test.local"), user("tour-second@test.local")]);
    const tutorials = createUserTutorialService(db.prisma);

    assert.deepEqual(await tutorials.list({ userId: first.id }), []);
    const saved = await tutorials.record({ userId: first.id, tourKey: "studioflow", version: 1, state: "dismissed" });
    assert.deepEqual({ tourKey: saved.tourKey, version: saved.version, state: saved.state }, { tourKey: "studioflow", version: 1, state: "dismissed" });
    assert.ok(saved.updatedAt instanceof Date);
    await tutorials.record({ userId: first.id, tourKey: "studioflow", version: 2, state: "completed" });
    await tutorials.record({ userId: first.id, tourKey: "bq", version: 1, state: "dismissed" });
    await tutorials.record({ userId: second.id, tourKey: "studioflow", version: 1, state: "completed" });

    assert.deepEqual((await tutorials.list({ userId: first.id })).map(({ tourKey, version, state }) => ({ tourKey, version, state })), [
      { tourKey: "bq", version: 1, state: "dismissed" },
      { tourKey: "studioflow", version: 2, state: "completed" },
    ]);
    assert.deepEqual((await tutorials.list({ userId: second.id })).map(({ tourKey, version, state }) => ({ tourKey, version, state })), [
      { tourKey: "studioflow", version: 1, state: "completed" },
    ]);

    await tutorials.clear({ userId: first.id, tourKey: "studioflow" });
    assert.deepEqual((await tutorials.list({ userId: first.id })).map((row) => row.tourKey), ["bq"]);
    assert.deepEqual((await tutorials.list({ userId: second.id })).map((row) => row.tourKey), ["studioflow"]);
  });

  it("refuses invalid keys, versions and states before it writes", async () => {
    const person = await user("tour-guards@test.local");
    const tutorials = createUserTutorialService(db.prisma);
    for (const input of [
      { tourKey: "StudioFlow", version: 1, state: "completed" },
      { tourKey: "studioflow", version: 0, state: "completed" },
      { tourKey: "studioflow", version: 1.5, state: "completed" },
      { tourKey: "studioflow", version: 1, state: "later" },
    ]) {
      await assert.rejects(
        () => tutorials.record({ userId: person.id, tourKey: input.tourKey, version: input.version, state: input.state as "completed" }),
        (error: unknown) => error instanceof AppError && /^TUTORIAL_(KEY|VERSION|STATE)$/.test(error.code),
      );
    }
    assert.equal(await db.prisma.userTutorial.count({ where: { user_id: person.id } }), 0);
  });

  it("returns guide language and only the signed-in person's progress through the shell read", async () => {
    const [first, second] = await Promise.all([user("tour-shell-first@test.local"), user("tour-shell-second@test.local")]);
    await db.prisma.userPreference.create({ data: { user_id: first.id, language: "id" } });
    const tutorials = createUserTutorialService(db.prisma);
    await tutorials.record({ userId: first.id, tourKey: "studioflow", version: 1, state: "completed" });
    await tutorials.record({ userId: second.id, tourKey: "masterdata", version: 1, state: "dismissed" });

    const state = await tutorials.getShellState({ userId: first.id, language: "id" });
    assert.equal(state.language, "id");
    assert.deepEqual(state.tutorials.map((row) => row.tourKey), ["studioflow"]);
  });

  it("cascades tutorial rows if an otherwise unreferenced user is deleted", async () => {
    const person = await user("tour-cascade@test.local");
    const tutorials = createUserTutorialService(db.prisma);
    await tutorials.record({ userId: person.id, tourKey: "studioflow", version: 1, state: "completed" });
    await db.prisma.user.delete({ where: { id: person.id } });
    assert.equal(await db.prisma.userTutorial.count({ where: { user_id: person.id } }), 0);
  });
});
