import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import { isAppError } from "@platform/core/errors";

import { changeModuleState } from "./admin";
import { initializeModuleRegistry, resetModuleRegistryForTests, type ModuleManifest } from "./manifest";
import { enabledModuleIds, isModuleEnabled } from "./state";

const MANIFESTS: readonly ModuleManifest[] = [
  { id: "masterdata", name: "Master Data", version: "1.0.0", kind: "core", requires: [] },
  { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", requires: ["masterdata"] },
  { id: "ideas", name: "Ideas Board", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
  { id: "presentation", name: "Presentation", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
];

let db: TestDb;

before(async () => {
  initializeModuleRegistry(MANIFESTS);
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  resetModuleRegistryForTests();
  await closeTestDb(db);
});

describe("module state database contract", () => {
  it("defaults optional modules on, audits each real change, preserves app data, and refuses core changes", async () => {
    await truncatePlatformTables(db);
    const suffix = randomUUID();
    const userId = randomUUID();
    const projectId = randomUUID();
    const boardId = randomUUID();
    const cardId = randomUUID();
    const entryId = randomUUID();
    const optionId = randomUUID();
    const usageId = randomUUID();
    await db.prisma.sfProject.create({ data: {
      id: projectId,
      name: `Module state fixture ${suffix}`,
      pic_designer_id: userId,
      pic_drafter_id: userId,
      created_by_id: userId,
    } });
    await db.prisma.sfPresentationBoard.create({ data: { id: boardId, project_id: projectId, title: "Keep me", sort_order: 0, created_by_id: userId } });
    await db.prisma.sfScheduleEntry.create({ data: {
      id: entryId,
      project_id: projectId,
      section: "MATERIAL",
      category: "Fixture",
      category_key: "fixture",
      prefix: "FX",
      increment: 1,
      sort_order: 0,
    } });
    await db.prisma.sfScheduleOption.create({ data: {
      id: optionId,
      entry_id: entryId,
      label: "A",
      product_name: "Module state fixture",
      search_key: "module state fixture",
    } });
    await db.prisma.sfIdeaCard.create({ data: {
      id: cardId,
      owner_user_id: userId,
      title: "Keep me",
      image_key: `module-state/${suffix}.png`,
      content_type: "image/png",
      bytes: 1,
    } });
    await db.prisma.sfIdeaUsage.create({ data: { id: usageId, card_id: cardId, option_id: optionId } });

    try {
      assert.equal(await isModuleEnabled("ideas", db.prisma), true);
      assert.equal(await isModuleEnabled("presentation", db.prisma), true);
      assert.deepEqual(await enabledModuleIds(db.prisma), ["platform", "masterdata", "studioflow", "ideas", "presentation"]);

      const change = (moduleId: string, state: "ENABLED" | "DISABLED") => changeModuleState({
        moduleId,
        state,
        runTransaction: (work) => runSerializableTransaction(db.prisma, work),
        auditWriter: createAuditEventWriter(),
      });

      assert.deepEqual(await change("ideas", "DISABLED"), { changed: true, state: "DISABLED" });
      assert.equal(await isModuleEnabled("ideas", db.prisma), false);
      assert.deepEqual(await change("ideas", "DISABLED"), { changed: false, state: "DISABLED" });
      assert.deepEqual(await change("ideas", "ENABLED"), { changed: true, state: "ENABLED" });
      assert.deepEqual(await change("presentation", "DISABLED"), { changed: true, state: "DISABLED" });
      assert.equal(await isModuleEnabled("presentation", db.prisma), false);
      assert.deepEqual(await change("presentation", "ENABLED"), { changed: true, state: "ENABLED" });

      const audits = await db.prisma.auditEvent.findMany({ where: { entity_type: "module" }, orderBy: { occurred_at: "asc" } });
      assert.equal(audits.length, 4);
      assert.ok(audits.every((event) => event.actor_kind === "SYSTEM" && event.actor_label === "system-owner-cli"));
      assert.equal(await db.prisma.sfIdeaCard.count({ where: { id: cardId } }), 1);
      assert.equal(await db.prisma.sfIdeaUsage.count({ where: { id: usageId } }), 1);
      assert.equal(await db.prisma.sfPresentationBoard.count({ where: { id: boardId } }), 1);

      await assert.rejects(
        () => change("studioflow", "DISABLED"),
        (error: unknown) => isAppError(error) && error.code === "MODULE_CORE_STATE_REFUSED",
      );
      assert.equal(await db.prisma.moduleState.count({ where: { module_id: "studioflow" } }), 0);
    } finally {
      await db.prisma.sfIdeaCard.deleteMany({ where: { id: cardId } });
      await db.prisma.sfProject.deleteMany({ where: { id: projectId } });
    }
  });
});
