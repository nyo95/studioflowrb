import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import type { PrismaClient } from "@/generated/prisma/client";
import { MASTERDATA_PERMISSIONS, type MaterialPriceOption, type PriceWorkRead } from "@/apps/masterdata/public";

import { createBqService, BQ_PERMISSIONS } from "./service";
import type { BqMasterDataRead } from "./services/cost-sources";

/**
 * WO-BQ-ASSEMBLY-SOURCE-01: Assembly lines sourced from Master Data prices and BQ Library items, price at use when an
 * Assembly is applied, and the explicit "Save to BQ Library" on Custom rows. Master Data is a fake of its public read
 * (BQ only ever sees that contract); BQ data is real in the disposable test database.
 */

const ACTOR = { kind: "USER" as const, userId: "bq-assembly-user", label: "Estimator" };
const BQ_ALL = Object.values(BQ_PERMISSIONS);
const GRANTS = [...BQ_ALL, MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceWorkRead];
let testDb: TestDb;
let service: ReturnType<typeof createBqService>;

const materials = new Map<string, MaterialPriceOption>();
const workPrices = new Map<string, PriceWorkRead>();
let failReads = false;

const fakeMasterData: BqMasterDataRead = {
  async getMaterialPriceOption(id) {
    if (failReads) throw new Error("Master Data is down");
    return materials.get(id) ?? null;
  },
  async listWorkPricesRead(filter) {
    if (failReads) throw new Error("Master Data is down");
    return [...workPrices.values()].filter((price) => !filter?.kind || price.kind === filter.kind);
  },
};

function material(id: string, name: string, amount: string, unit = "sak", currency = "IDR") {
  materials.set(id, { id, skuId: `sku-${id}`, skuName: name, skuCode: null, supplierVendor: { id: "v", name: "Vendor", slug: "vendor" }, amount, amountLabel: null, currency, unit: { id: `u-${unit}`, code: unit, name: unit }, measurement: { dimensionLength: null, dimensionWidth: null, dimensionThickness: null, dimensionUnit: null } } as MaterialPriceOption);
}

function work(id: string, name: string, kind: "labor" | "material-labor", amount: string, unit = "m2") {
  workPrices.set(id, { id, name, slug: id, kind, category: { id: "c", name: "Work", slug: "work" }, vendor: { id: "v", name: "Vendor", slug: "vendor" }, unit: { id: `u-${unit}`, code: unit, name: unit }, amount, amountLabel: null, currency: "IDR", scopeNote: null, spec: null, dimDisplay: null, notes: null });
}

async function workItem() {
  const project = await service.createProject({ grants: GRANTS, actor: ACTOR, title: "Sociolla", clientName: "RAD" });
  const section = await service.addSection({ grants: GRANTS, actor: ACTOR, projectId: project.id, name: "Interior" });
  return service.addItem({ grants: GRANTS, actor: ACTOR, sectionId: section.id, name: "Gondola", qty: "1", unit: "unit" });
}

function rejectsCode(promise: Promise<unknown>, code: string) {
  return assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code);
}

before(async () => {
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  service = createBqService(testDb.prisma, {
    runTransaction: <T>(work: (tx: PrismaClient) => Promise<T>) => testDb.prisma.$transaction((tx) => work(tx as unknown as PrismaClient)),
    auditWriter: createAuditEventWriter(),
    masterData: fakeMasterData,
  });
});
beforeEach(async () => {
  await testDb.prisma.$executeRawUnsafe(`TRUNCATE TABLE "bq"."bq_project", "bq"."bq_assembly_template", "bq"."bq_lib_material", "bq"."bq_lib_labor", "bq"."bq_lib_material_labor", "bq"."bq_lib_custom_item", "platform"."AuditEvent" RESTART IDENTITY CASCADE`);
  materials.clear();
  workPrices.clear();
  failReads = false;
});
after(async () => closeTestDb(testDb));

