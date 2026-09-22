import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import type { PrismaClient } from "@/generated/prisma/client";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
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

  it("carries a non-CUSTOM assembly line's source price forward as the applied item's revert baseline", async () => {
    const { item } = await projectTree();
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Cabinet kit" });
    // The only public write path (addAssemblyCustomLine) always sets source_type CUSTOM;
    // insert a Master-Data-sourced line directly to exercise the schema's full source_type
    // range, since BqAssemblyLine.source_type is not restricted to CUSTOM at the DB level.
    await testDb.prisma.bqAssemblyLine.create({
      data: { assembly_template_id: assembly.id, source_type: "MASTERDATA", source_ref_id: "md-price-9", title_snapshot: "Hinge", purchase_unit_snapshot: "PCS", harga_snapshot: "15000", currency_snapshot: "IDR", kategori: "MATERIAL", qty: "4", koefisien: "1", sort_order: 0 },
    });

    const subObject = await service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: item.id, assemblyId: assembly.id });
    const created = await testDb.prisma.bqLineItem.findFirstOrThrow({ where: { sub_object_id: subObject.id } });
    assert.equal(created.source_price_snapshot?.toString(), "15000", "assembly-applied non-CUSTOM line must carry its source price forward, matching the direct addLineItem path");

    await service.updateLineItem({ grants: GRANTS, actor: ACTOR, id: created.id, hargaSnapshot: "18000" });
    await service.revertLineItemPrice({ grants: GRANTS, actor: ACTOR, id: created.id });
    const reverted = await testDb.prisma.bqLineItem.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(reverted.harga_snapshot.toString(), "15000", "Revert must be available for assembly-applied non-CUSTOM lines, not just directly-added ones");
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

  it("keeps the Library promotion state machine behind BQ request and Master Data approval grants", async () => {
    const material = await service.createLibMaterial({
      grants: GRANTS,
      actor: ACTOR,
      name: "Promotable board",
      purchaseUnit: "SHEET",
      harga: "100",
      currency: "IDR",
    });
    const masterDataGrants = [MASTERDATA_PERMISSIONS.promotionApprove];

    await service.requestPromotion({
      grants: GRANTS,
      actor: ACTOR,
      type: "material",
      libItemId: material.id,
    });

    const requested = await service.listPromotionRequests({ grants: masterDataGrants });
    assert.deepEqual(requested.map((request) => request.id), [material.id]);

    await assert.rejects(
      () => service.requestPromotion({ grants: GRANTS, actor: ACTOR, type: "material", libItemId: material.id }),
      (error: unknown) => error instanceof AppError && error.code === "bq.promotion.invalid-status",
    );
    await assert.rejects(
      () => service.approvePromotion({ grants: masterDataGrants, actor: ACTOR, type: "material", libItemId: material.id, masterdataRefId: " " }),
      (error: unknown) => error instanceof AppError && error.code === "bq.promotion.masterdata-ref-required",
    );

    await service.approvePromotion({
      grants: masterDataGrants,
      actor: ACTOR,
      type: "material",
      libItemId: material.id,
      masterdataRefId: "masterdata-price-1",
    });

    const approved = await testDb.prisma.bqLibMaterial.findUniqueOrThrow({ where: { id: material.id } });
    assert.equal(approved.promotion_status, "APPROVED");
    assert.equal(approved.masterdata_ref_id, "masterdata-price-1");
    await assert.rejects(
      () => service.requestPromotion({ grants: GRANTS, actor: ACTOR, type: "material", libItemId: material.id }),
      (error: unknown) => error instanceof AppError && error.code === "bq.promotion.invalid-status",
    );
    assert.deepEqual(
      (await testDb.prisma.auditEvent.findMany({ where: { entity_id: material.id }, orderBy: { occurred_at: "asc" }, select: { action: true } }))
        .map((event) => event.action),
      ["bq.lib-material.created", "bq.promotion.requested", "bq.promotion.approved"],
    );
  });

  it("guards concurrent promotion approvals against a lost-update race", async () => {
    const material = await service.createLibMaterial({ grants: GRANTS, actor: ACTOR, name: "Racy board", purchaseUnit: "SHEET", harga: "100", currency: "IDR" });
    const masterDataGrants = [MASTERDATA_PERMISSIONS.promotionApprove];
    await service.requestPromotion({ grants: GRANTS, actor: ACTOR, type: "material", libItemId: material.id });

    const results = await Promise.allSettled([
      service.approvePromotion({ grants: masterDataGrants, actor: ACTOR, type: "material", libItemId: material.id, masterdataRefId: "ref-a" }),
      service.approvePromotion({ grants: masterDataGrants, actor: ACTOR, type: "material", libItemId: material.id, masterdataRefId: "ref-b" }),
    ]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "exactly one concurrent approval wins the race");
    const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(loser.reason instanceof AppError && loser.reason.code === "bq.promotion.invalid-status", "the losing approval must surface a conflict, not silently overwrite the winner");

    const final = await testDb.prisma.bqLibMaterial.findUniqueOrThrow({ where: { id: material.id } });
    assert.equal(final.promotion_status, "APPROVED");
    assert.ok(final.masterdata_ref_id === "ref-a" || final.masterdata_ref_id === "ref-b", "the winner's ref is preserved, not blended or cleared");
    assert.equal(
      (await testDb.prisma.auditEvent.count({ where: { entity_id: material.id, action: "bq.promotion.approved" } })),
      1,
      "only the winning transition is audited",
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
