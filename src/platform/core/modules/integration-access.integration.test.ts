import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import { isAppError } from "@platform/core/errors";

import { changeIntegrationAccess, listIntegrationAccess } from "./integration-access";
import { initializeModuleRegistry, resetModuleRegistryForTests, type ModuleManifest } from "./manifest";

const MANIFESTS: readonly ModuleManifest[] = [
  { id: "masterdata", name: "Master Data", version: "1.0.0", kind: "core", requires: [] },
  { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", requires: ["masterdata"] },
  { id: "assistant", name: "Assistant", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"], developerAccess: true },
  { id: "ideas", name: "Ideas Board", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
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

function change(moduleId: string, userId: string, allowed: boolean) {
  return changeIntegrationAccess({ moduleId, userId, allowed, runTransaction: (work) => runSerializableTransaction(db.prisma, work), auditWriter: createAuditEventWriter() });
}

async function user(status: "ACTIVE" | "DISABLED" = "ACTIVE") {
  const id = randomUUID();
  await db.prisma.user.create({ data: { id, email: `${id}@test.local`, display_name: `User ${id.slice(0, 4)}`, password_hash: "x", status } });
  return id;
}

describe("Developer integration access list", () => {
  it("allows and removes a user, audits only real changes, and lists active users", async () => {
    await truncatePlatformTables(db);
    const alice = await user();
    assert.deepEqual(await change("assistant", alice, true), { changed: true });
    assert.deepEqual(await change("assistant", alice, true), { changed: false });
    const listed = await listIntegrationAccess(db.prisma);
    assert.deepEqual(listed.modules.map((module) => [module.moduleId, module.allowed.map((entry) => entry.userId)]), [["assistant", [alice]]]);
    assert.equal(listed.users.length, 1);
    assert.deepEqual(await change("assistant", alice, false), { changed: true });
    assert.deepEqual(await change("assistant", alice, false), { changed: false });
    const actions = (await db.prisma.auditEvent.findMany({ where: { entity_type: "integration_access" }, orderBy: { occurred_at: "asc" } })).map((event) => event.action);
    assert.deepEqual(actions, ["platform.integration-access.granted", "platform.integration-access.revoked"]);
  });

  it("refuses a module without a list, an unknown user and a disabled user", async () => {
    await truncatePlatformTables(db);
    const alice = await user();
    const gone = await user("DISABLED");
    await assert.rejects(change("ideas", alice, true), (error: unknown) => isAppError(error) && error.code === "INTEGRATION_ACCESS_MODULE_UNKNOWN");
    await assert.rejects(change("assistant", randomUUID(), true), (error: unknown) => isAppError(error) && error.code === "INTEGRATION_ACCESS_USER_UNKNOWN");
    await assert.rejects(change("assistant", gone, true), (error: unknown) => isAppError(error) && error.code === "INTEGRATION_ACCESS_USER_INACTIVE");
  });
});