describe("sourced Assembly lines", () => {
  it("snapshots a Master Data material, labor and material+labor price and a BQ Library item", async () => {
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Gondola Sociolla" });
    material("md-semen", "Semen 50 kg", "65000");
    work("md-tukang", "Tukang keramik", "labor", "120000");
    work("md-pasang", "Pasang gypsum", "material-labor", "95000");
    const library = await service.createLibMaterial({ grants: GRANTS, actor: ACTOR, name: "Gypsum 9mm", purchaseUnit: "lbr", harga: "80000", currency: "IDR", defaultKoefisien: "1.05" });

    await service.addAssemblySourcedLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId: "md-semen", sourceKind: "material" });
    await service.addAssemblySourcedLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId: "md-tukang" });
    await service.addAssemblySourcedLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId: "md-pasang", sourceKind: "material-labor", qty: "2" });
    await service.addAssemblySourcedLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, sourceType: "BQ_LIBRARY", sourceRefId: library.id });

    const lines = await testDb.prisma.bqAssemblyLine.findMany({ where: { assembly_template_id: assembly.id }, orderBy: { sort_order: "asc" } });
    assert.deepEqual(lines.map((line) => [line.source_type, line.source_ref_id, line.title_snapshot, line.purchase_unit_snapshot, line.harga_snapshot.toString(), line.kategori, line.qty.toString(), line.koefisien.toString()]), [
      ["MASTERDATA", "md-semen", "Semen 50 kg", "sak", "65000", "MATERIAL", "1", "1"],
      ["MASTERDATA", "md-tukang", "Tukang keramik", "m2", "120000", "UPAH", "1", "1"],
      ["MASTERDATA", "md-pasang", "Pasang gypsum", "m2", "95000", "MATERIAL_UPAH", "2", "1"],
      ["BQ_LIBRARY", library.id, "Gypsum 9mm", "lbr", "80000", "MATERIAL", "1", "1.05"],
    ]);
    // Two suppliers can price the same SKU, so the line says whose price it took.
    assert.deepEqual(lines.map((line) => line.notes), ["Supplier: Vendor", "Vendor: Vendor", "Vendor: Vendor", null]);
  });

  it("refuses a sourced line without Library rights, without Master Data rights, for a missing source or a foreign currency", async () => {
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Refusals" });
    material("md-semen", "Semen", "65000");
    material("md-usd", "Imported tile", "12", "box", "USD");
    const add = (grants: readonly string[], sourceRefId: string) => service.addAssemblySourcedLine({ grants, actor: ACTOR, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId });
    await assert.rejects(add([BQ_PERMISSIONS.access, BQ_PERMISSIONS.libraryRead, MASTERDATA_PERMISSIONS.priceMaterialRead], "md-semen"), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    await rejectsCode(add(BQ_ALL, "md-semen"), "bq.source.no-permission");
    await rejectsCode(add(GRANTS, "md-gone"), "bq.source.not-found");
    await rejectsCode(add(GRANTS, "md-usd"), "bq.source.currency");
    assert.equal(await testDb.prisma.bqAssemblyLine.count(), 0);
  });
});

