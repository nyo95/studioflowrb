import assert from "node:assert/strict";
import { after, before, beforeEach, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { FakeObjectStorage } from "@platform/core/storage";
import { createDocumentIdentityService } from "./document-identity";
import { readStudioFlowDocumentIdentity } from "./public/document-identity";
import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import type { StudioFlowPorts } from "./shared";

let testDb: TestDb;
let service: ReturnType<typeof createDocumentIdentityService>;
const actor = { kind: "USER" as const, userId: "identity-user", label: "Identity user" };
const grants = [P.settingsManage];

before(async () => {
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  const ports: StudioFlowPorts = { runTransaction: (work) => testDb.prisma.$transaction(work), auditWriter: createAuditEventWriter(), people: {} as StudioFlowPorts["people"], storage: new FakeObjectStorage(), masterData: createMasterDataPublicRead(testDb.prisma) };
  service = createDocumentIdentityService(testDb.prisma, ports);
});
beforeEach(async () => { await testDb.prisma.sfSettings.deleteMany(); await testDb.prisma.auditEvent.deleteMany({ where: { action: "studioflow.document-identity.updated" } }); });
after(async () => closeTestDb(testDb));

it("reads null identity without a settings row and writes only the letterhead fields", async () => {
  assert.deepEqual(await service.getDocumentIdentity(), { companyName: null, logoKey: null, companyAddress: null, companyEmail: null });
  await testDb.prisma.sfSettings.create({ data: { id: "studio", archive_retention_days: 77, cd_mall_days: 8, cd_final_days: 9, fit_out_gap_days: 10, fit_out_to_handover_days: 11, handover_to_opening_days: 12 } });
  assert.deepEqual(await service.updateDocumentIdentity({ grants, actor, companyName: "  Consultant  ", companyAddress: " Jalan One ", companyEmail: " hello@example.test ", logo: { kind: "set", key: "studioflow/document-letterhead/one.png" } }), { replacedLogoKey: null });
  assert.deepEqual(await readStudioFlowDocumentIdentity(testDb.prisma), { companyName: "Consultant", logoKey: "studioflow/document-letterhead/one.png", companyAddress: "Jalan One", companyEmail: "hello@example.test" });
  const row = await testDb.prisma.sfSettings.findUniqueOrThrow({ where: { id: "studio" } });
  assert.deepEqual([row.archive_retention_days, row.cd_mall_days, row.cd_final_days, row.fit_out_gap_days, row.fit_out_to_handover_days, row.handover_to_opening_days], [77, 8, 9, 10, 11, 12]);
  assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.document-identity.updated" } }), 1);
});

it("returns replaced logo keys and queues replacements for cleanup", async () => {
  await service.updateDocumentIdentity({ grants, actor, companyName: null, companyAddress: null, companyEmail: null, logo: { kind: "set", key: "studioflow/document-letterhead/one.png" } });
  assert.deepEqual(await service.updateDocumentIdentity({ grants, actor, companyName: null, companyAddress: null, companyEmail: null, logo: { kind: "set", key: "studioflow/document-letterhead/two.png" } }), { replacedLogoKey: "studioflow/document-letterhead/one.png" });
  assert.equal((await testDb.prisma.sfAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: "studioflow/document-letterhead/one.png" } })).attempts, 0);
  assert.deepEqual(await service.updateDocumentIdentity({ grants, actor, companyName: null, companyAddress: null, companyEmail: null, logo: { kind: "remove" } }), { replacedLogoKey: "studioflow/document-letterhead/two.png" });
});

it("refuses unauthorised and invalid changes", async () => {
  const input = { actor, companyName: null, companyAddress: null, companyEmail: null, logo: { kind: "keep" as const } };
  await assert.rejects(service.updateDocumentIdentity({ ...input, grants: [] }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
  await assert.rejects(service.updateDocumentIdentity({ ...input, grants, companyName: "x".repeat(121) }), (error: unknown) => error instanceof AppError && error.code === "studioflow.document-identity.company-too-long");
  await assert.rejects(service.updateDocumentIdentity({ ...input, grants, companyEmail: "bad email" }), (error: unknown) => error instanceof AppError && error.code === "studioflow.document-identity.email-invalid");
  await assert.rejects(service.updateDocumentIdentity({ ...input, grants, companyAddress: "x".repeat(2001) }), (error: unknown) => error instanceof AppError && error.code === "studioflow.document-identity.text-too-long");
});
