import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBqService, BQ_PERMISSIONS } from "./service";

const ACTOR = { kind: "USER" as const, userId: "bq-test-user", label: "BQ Test" };
const GRANTS = Object.values(BQ_PERMISSIONS);
let testDb: TestDb;
let service: ReturnType<typeof createBqService>;

async function resetBq() {
  await testDb.prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "bq"."bq_project",
      "bq"."bq_project_deletion_request",
      "bq"."bq_template",
      "bq"."bq_assembly_template",
      "bq"."bq_lib_material",
      "bq"."bq_lib_labor",
      "bq"."bq_lib_material_labor",
      "bq"."bq_lib_custom_item",
      "platform"."AuditEvent"
    RESTART IDENTITY CASCADE
  `);
}

before(async () => {
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  service = createBqService(testDb.prisma, {
    runTransaction: <T>(work: (tx: PrismaClient) => Promise<T>) => testDb.prisma.$transaction((tx) => work(tx as unknown as PrismaClient)),
    auditWriter: createAuditEventWriter(),
  });
});
beforeEach(resetBq);
after(async () => closeTestDb(testDb));

async function projectTree() {
  const project = await service.createProject({ grants: GRANTS, actor: ACTOR, title: "Office", clientName: "RAD" });
  const section = await service.addSection({ grants: GRANTS, actor: ACTOR, projectId: project.id, name: "Interior" });
  const item = await service.addItem({ grants: GRANTS, actor: ACTOR, sectionId: section.id, name: "Cabinet", qty: "1", unit: "PCS" });
  return { project, section, item };
}

describe("BQ R6.1 invariants", () => {
  it("enforces ACTIVE, LOCKED, and ARCHIVED transitions at the service layer", async () => {
    const { project } = await projectTree();
    await service.lockProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    await assert.rejects(() => service.updateProject({ grants: GRANTS, actor: ACTOR, id: project.id, title: "Blocked" }), (error: unknown) => error instanceof AppError && error.code === "bq.project.locked");
    await service.unlockProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    await service.archiveProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    await assert.rejects(() => service.addSection({ grants: GRANTS, actor: ACTOR, projectId: project.id, name: "Blocked" }), (error: unknown) => error instanceof AppError && error.code === "bq.project.archived");
    await service.restoreProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    assert.equal((await testDb.prisma.bqProject.findUniqueOrThrow({ where: { id: project.id } })).status, "ACTIVE");
  });

  it("keeps an immutable imported price baseline through override and revert", async () => {
    const { item } = await projectTree();
    const line = await service.addLineItem({ grants: GRANTS, actor: ACTOR, itemId: item.id, sourceType: "MASTERDATA", sourceRefId: "source-price", sourceImportedAt: new Date(), titleSnapshot: "HPL", purchaseUnitSnapshot: "SHEET", hargaSnapshot: "100", currencySnapshot: "IDR", kategori: "MATERIAL", qty: "1" });
    await service.updateLineItem({ grants: GRANTS, actor: ACTOR, id: line.id, hargaSnapshot: "125" });
    let stored = await testDb.prisma.bqLineItem.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(stored.source_price_snapshot?.toString(), "100");
    assert.equal(stored.harga_snapshot.toString(), "125");
    await service.revertLineItemPrice({ grants: GRANTS, actor: ACTOR, id: line.id });
    await service.revertLineItemPrice({ grants: GRANTS, actor: ACTOR, id: line.id });
    stored = await testDb.prisma.bqLineItem.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(stored.source_price_snapshot?.toString(), "100");
    assert.equal(stored.harga_snapshot.toString(), "100");
    const actions = await testDb.prisma.auditEvent.findMany({ where: { entity_id: line.id }, orderBy: { occurred_at: "asc" }, select: { action: true } });
    assert.deepEqual(actions.map((event) => event.action), ["bq.line-item.created", "bq.line-item.price-overridden", "bq.line-item.price-reverted"]);
  });

  it("supports direct and grouped Cost Components and rejects dual parents", async () => {
    const { item } = await projectTree();
    const group = await service.addSubObject({ grants: GRANTS, actor: ACTOR, itemId: item.id, name: "Body", qtyPerL1: "1" });
    await service.addLineItem({ grants: GRANTS, actor: ACTOR, itemId: item.id, sourceType: "CUSTOM", titleSnapshot: "Direct", purchaseUnitSnapshot: "PCS", hargaSnapshot: "10", kategori: "ALAT", qty: "1" });
    await service.addLineItem({ grants: GRANTS, actor: ACTOR, subObjectId: group.id, sourceType: "CUSTOM", titleSnapshot: "Grouped", purchaseUnitSnapshot: "PCS", hargaSnapshot: "20", kategori: "ALAT", qty: "1" });
    await assert.rejects(() => service.addLineItem({ grants: GRANTS, actor: ACTOR, itemId: item.id, subObjectId: group.id, sourceType: "CUSTOM", titleSnapshot: "Invalid", purchaseUnitSnapshot: "PCS", hargaSnapshot: "0", kategori: "ALAT", qty: "1" }), (error: unknown) => error instanceof AppError && error.code === "bq.line-item.dual-parent");
  });

  it("derives Library category and defaults coefficient to one", async () => {
    const material = await service.createLibMaterial({ grants: GRANTS, actor: ACTOR, name: "Board", purchaseUnit: "SHEET", harga: "100", currency: "IDR" });
    const labor = await service.createLibLabor({ grants: GRANTS, actor: ACTOR, name: "Install", purchaseUnit: "M2", harga: "50", currency: "IDR" });
    assert.equal(material.kategori, "MATERIAL"); assert.equal(material.default_koefisien.toString(), "1");
    assert.equal(labor.kategori, "UPAH"); assert.equal(labor.default_koefisien.toString(), "1");
    await assert.rejects(
      () => service.updateLibMaterial({ grants: GRANTS, actor: ACTOR, id: material.id, defaultKoefisien: "0" }),
      (error: unknown) => error instanceof AppError && error.code === "bq.koefisien.not-positive",
    );
  });

  it("keeps live Library recommendations on both Template Section levels", async () => {
    const libraryItem = await service.createLibMaterial({
      grants: GRANTS,
      actor: ACTOR,
      name: "Recommended board",
      purchaseUnit: "SHEET",
      harga: "100",
      currency: "IDR",
    });
    const template = await service.createTemplate({ grants: GRANTS, actor: ACTOR, name: "Fixture" });
    const section = await service.addTemplateSection({
      grants: GRANTS,
      actor: ACTOR,
      templateId: template.id,
      name: "Interior",
    });
    const subsection = await service.addTemplateSection({
      grants: GRANTS,
      actor: ACTOR,
      templateId: template.id,
      parentId: section.id,
      name: "Cabinetry",
    });
    await service.addTemplateRecommendation({ grants: GRANTS, actor: ACTOR, templateSectionId: section.id, libItemType: "material", libItemId: libraryItem.id });
    await service.addTemplateRecommendation({ grants: GRANTS, actor: ACTOR, templateSectionId: subsection.id, libItemType: "material", libItemId: libraryItem.id });

    const stored = await service.getTemplateWithSections(template.id);
    assert.equal(stored?.sections.find((row) => row.id === section.id)?.recommendations.length, 1);
    assert.equal(stored?.sections.find((row) => row.id === subsection.id)?.recommendations.length, 1);
  });

  it("does not write or audit semantically identical project-tree updates", async () => {
    const { project, section, item } = await projectTree();
    const group = await service.addSubObject({ grants: GRANTS, actor: ACTOR, itemId: item.id, name: "Body", qtyPerL1: "1" });
    const line = await service.addLineItem({
      grants: GRANTS,
      actor: ACTOR,
      itemId: item.id,
      sourceType: "CUSTOM",
      titleSnapshot: "Direct",
      purchaseUnitSnapshot: "PCS",
      hargaSnapshot: "10",
      kategori: "ALAT",
      qty: "1",
    });
    const old = new Date("2000-01-01T00:00:00.000Z");
    await testDb.prisma.bqProject.update({ where: { id: project.id }, data: { updated_at: old } });
    await testDb.prisma.bqItem.update({ where: { id: item.id }, data: { updated_at: old } });
    await testDb.prisma.bqSubObject.update({ where: { id: group.id }, data: { updated_at: old } });
    await testDb.prisma.bqLineItem.update({ where: { id: line.id }, data: { updated_at: old } });
    const auditCount = await testDb.prisma.auditEvent.count();

    await service.updateProject({ grants: GRANTS, actor: ACTOR, id: project.id, title: "Office", clientName: "RAD", externalRef: null, notes: null });
    await service.updateSection({ grants: GRANTS, actor: ACTOR, id: section.id, name: "Interior" });
    await service.updateItem({ grants: GRANTS, actor: ACTOR, id: item.id, name: "Cabinet", qty: "1.000", unit: "PCS", koefisien: "1.0", markupL1Pct: "0.00", notes: null });
    await service.updateSubObject({ grants: GRANTS, actor: ACTOR, id: group.id, name: "Body", qtyPerL1: "1.00", markupL2Pct: "0.0", notes: null });
    await service.updateLineItem({ grants: GRANTS, actor: ACTOR, id: line.id, titleSnapshot: "Direct", purchaseUnitSnapshot: "PCS", hargaSnapshot: "10.000", qty: "1.00", koefisien: "1.0", notes: null });

    assert.equal(await testDb.prisma.auditEvent.count(), auditCount);
    assert.equal((await testDb.prisma.bqProject.findUniqueOrThrow({ where: { id: project.id } })).updated_at.toISOString(), old.toISOString());
    assert.equal((await testDb.prisma.bqItem.findUniqueOrThrow({ where: { id: item.id } })).updated_at.toISOString(), old.toISOString());
    assert.equal((await testDb.prisma.bqSubObject.findUniqueOrThrow({ where: { id: group.id } })).updated_at.toISOString(), old.toISOString());
    assert.equal((await testDb.prisma.bqLineItem.findUniqueOrThrow({ where: { id: line.id } })).updated_at.toISOString(), old.toISOString());
  });

  it("clears optional Library fields and returns fresh assembly updates without false audits", async () => {
    const material = await service.createLibMaterial({
      grants: GRANTS,
      actor: ACTOR,
      name: "Board",
      purchaseUnit: "SHEET",
      baseUnit: "M2",
      harga: "100",
      currency: "IDR",
      notes: "Temporary",
    });
    const old = new Date("2000-01-01T00:00:00.000Z");
    await testDb.prisma.bqLibMaterial.update({ where: { id: material.id }, data: { updated_at: old } });
    const auditCount = await testDb.prisma.auditEvent.count();
    await service.updateLibMaterial({
      grants: GRANTS,
      actor: ACTOR,
      id: material.id,
      name: "Board",
      purchaseUnit: "SHEET",
      baseUnit: "M2",
      harga: "100.000",
      currency: "IDR",
      defaultKoefisien: "1.0",
      notes: "Temporary",
    });
    assert.equal(await testDb.prisma.auditEvent.count(), auditCount);
    assert.equal((await testDb.prisma.bqLibMaterial.findUniqueOrThrow({ where: { id: material.id } })).updated_at.toISOString(), old.toISOString());

    const cleared = await service.updateLibMaterial({ grants: GRANTS, actor: ACTOR, id: material.id, baseUnit: null, notes: null });
    assert.equal(cleared.base_unit, null);
    assert.equal(cleared.notes, null);

    const template = await service.createTemplate({ grants: GRANTS, actor: ACTOR, name: "Template", description: "Temporary" });
    assert.equal((await service.updateTemplate({ grants: GRANTS, actor: ACTOR, id: template.id, description: null })).description, null);

    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Assembly", description: "Temporary" });
    const updatedAssembly = await service.updateAssemblyTemplate({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, name: "Assembly revised", description: null });
    assert.equal(updatedAssembly.name, "Assembly revised");
    assert.equal(updatedAssembly.description, null);
    const assemblyAuditCount = await testDb.prisma.auditEvent.count({ where: { entity_id: assembly.id } });
    await service.updateAssemblyTemplate({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, name: "Assembly revised", description: null });
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: assembly.id } }), assemblyAuditCount);
  });

  it("permanently deletes only an archived project through an approved request", async () => {
    const { project } = await projectTree();
    await service.archiveProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    const request = await service.requestProjectDeletion({
      grants: GRANTS,
      actor: ACTOR,
      id: project.id,
      reason: "Superseded estimate",
    });
    assert.equal((await service.listProjectDeletionRequests({ grants: GRANTS })).length, 1);
    await assert.rejects(
      () => service.approveProjectDeletion({ grants: [BQ_PERMISSIONS.projectManage], actor: ACTOR, requestId: request.id }),
      (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN",
    );
    await service.restoreProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    await assert.rejects(
      () => service.approveProjectDeletion({ grants: GRANTS, actor: ACTOR, requestId: request.id }),
      (error: unknown) => error instanceof AppError && error.code === "bq.project.not-archived",
    );
    assert.equal(
      (await testDb.prisma.bqProjectDeletionRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
      "PENDING",
    );
    await service.archiveProject({ grants: GRANTS, actor: ACTOR, id: project.id });
    await service.approveProjectDeletion({ grants: GRANTS, actor: ACTOR, requestId: request.id });
    assert.equal(await testDb.prisma.bqProject.findUnique({ where: { id: project.id } }), null);
    assert.equal(
      (await testDb.prisma.bqProjectDeletionRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
      "APPROVED",
    );
    assert.equal(
      await testDb.prisma.auditEvent.count({ where: { action: "bq.project.deleted", entity_id: project.id } }),
      1,
    );
  });
});