describe("price at use", () => {
  async function pricedAssembly() {
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Flat ceiling" });
    material("md-semen", "Semen 50 kg", "65000");
    const line = await service.addAssemblySourcedLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId: "md-semen" });
    await service.updateAssemblyLine({ grants: GRANTS, actor: ACTOR, lineId: line.id, title: "Semen (estimator)", qty: "3" });
    await service.addAssemblyCustomLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, title: "Ongkos angkut", harga: "50000", kategori: "TRANSPORTASI_AKOMODASI" });
    material("md-semen", "Semen 50 kg", "70000");
    return assembly;
  }

  it("gives the project today's price in both placements and through add-and-apply, leaving the Assembly as saved", async () => {
    const assembly = await pricedAssembly();
    const item = await workItem();
    const group = await service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: item.id, assemblyId: assembly.id });
    assert.deepEqual(group.priceRefresh, { refreshed: 1, kept: [] });
    const direct = await service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: item.id, assemblyId: assembly.id, placement: "direct" });
    assert.deepEqual(direct.priceRefresh, { refreshed: 1, kept: [] });
    const section = await testDb.prisma.bqSection.findFirstOrThrow();
    const added = await service.addItemAndApplyAssembly({ grants: GRANTS, actor: ACTOR, sectionId: section.id, assemblyId: assembly.id });
    assert.deepEqual(added.priceRefresh, { refreshed: 1, kept: [] });

    const semen = await testDb.prisma.bqLineItem.findMany({ where: { source_ref_id: "md-semen" } });
    assert.equal(semen.length, 3);
    for (const line of semen) {
      assert.deepEqual([line.title_snapshot, line.qty.toString(), line.harga_snapshot.toString(), line.source_price_snapshot?.toString()], ["Semen (estimator)", "3", "70000", "70000"]);
    }
    const custom = await testDb.prisma.bqLineItem.findMany({ where: { source_type: "CUSTOM" } });
    assert.deepEqual(custom.map((line) => [line.harga_snapshot.toString(), line.source_price_snapshot]), [["50000", null], ["50000", null], ["50000", null]]);
    assert.equal((await testDb.prisma.bqAssemblyLine.findFirstOrThrow({ where: { source_ref_id: "md-semen" } })).harga_snapshot.toString(), "65000");

    await service.updateLineItem({ grants: GRANTS, actor: ACTOR, id: semen[0]!.id, hargaSnapshot: "72000" });
    await service.revertLineItemPrice({ grants: GRANTS, actor: ACTOR, id: semen[0]!.id });
    assert.equal((await testDb.prisma.bqLineItem.findUniqueOrThrow({ where: { id: semen[0]!.id } })).harga_snapshot.toString(), "70000");
  });

  it("keeps the stored price, and says why, when the source is gone, unreadable, re-unitised or not in Rupiah", async () => {
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Fallbacks" });
    material("md-gone", "Old tile", "100");
    material("md-unit", "Gypsum", "200", "lbr");
    material("md-usd", "Tile", "300");
    work("md-labor", "Tukang", "labor", "400");
    for (const id of ["md-gone", "md-unit", "md-usd", "md-labor"]) await service.addAssemblySourcedLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId: id });
    materials.delete("md-gone");
    material("md-unit", "Gypsum", "250", "m2");
    material("md-usd", "Tile", "5", "sak", "USD");
    const item = await workItem();
    const applied = await service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: item.id, assemblyId: assembly.id, placement: "direct" });
    assert.deepEqual(applied.priceRefresh, { refreshed: 1, kept: [
      { title: "Old tile", reason: "source-missing" },
      { title: "Gypsum", reason: "unit-changed" },
      { title: "Tile", reason: "currency" },
    ] });
    const prices = (await testDb.prisma.bqLineItem.findMany({ where: { item_id: item.id }, orderBy: { sort_order: "asc" } })).map((line) => line.harga_snapshot.toString());
    assert.deepEqual(prices, ["100", "200", "300", "400"]);
    // Material prices readable, work prices not: the labor line keeps its price, and so does a line missing from the
    // readable part, because it may sit in the part this caller cannot see.
    const materialOnly = [...BQ_ALL, MASTERDATA_PERMISSIONS.priceMaterialRead];
    const second = await service.applyAssemblyTemplate({ grants: materialOnly, actor: ACTOR, itemId: item.id, assemblyId: assembly.id });
    assert.deepEqual(second.priceRefresh.kept.map((line) => [line.title, line.reason]), [["Old tile", "no-permission"], ["Gypsum", "unit-changed"], ["Tile", "currency"], ["Tukang", "no-permission"]]);
  });

  it("refreshes a Master Data line that came from Save as Assembly", async () => {
    material("md-semen", "Semen", "65000");
    const item = await workItem();
    await service.addLineItem({ grants: GRANTS, actor: ACTOR, itemId: item.id, sourceType: "MASTERDATA", sourceRefId: "md-semen", titleSnapshot: "Semen", purchaseUnitSnapshot: "sak", hargaSnapshot: "65000", kategori: "MATERIAL", qty: "2" });
    const assembly = await service.saveItemAsAssembly({ grants: GRANTS, actor: ACTOR, itemId: item.id, name: "Saved" });
    material("md-semen", "Semen", "68000");
    const target = await workItem().catch(async () => item);
    const applied = await service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: target.id, assemblyId: assembly.id, placement: "direct" });
    assert.deepEqual(applied.priceRefresh, { refreshed: 1, kept: [] });
    const lines = await testDb.prisma.bqLineItem.findMany({ where: { item_id: target.id }, orderBy: { sort_order: "asc" } });
    assert.equal(lines.at(-1)!.harga_snapshot.toString(), "68000");
  });

  it("writes nothing when reading a source fails unexpectedly", async () => {
    const assembly = await pricedAssembly();
    const item = await workItem();
    failReads = true;
    await assert.rejects(service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: item.id, assemblyId: assembly.id }), /Master Data is down/);
    assert.equal(await testDb.prisma.bqSubObject.count(), 0);
    assert.equal(await testDb.prisma.bqLineItem.count(), 0);
  });
});

