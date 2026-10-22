import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { createNotificationWriter } from "@platform/core/notifications/persistence";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { FakeObjectStorage } from "@platform/core/storage";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import type { PrismaClient } from "@/generated/prisma/client";

import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { createScheduleService } from "./schedule/service";

/** WO-SF-CATEGORY-SIMILAR-01: an import with a look-alike new category stops before writing, unless confirmed. */

let testDb: TestDb;
let schedule: ReturnType<typeof createScheduleService>;
const actorId = randomUUID();
const ctx = () => ({ grants: Object.values(P), actor: { kind: "USER" as const, userId: actorId, label: "Importer" } });

before(async () => {
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  const db = testDb.prisma;
  schedule = createScheduleService(db, {
    runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
    auditWriter: createAuditEventWriter(),
    people: createPeopleDirectory(db),
    storage: new FakeObjectStorage(),
    notificationWriter: createNotificationWriter(),
    masterData: createMasterDataPublicRead(db),
  });
});
beforeEach(async () => {
  await testDb.pool.query(`TRUNCATE TABLE ${["sf_schedule_option", "sf_schedule_entry", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix", "sf_project"].map((table) => `"studioflow"."${table}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await truncatePlatformTables(testDb);
  await testDb.prisma.sfSchedulePrefix.create({ data: { section: "MATERIAL", category: "High Pressure Laminate", category_key: "HIGH PRESSURE LAMINATE", prefix: "PL" } });
});
after(async () => closeTestDb(testDb));

async function project() {
  return (await testDb.prisma.sfProject.create({ data: { name: `Import ${randomUUID().slice(0, 6)}`, pic_designer_id: actorId, pic_drafter_id: actorId, created_by_id: actorId } })).id;
}

describe("schedule import and look-alike categories", () => {
  it("refuses a simple sheet whose new category looks like a studio one, writing nothing, and imports it once confirmed", async () => {
    const projectId = await project();
    const csv = "category,brand,product\nHPL/Plastic Laminate,Taco,Laminate SLS 151\nWallpaper,Vinilon,Linen 01\n";
    await assert.rejects(schedule.importCsv({ ...ctx(), projectId, section: "MATERIAL", csv }), (error: unknown) => error instanceof AppError && error.code === "SCHEDULE_CSV_CATEGORY_SIMILAR" && /High Pressure Laminate \(PL\)/.test(error.safeMessage) && !/Wallpaper/.test(error.safeMessage));
    assert.equal(await testDb.prisma.sfScheduleEntry.count(), 0);
    const imported = await schedule.importCsv({ ...ctx(), projectId, section: "MATERIAL", csv, acceptNewCategories: true });
    assert.equal(imported.created, 2);
  });

  it("imports without asking when the sheet uses the studio name or a name the project already has", async () => {
    const projectId = await project();
    assert.equal((await schedule.importCsv({ ...ctx(), projectId, section: "MATERIAL", csv: "category,brand,product\nhigh pressure laminate,Taco,Laminate SLS 151\n" })).created, 1);
    const entry = await testDb.prisma.sfScheduleEntry.findFirstOrThrow({ where: { project_id: projectId } });
    assert.equal(entry.prefix, "PL");
    const other = await project();
    await schedule.importCsv({ ...ctx(), projectId: other, section: "MATERIAL", csv: "category,brand,product\nHPL,Taco,A\n", acceptNewCategories: true });
    assert.equal((await schedule.importCsv({ ...ctx(), projectId: other, section: "MATERIAL", csv: "category,brand,product\nHPL,Taco,B\n" })).created, 1);
  });
});
