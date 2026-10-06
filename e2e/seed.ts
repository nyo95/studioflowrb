import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.test.local" });
loadEnv({ path: ".env.test" });

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { bootstrapFirstOwner } from "@platform/core/auth/bootstrap";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables } from "@platform/core/db/test-support";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import { createNotificationWriter } from "@platform/core/notifications/persistence";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";
import { FakeObjectStorage } from "@platform/core/storage";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBqService } from "@/apps/bq/service";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { LEGACY_PHASE_DEFINITION_IDS as LEGACY } from "@/apps/studioflow/domain/phase";
import { createStudioFlowService } from "@/apps/studioflow/service";
import { APP_REGISTRATIONS } from "../src/app/app-registrations";

/**
 * Seeds the disposable test database for the Playwright screen-size checks (DESIGN v2 §12): one owner with every
 * grant and one StudioFlow project and one BQ project, both with long names. It refuses any database that is not the disposable test
 * database (same guard as `npm test`). The generated test credentials go to `e2e/.tmp/owner.json`, which is
 * git-ignored; they are never real credentials.
 */
async function main() {
  process.env.DATABASE_URL = process.env.PLATFORM_TEST_DATABASE_URL;
  const testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  const db = testDb.prisma;
  try {
    await testDb.pool.query(`TRUNCATE TABLE ${["sf_project", "sf_client", "sf_phase_definition", "sf_phase_template", "sf_settings", "sf_checklist_template", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix"].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await testDb.pool.query('TRUNCATE TABLE "bq"."bq_project" RESTART IDENTITY CASCADE');
    await truncatePlatformTables(testDb);

    const registry = initializePermissionRegistry(APP_REGISTRATIONS);
    const email = "e2e-owner@example.test";
    const password = `E2e-${randomBytes(12).toString("hex")}!`;
    const owner = await bootstrapFirstOwner(
      { runTransaction: (work) => runSerializableTransaction(db, work), auditWriter: createAuditEventWriter(), now: () => new Date(), generateId: () => crypto.randomUUID() },
      { email, displayName: "Eka Tester", password, permissionIds: registry.permissions },
    );

    const template = await db.sfPhaseTemplate.create({ data: { name: "Standard", is_default: true, is_active: true } });
    const definitions = [
      { id: LEGACY.moodboard, name: "Moodboard", prefix: "MB", order_index: 1, allow_parallel: false, seat: "designer" },
      { id: LEGACY.layout, name: "Layout Plan", prefix: "L", order_index: 2, allow_parallel: true, seat: "designer" },
      { id: LEGACY.design3d, name: "Design 3D", prefix: "D", order_index: 3, allow_parallel: true, seat: "designer" },
      { id: LEGACY.cd, name: "Construction Drawing", prefix: "CD", order_index: 4, allow_parallel: true, seat: "drafter" },
      { id: LEGACY.supervision, name: "Supervision", prefix: "SV", order_index: 5, allow_parallel: false, seat: "designer" },
    ];
    for (const definition of definitions) await db.sfPhaseDefinition.create({ data: { ...definition, template_id: template.id } });

    const sf = createStudioFlowService(db, {
      runTransaction: (work) => db.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(),
      people: createPeopleDirectory(db),
      storage: new FakeObjectStorage(),
      notificationWriter: createNotificationWriter(),
      masterData: createMasterDataPublicRead(db),
      now: () => new Date(),
    });
    const actor = { kind: "USER" as const, userId: owner.userId, label: "Eka Tester" };
    const project = await sf.projects.createProject({
      grants: registry.permissions,
      actor,
      name: "2026-999 E2E Long Project Name For Phone Width Checks At The Breeze BSD Phase 2",
      newClientName: "E2E Client",
      picDesignerId: owner.userId,
      picDrafterId: owner.userId,
    });

    const bq = createBqService(db, { auditWriter: createAuditEventWriter(), runTransaction: (work) => db.$transaction((tx) => work(tx as unknown as PrismaClient)) });
    const bqProject = await bq.createProject({ grants: registry.permissions, actor, title: "E2E Long BQ Project Title For Phone Width Checks At The Breeze BSD Phase 2", clientName: "E2E Client" });

    mkdirSync("e2e/.tmp", { recursive: true });
    writeFileSync("e2e/.tmp/owner.json", JSON.stringify({ email, password, projectId: project.projectId, bqProjectId: bqProject.id }));
  } finally {
    await closeTestDb(testDb);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