describe("Save to BQ Library", () => {
  it("turns a Custom Assembly line into a Library item of the type its category maps to, which then prices the Assembly", async () => {
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Gondola" });
    const cases = [
      ["MATERIAL", "bqLibMaterial"],
      ["UPAH", "bqLibLabor"],
      ["MATERIAL_UPAH", "bqLibMaterialLabor"],
      ["ALAT", "bqLibCustomItem"],
    ] as const;
    for (const [kategori, table] of cases) {
      const line = await service.addAssemblyCustomLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, title: `Gypsum ${kategori}`, purchaseUnit: "lbr", harga: "80000", kategori, koefisien: "1.1", notes: "9 mm", saveToLibrary: true });
      assert.equal(line.source_type, "BQ_LIBRARY");
      const delegate = testDb.prisma[table] as unknown as { findUniqueOrThrow(args: { where: { id: string } }): Promise<{ name: string; purchase_unit: string; harga: { toString(): string }; default_koefisien: { toString(): string }; kategori: string; notes: string | null; promotion_status?: string }> };
      const item = await delegate.findUniqueOrThrow({ where: { id: line.source_ref_id! } });
      assert.deepEqual([item.name, item.purchase_unit, item.harga.toString(), item.default_koefisien.toString(), item.kategori, item.notes], [`Gypsum ${kategori}`, "lbr", "80000", "1.1", kategori, "9 mm"]);
      if (table !== "bqLibCustomItem") assert.equal(item.promotion_status, "DRAFT");
    }
    const unticked = await service.addAssemblyCustomLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, title: "One-off", harga: "1" });
    assert.equal(unticked.source_type, "CUSTOM");

    const materialLine = await testDb.prisma.bqAssemblyLine.findFirstOrThrow({ where: { title_snapshot: "Gypsum MATERIAL" } });
    await service.updateLibMaterial({ grants: GRANTS, actor: ACTOR, id: materialLine.source_ref_id!, harga: "85000" });
    const item = await workItem();
    const applied = await service.applyAssemblyTemplate({ grants: GRANTS, actor: ACTOR, itemId: item.id, assemblyId: assembly.id, placement: "direct" });
    assert.equal(applied.priceRefresh.refreshed, 4);
    assert.equal((await testDb.prisma.bqLineItem.findFirstOrThrow({ where: { title_snapshot: "Gypsum MATERIAL" } })).harga_snapshot.toString(), "85000");
  });

  it("converts an existing Custom Assembly line or project Cost Component, and refuses without Library rights", async () => {
    const assembly = await service.createAssemblyTemplate({ grants: GRANTS, actor: ACTOR, name: "Existing" });
    const line = await service.addAssemblyCustomLine({ grants: GRANTS, actor: ACTOR, assemblyId: assembly.id, title: "gypsum", harga: "0" });
    const noLibrary = BQ_ALL.filter((permission) => permission !== BQ_PERMISSIONS.libraryManage);
    await assert.rejects(service.saveAssemblyLineToLibrary({ grants: noLibrary, actor: ACTOR, lineId: line.id }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    assert.equal(await testDb.prisma.bqLibMaterial.count(), 0);
    const saved = await service.saveAssemblyLineToLibrary({ grants: GRANTS, actor: ACTOR, lineId: line.id });
    assert.equal(saved.source_type, "BQ_LIBRARY");
    await rejectsCode(service.saveAssemblyLineToLibrary({ grants: GRANTS, actor: ACTOR, lineId: line.id }), "bq.library.save-not-custom");

    const item = await workItem();
    const row = await service.addLineItem({ grants: GRANTS, actor: ACTOR, itemId: item.id, sourceType: "CUSTOM", titleSnapshot: "Lampu LED", purchaseUnitSnapshot: "pcs", hargaSnapshot: "45000", kategori: "MATERIAL", qty: "4" });
    await assert.rejects(service.saveLineItemToLibrary({ grants: noLibrary, actor: ACTOR, id: row.id }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    const converted = await service.saveLineItemToLibrary({ grants: GRANTS, actor: ACTOR, id: row.id });
    assert.deepEqual([converted.source_type, converted.source_price_snapshot?.toString(), converted.harga_snapshot.toString(), converted.qty.toString()], ["BQ_LIBRARY", "45000", "45000", "4"]);
    const library = await testDb.prisma.bqLibMaterial.findUniqueOrThrow({ where: { id: converted.source_ref_id! } });
    assert.deepEqual([library.name, library.purchase_unit, library.harga.toString()], ["Lampu LED", "pcs", "45000"]);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "bq.line-item.saved-to-library" } }), 1);
  });
});
