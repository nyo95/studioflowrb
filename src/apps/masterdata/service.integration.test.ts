import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import ExcelJS from "exceljs";

import type { PrismaClient } from "@/generated/prisma/client";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  type TestDb,
} from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";

import { createNotificationWriter } from "@platform/core/notifications/persistence";
import { createMasterDataService, MASTERDATA_PERMISSIONS } from "./service";
import { createSampleRequestResolvedNotifier } from "./sample-request-notifier";
import { createMasterDataPublicRead } from "./public";

const ACTOR = { kind: "USER" as const, userId: "masterdata-test-user", label: "Master Data Test" };
const GRANTS = Object.values(MASTERDATA_PERMISSIONS);

let testDb: TestDb;
let service: ReturnType<typeof createMasterDataService>;
let publicRead: ReturnType<typeof createMasterDataPublicRead>;

async function resetMasterData(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "master_data"."Category",
      "master_data"."Vendor",
      "master_data"."Brand",
      "master_data"."Sku",
      "master_data"."ArchiveCause",
      "master_data"."DeletionRequest",
      "master_data"."SampleRequestIntake",
      "platform"."Notification",
      "platform"."AuditEvent"
    RESTART IDENTITY CASCADE
  `);
  await db.unit.deleteMany({
    where: { code: { notIn: ["pcs", "m", "mm", "cm", "m2", "m3", "kg", "set", "sheet", "lot", "ls", "hr", "day"] } },
  });
  await db.unit.updateMany({ data: { status: "ACTIVE", archived_at: null } });
  await db.vendorType.deleteMany({
    where: { code: { notIn: ["SUPPLIER", "SUBCON", "SERVICE", "FABRICATOR", "FREELANCER"] } },
  });
  await db.vendorType.updateMany({ data: { deleted_at: null } });
}

async function linkBrand(brandId: string, vendorId: string) {
  await testDb.prisma.brandSupplier.create({ data: { id: crypto.randomUUID(), brand_id: brandId, vendor_id: vendorId, is_authorized: false, notes: null } });
}

async function createMaterialContext() {
  const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "pcs" } });
  const vendorType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
  const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Panel", kind: "PRODUCT" });
  const brand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Panel Brand" });
  const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier One" });
  await testDb.prisma.vendorVendorType.create({
    data: {
      id: crypto.randomUUID(),
      vendor_id: vendor.vendorId,
      vendor_type_id: vendorType.id,
    },
  });
  await testDb.prisma.brandSupplier.create({ data: { id: crypto.randomUUID(), brand_id: brand.brandId, vendor_id: vendor.vendorId, is_authorized: false, notes: null } });
  return { unit, categoryId: category.categoryId, vendorId: vendor.vendorId, brandId: brand.brandId };
}

before(async () => {
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  service = createMasterDataService(testDb.prisma, {
    runTransaction: (work) => testDb.prisma.$transaction(work),
    auditWriter: createAuditEventWriter(),
  });
  publicRead = createMasterDataPublicRead(testDb.prisma);
});

beforeEach(async () => {
  await resetMasterData(testDb.prisma);
});

after(async () => {
  await closeTestDb(testDb);
});

describe("Supplier and Brand contacts", () => {
  it("keeps up to three phone numbers per contact and rejects a fourth", async () => {
    const context = await createMaterialContext();
    await service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId, name: "Supplier One", contacts: [{ personName: "Sales", phones: [" 0215819089 ", "0812111", "0812222", "0812111"] }] });
    const row = await testDb.prisma.vendorContact.findFirstOrThrow({ where: { vendor_id: context.vendorId } });
    assert.equal(row.phone, "0215819089");
    assert.deepEqual(row.extra_phones, ["0812111", "0812222"]);
    await assert.rejects(service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId, name: "Supplier One", contacts: [{ id: row.id, personName: "Sales", phones: ["1", "2", "3", "4"] }] }), (error: unknown) => error instanceof AppError && error.code === "CONTACT_PHONES_TOO_MANY");
    await service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId, name: "Supplier One", contacts: [{ id: row.id, personName: "Sales", phone: "0215819089" }] });
    assert.deepEqual((await testDb.prisma.vendorContact.findUniqueOrThrow({ where: { id: row.id } })).extra_phones, []);
  });

  it("links the supplier to a Brand when a contact is scoped to it, instead of blocking the save", async () => {
    const context = await createMaterialContext();
    await testDb.prisma.brandSupplier.deleteMany({ where: { vendor_id: context.vendorId } });
    assert.equal(await testDb.prisma.brandSupplier.count({ where: { vendor_id: context.vendorId } }), 0);
    await service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId, name: "Supplier One", contacts: [{ personName: "Office", phones: ["0215819089"], brandId: context.brandId }] });
    assert.equal(await testDb.prisma.brandSupplier.count({ where: { vendor_id: context.vendorId, brand_id: context.brandId } }), 1);
    const contact = await testDb.prisma.vendorContact.findFirstOrThrow({ where: { vendor_id: context.vendorId } });
    assert.equal(contact.brand_id, context.brandId);
    const unrelated = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "No Material Type" });
    await assert.rejects(service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: unrelated.vendorId, name: "No Material Type", contacts: [{ personName: "X", brandId: context.brandId }] }), (error: unknown) => error instanceof AppError && error.code === "CONTACT_BRAND_NOT_RELATED");
  });

  it("manages a Brand's supplier contacts from the Brand itself", async () => {
    const context = await createMaterialContext();
    const { brandId } = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Contact Brand", suppliers: [{ vendorId: context.vendorId }], contacts: [{ vendorId: context.vendorId, personName: "Rina", phones: ["0811", "0822"], isPrimary: true }] });
    const [created] = await testDb.prisma.vendorContact.findMany({ where: { brand_id: brandId } });
    assert.deepEqual([created.vendor_id, created.person_name, created.phone, created.extra_phones, created.is_primary], [context.vendorId, "Rina", "0811", ["0822"], true]);
    await service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId, name: "Contact Brand", suppliers: [{ vendorId: context.vendorId }], contacts: [{ id: created.id, vendorId: context.vendorId, personName: "Rina S", phones: ["0811"] }, { vendorId: context.vendorId, personName: "Budi" }] });
    assert.deepEqual((await testDb.prisma.vendorContact.findMany({ where: { brand_id: brandId }, orderBy: { person_name: "asc" } })).map((c) => c.person_name), ["Budi", "Rina S"]);
    const stranger = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Stranger" });
    await assert.rejects(service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId, name: "Contact Brand", suppliers: [{ vendorId: context.vendorId }], contacts: [{ vendorId: stranger.vendorId, personName: "Nope" }] }), (error: unknown) => error instanceof AppError && error.code === "CONTACT_VENDOR_NOT_BRAND_SUPPLIER");
    await service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId, name: "Contact Brand", suppliers: [{ vendorId: context.vendorId }], contacts: [] });
    assert.equal(await testDb.prisma.vendorContact.count({ where: { brand_id: brandId } }), 0);
  });
});

describe("Master Data service", () => {
  it("round-trips SKU material prices through the workbook and rejects all invalid rows before apply", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Workbook SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "120", currency: "IDR" }] });
    const workbook = await service.exportSkuPriceWorkbook({ grants: GRANTS });
    const book = new ExcelJS.Workbook(); await book.xlsx.load(workbook as any);
    const sheet = book.getWorksheet("SKU Prices")!;
    sheet.getCell("C2").value = "Workbook SKU edited";
    sheet.getCell("O2").value = "125.50";
    const edited = Buffer.from(await book.xlsx.writeBuffer());
    const preview = await service.previewSkuPriceImport({ grants: GRANTS, file: { data: edited, name: "sku-prices.xlsx" } });
    assert.deepEqual(preview.totals, { create: 0, update: 1, unchanged: 0, error: 0 });
    await service.applySkuPriceImport({ grants: GRANTS, actor: ACTOR, file: edited, hash: preview.hash });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).name, "Workbook SKU Edited");
    assert.equal((await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } })).amount.toString(), "125.5");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "sku-price-workbook.applied" } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: { in: ["sku.updated", "price-material.updated"] } } }), 2, "workbook changes retain per-entity audit events alongside the batch event");

    const invalid = new ExcelJS.Workbook(); const invalidSheet = invalid.addWorksheet("SKU Prices");
    invalidSheet.addRow(["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"]);
    invalidSheet.addRow([crypto.randomUUID(), "", "Bad", "", "Unknown category", "pcs", "", "", "", "", "", "", crypto.randomUUID(), "Unknown supplier", "bad", "IDR", ""]);
    invalidSheet.addRow([skuId, "", "Workbook SKU edited", "", "Panel", "pcs", "", "", "", "", "", "", "", context.vendorId, "1", "IDR", ""]);
    invalidSheet.addRow([skuId, "", "Workbook SKU edited", "", "Panel", "pcs", "", "", "", "", "", "", "", context.vendorId, "1", "IDR", ""]);
    const invalidPreview = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await invalid.xlsx.writeBuffer()) });
    assert.ok(invalidPreview.errors.some((error) => error.column === "SKU ID"));
    assert.ok(invalidPreview.errors.some((error) => error.column === "Supplier"));
    assert.ok(invalidPreview.errors.some((error) => error.column === "Amount"));
    assert.ok(invalidPreview.errors.some((error) => error.column === "Price ID" || error.column === "Supplier"));
    await assert.rejects(service.applySkuPriceImport({ grants: GRANTS, actor: ACTOR, file: Buffer.from(await invalid.xlsx.writeBuffer()), hash: invalidPreview.hash }), (error: unknown) => error instanceof AppError && error.code === "SKU_PRICE_IMPORT_ERRORS");
  });

  it("keeps the single category, groups new supplier rows, and reports workbook limits before parsing", async () => {
    const context = await createMaterialContext();
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Two", vendorTypeIds: [supplierType.id] });
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Single category", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "120", currency: "IDR" }] });
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("SKU Prices");
    sheet.addRow(["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"]);
    const existingPrice = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    sheet.addRow([skuId, "", "Renamed category SKU", "", "Panel", "pcs", "", "", "", "", "", "", existingPrice.id, "Supplier One", "125.50", "IDR", ""]);
    sheet.addRow(["", "NEW-1", "New grouped SKU", "", "Panel", "pcs", "", "", "", "", "", "", "", "Supplier One", "120", "IDR", ""]);
    sheet.addRow(["", "NEW-1", "New grouped SKU", "", "Panel", "pcs", "", "", "", "", "", "", "", "Supplier Two", "0.10", "IDR", ""]);
    const file = Buffer.from(await book.xlsx.writeBuffer()); const preview = await service.previewSkuPriceImport({ grants: GRANTS, file });
    assert.equal(preview.errors.length, 0); await service.applySkuPriceImport({ grants: GRANTS, actor: ACTOR, file, hash: preview.hash });
    assert.equal((await testDb.prisma.skuCategory.findMany({ where: { sku_id: skuId } })).map((row) => row.category_id)[0], context.categoryId);
    const grouped = await testDb.prisma.sku.findFirstOrThrow({ where: { code: "NEW-1" }, include: { material_prices: true } }); assert.equal(grouped.material_prices.length, 2);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "sku.created", entity_id: grouped.id } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-material.created", entity_id: { in: grouped.material_prices.map((price) => price.id) } } }), 2);
    sheet.getCell("E2").value = ""; const blankCategory = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await book.xlsx.writeBuffer()) }); assert.ok(blankCategory.errors.some((error) => error.column === "Category"));
    await assert.rejects(service.previewSkuPriceImport({ grants: GRANTS, file: { data: Buffer.alloc(5 * 1024 * 1024 + 1), name: "large.xlsx" } }), (error: unknown) => error instanceof AppError && error.code === "SKU_PRICE_WORKBOOK_INVALID");
    await assert.rejects(service.previewSkuPriceImport({ grants: GRANTS, file: { data: Buffer.from("not parsed"), name: "wrong.csv" } }), (error: unknown) => error instanceof AppError && error.code === "SKU_PRICE_WORKBOOK_INVALID");
  });

  it("previews unchanged exports, row limits, formula cells, locked SKU changes, and rolls back a later failure", async () => {
    const context = await createMaterialContext(); const secondCategory = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Other Panel", kind: "PRODUCT" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const supplierTwo = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Two", vendorTypeIds: [supplierType.id] });
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Locked SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "120", currency: "IDR" }] });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Decimal SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: supplierTwo.vendorId, amount: "125.50", currency: "IDR" }] });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Small Decimal SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "0.10", currency: "IDR" }] });
    const noPriceSkuId = crypto.randomUUID();
    await testDb.prisma.sku.create({ data: { id: noPriceSkuId, name: "No Price SKU", slug: "no-price-sku", base_unit_id: context.unit.id } });
    await testDb.prisma.skuCategory.create({ data: { id: crypto.randomUUID(), sku_id: noPriceSkuId, category_id: context.categoryId } });
    const linked = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Linked Brand SKU", brandId: context.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });
    const link = await testDb.prisma.brandLink.create({ data: { id: crypto.randomUUID(), brand_id: context.brandId, kind: "WEBSITE", url: "https://example.test/locked", label: "Locked source" } });
    await testDb.prisma.priceMaterial.updateMany({ where: { sku_id: linked.skuId }, data: { source_link_id: link.id } });
    const exportedData = await service.exportSkuPriceWorkbook({ grants: GRANTS });
    const unchanged = await service.previewSkuPriceImport({ grants: GRANTS, file: exportedData }); assert.equal(unchanged.totals.unchanged, unchanged.rows.length); assert.equal(unchanged.errors.length, 0);
    const exported = new ExcelJS.Workbook(); await exported.xlsx.load(exportedData as any); const sheet = exported.getWorksheet("SKU Prices")!;
    const rowFor = (id: string) => { for (let row = 2; row <= sheet.rowCount; row += 1) if (sheet.getCell(row, 1).text === id) return row; throw new Error(`Missing SKU ${id}`); };
    const lockedRow = rowFor(skuId); const linkedRow = rowFor(linked.skuId);
    sheet.getCell(lockedRow, 3).value = { formula: '"Formula SKU"', result: "Formula SKU" };
    const formula = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await exported.xlsx.writeBuffer()) }); assert.equal(formula.errors.length, 0); assert.ok(formula.rows.some((row) => row.row === lockedRow && row.outcome === "update"));
    sheet.getCell(lockedRow, 3).value = { richText: [{ text: "Rich " }, { text: "SKU" }] };
    const richText = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await exported.xlsx.writeBuffer()) }); assert.equal(richText.errors.length, 0); assert.equal(JSON.stringify(richText).includes("[object Object]"), false);
    sheet.getCell(lockedRow, 6).value = "m";
    const locked = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await exported.xlsx.writeBuffer()) }); assert.ok(locked.errors.some((error) => error.row === lockedRow && error.column === "Base unit"));
    sheet.getCell(lockedRow, 5).value = secondCategory.categoryId; const badCategory = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await exported.xlsx.writeBuffer()) }); assert.ok(badCategory.errors.some((error) => error.row === lockedRow && error.column === "Category"));
    sheet.getCell(lockedRow, 5).value = "Panel"; sheet.getCell(lockedRow, 6).value = "pcs"; sheet.getCell(linkedRow, 4).value = "";
    const linkedBrand = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await exported.xlsx.writeBuffer()) }); assert.ok(linkedBrand.errors.some((error) => error.row === linkedRow && error.column === "Brand"));
    const tooMany = new ExcelJS.Workbook(); const rows = tooMany.addWorksheet("SKU Prices"); rows.addRow(["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"]); for (let i = 0; i < 2001; i += 1) rows.addRow(["", `C${i}`, `N${i}`, "", "Panel", "pcs", "", "", "", "", "", "", "", "Supplier One", "1", "IDR", ""]);
    await assert.rejects(service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await tooMany.xlsx.writeBuffer()) }), (error: unknown) => error instanceof AppError && error.code === "SKU_PRICE_WORKBOOK_INVALID");
    const rollback = new ExcelJS.Workbook(); const roll = rollback.addWorksheet("SKU Prices"); roll.addRow(["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"]); const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } }); roll.addRow([skuId, "", "Would roll back", "", "Panel", "pcs", "", "", "", "", "", "", price.id, "Supplier One", "120", "IDR", ""]); roll.addRow([skuId, "", "Would roll back", "", "Panel", "pcs", "", "", "", "", "", "", "", "Supplier One", "1", "IDR", ""]); const rollbackFile = Buffer.from(await rollback.xlsx.writeBuffer()); const rollbackPreview = await service.previewSkuPriceImport({ grants: GRANTS, file: rollbackFile }); await assert.rejects(service.applySkuPriceImport({ grants: GRANTS, actor: ACTOR, file: rollbackFile, hash: rollbackPreview.hash })); assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).name, "Locked SKU");
  });

  it("separates live Brand owners from material-capable supplier choices", async () => {
    const ownerOnly = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Owner Only" });
    const materialSupplier = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Material Supplier" });
    const archivedSupplier = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Archived Supplier" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.createMany({
      data: [materialSupplier.vendorId, archivedSupplier.vendorId].map((vendorId) => ({
        id: crypto.randomUUID(),
        vendor_id: vendorId,
        vendor_type_id: supplierType.id,
      })),
    });
    await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId: archivedSupplier.vendorId });

    const refs = await service.listBrandDirectoryRefs({ grants: GRANTS });

    assert.equal(refs.ownerVendors.some((vendor) => vendor.id === ownerOnly.vendorId), true);
    assert.equal(refs.ownerVendors.some((vendor) => vendor.id === materialSupplier.vendorId), true);
    assert.equal(refs.ownerVendors.some((vendor) => vendor.id === archivedSupplier.vendorId), false);
    assert.deepEqual(refs.materialVendors.map((vendor) => vendor.id), [materialSupplier.vendorId]);
  });

  it("relates a new Vendor to Brands at creation, requiring material capability first", async () => {
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const brandA = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Dulux" });
    const brandB = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Nippon" });

    // No Supplier Type at all — brandIds must be refused, not silently dropped.
    await assert.rejects(
      service.createVendor({ grants: GRANTS, actor: ACTOR, name: "No Type Yet", brandIds: [brandA.brandId] }),
      (error: unknown) => error instanceof AppError && error.code === "VENDOR_NOT_MATERIAL_CAPABLE",
    );

    // A Supplier Type that cannot supply material is the same as none for this purpose.
    const laborOnlyType = await testDb.prisma.vendorType.create({
      data: { id: crypto.randomUUID(), code: "LABOR_ONLY_TEST", name: "Labor Only", can_supply_material: false, can_supply_labor: true },
    });
    await assert.rejects(
      service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Labor Only Vendor", vendorTypeIds: [laborOnlyType.id], brandIds: [brandA.brandId] }),
      (error: unknown) => error instanceof AppError && error.code === "VENDOR_NOT_MATERIAL_CAPABLE",
    );

    // Same request, but with a material-capable type included this time: succeeds,
    // and both Brands are related in one creation — no separate step needed.
    const vendor = await service.createVendor({
      grants: GRANTS,
      actor: ACTOR,
      name: "Mitra Kayu Nusantara",
      vendorTypeIds: [supplierType.id],
      brandIds: [brandA.brandId, brandB.brandId],
    });
    const relations = await testDb.prisma.brandSupplier.findMany({ where: { vendor_id: vendor.vendorId }, select: { brand_id: true, is_authorized: true } });
    assert.deepEqual(relations.map((r) => r.brand_id).sort(), [brandA.brandId, brandB.brandId].sort());
    assert.equal(relations.every((r) => r.is_authorized === false), true);

    // brandIds is genuinely optional — omitting it entirely still creates the Vendor.
    const bare = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Brand Unknown Yet" });
    assert.equal((await testDb.prisma.brandSupplier.count({ where: { vendor_id: bare.vendorId } })), 0);

    // An archived Brand cannot be related, even with material capability.
    const doomedBrand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Discontinued Brand" });
    await service.archiveBrand({ grants: GRANTS, actor: ACTOR, brandId: doomedBrand.brandId });
    await assert.rejects(
      service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Yet Another Vendor", vendorTypeIds: [supplierType.id], brandIds: [doomedBrand.brandId] }),
      (error: unknown) => error instanceof AppError && error.code === "BRAND_INVALID",
    );
  });

  it("offers canonical promotion choices and rejects wrong-type, archived, or unauthorized selections", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Promotion SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "120", currency: "IDR" }] });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    const choices = await service.listPromotionReferences({ grants: [MASTERDATA_PERMISSIONS.promotionApprove] });
    assert.equal(choices[0].id, price.id);
    assert.match(choices[0].label, /Promotion SKU/);
    assert.equal((await service.validatePromotionReference({ grants: GRANTS, type: "material", referenceId: price.id })).referenceId, price.id);
    await assert.rejects(service.validatePromotionReference({ grants: GRANTS, type: "labor", referenceId: price.id }));
    await assert.rejects(service.listPromotionReferences({ grants: [] }));
    await testDb.prisma.priceMaterial.update({ where: { id: price.id }, data: { deleted_at: new Date() } });
    assert.deepEqual(await service.listPromotionReferences({ grants: GRANTS }), []);
    await assert.rejects(service.validatePromotionReference({ grants: GRANTS, type: "material", referenceId: price.id }));
  });
  it("creates an unbranded SKU, attaches a valid Brand, and removes it with enrichment cleanup", async () => {
    const context = await createMaterialContext();
    const input = { grants: GRANTS, actor: ACTOR, name: "Unbranded", baseUnitId: context.unit.id, categoryId: context.categoryId };
    const { skuId } = await service.createSku({ ...input, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).brand_id, null);
    await service.updateSku({ ...input, skuId, brandId: context.brandId });
    assert.equal(await testDb.prisma.brandCategoryOrigin.count({ where: { source_sku_id: skuId } }), 1);
    await service.updateSku({ ...input, skuId, brandId: null });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).brand_id, null);
    assert.equal(await testDb.prisma.brandCategoryOrigin.count({ where: { source_sku_id: skuId } }), 0);
    assert.equal(await testDb.prisma.brand.count({ where: { id: context.brandId } }), 1);
  });
  it("creates a complete SKU atomically with exact decimal material pricing", async () => {
    const context = await createMaterialContext();
    const result = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "HPL Panel",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "123456789012.34", currency: "idr" }],
    });

    const sku = await testDb.prisma.sku.findUniqueOrThrow({
      where: { id: result.skuId },
      include: { categories: true, material_prices: true },
    });
    assert.equal(sku.categories.length, 1);
    assert.equal(sku.material_prices.length, 1);
    assert.equal(sku.material_prices[0].amount.toString(), "123456789012.34");
    assert.equal(sku.material_prices[0].currency, "IDR");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "sku.created", entity_id: sku.id } }), 1);
    const priceAudit = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { action: "price-material.created", entity_type: "price_material", entity_id: sku.material_prices[0].id } });
    assert.deepEqual(priceAudit.metadata, { sku_id: sku.id, vendor_id: context.vendorId });
  });

  it("accepts a code-only SKU and uses the code as its fallback identity", async () => {
    const context = await createMaterialContext();
    const result = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      code: "KPF 2005",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }],
    });

    const sku = await testDb.prisma.sku.findUniqueOrThrow({ where: { id: result.skuId } });
    assert.equal(sku.name, null);
    assert.equal(sku.code, "KPF 2005");
    assert.equal(sku.slug, "kpf-2005");
    await assert.rejects(
      () => service.createSku({
        grants: GRANTS,
        actor: ACTOR,
        brandId: context.brandId,
        baseUnitId: context.unit.id,
        categoryId: context.categoryId,
        priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }],
      }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_IDENTITY_REQUIRED",
    );
  });

  it("derives exact sheet-to-square-metre conversion from structured dimensions", async () => {
    const context = await createMaterialContext();
    const [baseUnit, purchaseUnit, dimensionUnit] = await Promise.all([
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "sheet" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "mm" } }),
    ]);
    const result = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "HPL 1200 x 2400",
      brandId: context.brandId,
      baseUnitId: baseUnit.id,
      purchaseUnitId: purchaseUnit.id,
      dimensionLength: "1200",
      dimensionWidth: "2400",
      dimensionThickness: "0.8",
      dimensionUnitId: dimensionUnit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "288000", currency: "IDR" }],
    });

    const sku = await testDb.prisma.sku.findUniqueOrThrow({ where: { id: result.skuId } });
    assert.equal(sku.dimension_length?.toString(), "1200");
    assert.equal(sku.dimension_width?.toString(), "2400");
    assert.equal(sku.dimension_thickness?.toString(), "0.8");
    assert.equal(sku.purchase_to_base_factor?.toString(), "2.88");
    const option = (await publicRead.getSkuPricingOptions(result.skuId))[0];
    assert.equal(option.measurement.purchaseToBaseFactor, "2.88");
    assert.equal(option.measurement.baseUnit.code, "m2");
    assert.equal(option.measurement.purchaseUnit?.code, "sheet");

    await service.updateSku({
      grants: GRANTS,
      actor: ACTOR,
      skuId: result.skuId,
      name: "HPL 1200 x 2400 Updated",
      brandId: context.brandId,
      baseUnitId: baseUnit.id,
      purchaseUnitId: purchaseUnit.id,
        categoryId: context.categoryId,
    });
    const preserved = await testDb.prisma.sku.findUniqueOrThrow({ where: { id: result.skuId } });
    assert.equal(preserved.dimension_length?.toString(), "1200");
    assert.equal(preserved.purchase_to_base_factor?.toString(), "2.88");
  });

  it("rejects incomplete or semantically incompatible SKU dimensions", async () => {
    const context = await createMaterialContext();
    const [baseUnit, purchaseUnit, dimensionUnit] = await Promise.all([
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "sheet" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "mm" } }),
    ]);
    const base = {
      grants: GRANTS,
      actor: ACTOR,
      name: "Invalid measured SKU",
      brandId: context.brandId,
      baseUnitId: baseUnit.id,
      purchaseUnitId: purchaseUnit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }],
    };
    await assert.rejects(
      () => service.createSku({ ...base, dimensionLength: "1200", dimensionUnitId: dimensionUnit.id }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_DIMENSION_INCOMPLETE",
    );
    await assert.rejects(
      () => service.createSku({ ...base, baseUnitId: context.unit.id, dimensionLength: "1200", dimensionWidth: "2400", dimensionUnitId: dimensionUnit.id }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_DIMENSION_BASE_UNIT_INVALID",
    );
  });

  it("rejects incomplete and invalid-price SKU input before persistence", async () => {
    const context = await createMaterialContext();
    const base = {
      grants: GRANTS,
      actor: ACTOR,
      name: "Invalid SKU",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }],
    };

    await assert.rejects(
      () => service.createSku({ ...base, categoryId: "" }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_CATEGORY_REQUIRED",
    );
    const unbranded = await service.createSku({ ...base, brandId: "" });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: unbranded.skuId } })).brand_id, null);
    await assert.rejects(
      () => service.createSku({ ...base, priceMaterials: [{ ...base.priceMaterials[0], amount: "NaN" }] }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_AMOUNT_INVALID",
    );
    assert.equal(await testDb.prisma.sku.count(), 1);
  });

  it("rejects non-product categories on SKU create and update", async () => {
    const context = await createMaterialContext();
    const workCategory = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Installation", kind: "WORK" });
    const base = {
      grants: GRANTS,
      actor: ACTOR,
      name: "Category guard SKU",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }],
    };

    await assert.rejects(
      () => service.createSku({ ...base, categoryId: workCategory.categoryId }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_CATEGORY_KIND_INVALID",
    );

    const { skuId } = await service.createSku(base);
    await assert.rejects(
      () => service.updateSku({
        grants: GRANTS,
        actor: ACTOR,
        skuId,
        name: "Category guard SKU",
        brandId: context.brandId,
        baseUnitId: context.unit.id,
        categoryId: workCategory.categoryId,
      }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_CATEGORY_KIND_INVALID",
    );
  });

  it("preserves overlapping direct and SKU-parent archive causes", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Cause-safe SKU",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1000", currency: "IDR" }],
    });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    const secondVendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Two" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({
      data: { id: crypto.randomUUID(), vendor_id: secondVendor.vendorId, vendor_type_id: supplierType.id },
    });
    await linkBrand(context.brandId, secondVendor.vendorId);

    await service.createPriceMaterial({
      grants: GRANTS,
      actor: ACTOR,
      skuId,
      supplierVendorId: secondVendor.vendorId,
      amount: "1100",
      currency: "IDR",
    });

    await service.archivePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id });
    await service.archiveSku({ grants: GRANTS, actor: ACTOR, skuId });
    assert.equal(
      await testDb.prisma.archiveCause.count({ where: { entity_type: "price_material", entity_id: price.id } }),
      2,
    );

    await assert.rejects(
      () => service.restorePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_HAS_PARENT_CAUSES",
    );
    await service.restoreSku({ grants: GRANTS, actor: ACTOR, skuId });
    assert.notEqual((await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: price.id } })).deleted_at, null);
    assert.equal(
      await testDb.prisma.archiveCause.count({ where: { entity_type: "price_material", entity_id: price.id, kind: "DIRECT" } }),
      1,
    );
    await service.restorePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id });
    assert.equal((await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: price.id } })).deleted_at, null);
  });

  it("rolls back SKU restore when a required Unit is archived", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Unit-bound SKU",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "250", currency: "IDR" }],
    });
    await service.archiveSku({ grants: GRANTS, actor: ACTOR, skuId });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: context.unit.id });

    await assert.rejects(
      () => service.restoreSku({ grants: GRANTS, actor: ACTOR, skuId }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_UNIT_INACTIVE",
    );
    assert.notEqual((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).deleted_at, null);
  });

  it("rejects updates to archived SKU, archived material price, archived work prices", async () => {
    const context = await createMaterialContext();
    const subconType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const workVendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Work Vendor Archived Guard" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: workVendor.vendorId, vendor_type_id: subconType.id } });
    const workCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Work Cat Archived Guard", kind: "WORK" });
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });

    const { skuId } = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Archived Guard SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "500", currency: "IDR" }],
    });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    const mlPrice = await service.createPriceMaterialLabor({ grants: GRANTS, actor: ACTOR, name: "ML Guard", categoryId: workCat.categoryId, vendorId: workVendor.vendorId, unitId: unit.id, amount: "100", currency: "IDR" });
    const laborPrice = await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "Labor Guard", categoryId: workCat.categoryId, vendorId: workVendor.vendorId, unitId: unit.id, amount: "80", currency: "IDR" });

    // Simulate an already-archived price directly (bypassing the service's last-price guard)
    await testDb.prisma.priceMaterial.update({ where: { id: price.id }, data: { deleted_at: new Date() } });
    await assert.rejects(
      () => service.updatePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id, amount: "600", currency: "IDR" }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_ARCHIVED",
    );

    await service.archiveSku({ grants: GRANTS, actor: ACTOR, skuId });
    await assert.rejects(
      () => service.updateSku({ grants: GRANTS, actor: ACTOR, skuId, name: "Archived Guard SKU", brandId: context.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_ARCHIVED",
    );

    await service.archivePriceMaterialLabor({ grants: GRANTS, actor: ACTOR, priceMaterialLaborId: mlPrice.priceMaterialLaborId });
    await assert.rejects(
      () => service.updatePriceMaterialLabor({ grants: GRANTS, actor: ACTOR, priceMaterialLaborId: mlPrice.priceMaterialLaborId, name: "ML Guard Updated", categoryId: workCat.categoryId, vendorId: workVendor.vendorId, unitId: unit.id, amount: "120", currency: "IDR" }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_ARCHIVED",
    );

    await service.archivePriceLabor({ grants: GRANTS, actor: ACTOR, priceLaborId: laborPrice.priceLaborId });
    await assert.rejects(
      () => service.updatePriceLabor({ grants: GRANTS, actor: ACTOR, priceLaborId: laborPrice.priceLaborId, name: "Labor Guard Updated", categoryId: workCat.categoryId, vendorId: workVendor.vendorId, unitId: unit.id, amount: "90", currency: "IDR" }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_ARCHIVED",
    );
  });

  it("blocks SKU brand change when live material prices have source links", async () => {
    const context = await createMaterialContext();
    const brand2 = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Brand Two" });
    const { skuId } = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Brand-Linked SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1000", currency: "IDR" }],
    });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    const link = await testDb.prisma.brandLink.create({ data: { id: crypto.randomUUID(), brand_id: context.brandId, kind: "CATALOG", url: "https://example.com/catalog" } });

    await service.updatePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id, amount: "1000", currency: "IDR", sourceLinkId: link.id });

    await assert.rejects(
      () => service.updateSku({ grants: GRANTS, actor: ACTOR, skuId, name: "Brand-Linked SKU", brandId: brand2.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_BRAND_CHANGE_BLOCKED",
    );

    // Clearing the source link allows the brand change once the supplier also carries the new brand
    await linkBrand(brand2.brandId, context.vendorId);
    await service.updatePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id, amount: "1000", currency: "IDR", sourceLinkId: null });
    await service.updateSku({ grants: GRANTS, actor: ACTOR, skuId, name: "Brand-Linked SKU", brandId: brand2.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).brand_id, brand2.brandId);
  });

  it("blocks SKU restore when all its prices still have other archive causes", async () => {
    const context = await createMaterialContext();
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const vendor2 = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Two Restore Block" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor2.vendorId, vendor_type_id: supplierType.id } });
    await linkBrand(context.brandId, vendor2.vendorId);

    const { skuId } = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "All-Blocked SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [
        { supplierVendorId: context.vendorId, amount: "100", currency: "IDR" },
        { supplierVendorId: vendor2.vendorId, amount: "110", currency: "IDR" },
      ],
    });

    // Archive SKU — both prices now have PARENT(sku) cause
    await service.archiveSku({ grants: GRANTS, actor: ACTOR, skuId });

    // Archive each vendor — each price now also has a PARENT(vendor) cause
    await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId });
    await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId: vendor2.vendorId });

    await assert.rejects(
      () => service.restoreSku({ grants: GRANTS, actor: ACTOR, skuId }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_NO_RESTORABLE_PRICE",
    );
  });

  it("blocks price restore when its source link brand no longer matches the SKU brand", async () => {
    const context = await createMaterialContext();
    const brand2 = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Brand Two Mismatch" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const vendor2 = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Mismatch Guard" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor2.vendorId, vendor_type_id: supplierType.id } });
    await linkBrand(context.brandId, vendor2.vendorId);

    // Two prices: Price 1 gets the source link; Price 2 acts as the live safety net
    const { skuId } = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Source-Link Mismatch SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [
        { supplierVendorId: context.vendorId, amount: "500", currency: "IDR" },
        { supplierVendorId: vendor2.vendorId, amount: "500", currency: "IDR" },
      ],
    });
    const prices = await testDb.prisma.priceMaterial.findMany({ where: { sku_id: skuId }, orderBy: { created_at: "asc" } });
    const price1 = prices[0];
    const link = await testDb.prisma.brandLink.create({ data: { id: crypto.randomUUID(), brand_id: context.brandId, kind: "CATALOG", url: "https://example.com/mismatch" } });
    await service.updatePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price1.id, amount: "500", currency: "IDR", sourceLinkId: link.id });

    // Archive Price 1 (Price 2 keeps the SKU live); no live source-linked price remains
    await service.archivePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price1.id });
    // Brand change is now allowed (the only source-linked price is archived) once both suppliers carry the new brand
    await linkBrand(brand2.brandId, vendor2.vendorId);
    await linkBrand(brand2.brandId, context.vendorId);
    await service.updateSku({ grants: GRANTS, actor: ACTOR, skuId, name: "Source-Link Mismatch SKU", brandId: brand2.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId });

    // Restore Price 1 — source_link still points to Brand 1, but SKU now has Brand 2
    await assert.rejects(
      () => service.restorePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price1.id }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_SOURCE_LINK_BRAND_MISMATCH",
    );
  });

  it("blocks price restore when the SKU was unbranded, not just moved to another brand", async () => {
    const context = await createMaterialContext();
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const vendor2 = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Unbrand Guard" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor2.vendorId, vendor_type_id: supplierType.id } });
    await linkBrand(context.brandId, vendor2.vendorId);

    const { skuId } = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Unbrand Guard SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [
        { supplierVendorId: context.vendorId, amount: "500", currency: "IDR" },
        { supplierVendorId: vendor2.vendorId, amount: "500", currency: "IDR" },
      ],
    });
    const prices = await testDb.prisma.priceMaterial.findMany({ where: { sku_id: skuId }, orderBy: { created_at: "asc" } });
    const price1 = prices[0];
    const link = await testDb.prisma.brandLink.create({ data: { id: crypto.randomUUID(), brand_id: context.brandId, kind: "CATALOG", url: "https://example.com/unbrand" } });
    await service.updatePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price1.id, amount: "500", currency: "IDR", sourceLinkId: link.id });

    // Archive Price 1, then clear the SKU's Brand entirely (brand_id -> null)
    await service.archivePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price1.id });
    await service.updateSku({ grants: GRANTS, actor: ACTOR, skuId, name: "Unbrand Guard SKU", brandId: undefined, baseUnitId: context.unit.id, categoryId: context.categoryId });

    // Restore Price 1 — source_link still points to the old Brand, but the SKU now has none.
    // sku.brand_id is null here, so a guard that short-circuits on a falsy brand_id would miss this.
    await assert.rejects(
      () => service.restorePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price1.id }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_SOURCE_LINK_BRAND_MISMATCH",
    );
  });

  it("handles Unit update and list queries", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "TEST_ROLL", name: "Test Roll" });
    assert.equal((await service.getUnit({ grants: GRANTS, unitId: created.unitId })).code, "test_roll", "unit codes accept any case but are stored lowercase");
    await assert.rejects(
      () => service.updateUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, code: "TEST_ROLL_PK", name: "Test Roll Pack" }),
      (error: unknown) => error instanceof AppError && error.code === "UNIT_CODE_IMMUTABLE",
    );
    await service.updateUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, code: "TEST_ROLL", name: "Test Roll Pack" });

    const updated = await service.getUnit({ grants: GRANTS, unitId: created.unitId });
    assert.equal(updated.code, "test_roll");
    assert.equal(updated.name, "Test Roll Pack");
  });

  it("handles Category update, merge, and deactivation with origin tracking", async () => {
    const sourceCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Solid Wood", kind: "PRODUCT" });
    const targetCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Timber", kind: "PRODUCT" });

    const brand = await service.createBrand({
      grants: GRANTS,
      actor: ACTOR,
      name: "WoodBrand",
      categoryIds: [sourceCat.categoryId],
    });

    // Merge source into target
    await service.mergeCategory({
      grants: GRANTS,
      actor: ACTOR,
      sourceCategoryId: sourceCat.categoryId,
      targetCategoryId: targetCat.categoryId,
    });

    const deactivated = await testDb.prisma.category.findUniqueOrThrow({ where: { id: sourceCat.categoryId } });
    assert.equal(deactivated.status, "DEACTIVATED");
    assert.equal(deactivated.merged_into_id, targetCat.categoryId);

    const brandCats = await testDb.prisma.brandCategory.findMany({ where: { brand_id: brand.brandId } });
    assert.equal(brandCats.length, 1);
    assert.equal(brandCats[0].category_id, targetCat.categoryId);
  });

  it("guards Vendor capability removal when live dependent relations exist", async () => {
    const context = await createMaterialContext();
    const vendorTypeSupplier = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const vendorTypeService = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SERVICE" } });

    // Vendor has PriceMaterial using its SUPPLIER capability
    await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Guarded SKU",
      brandId: context.brandId,
      baseUnitId: context.unit.id,
      categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "5000", currency: "IDR" }],
    });

    // Attempting to remove SUPPLIER type (leaving only SERVICE with no material capability) must fail
    await assert.rejects(
      () =>
        service.updateVendor({
          grants: GRANTS,
          actor: ACTOR,
          vendorId: context.vendorId,
          name: "Supplier One",
          vendorTypeIds: [vendorTypeService.id],
        }),
      (error: unknown) => error instanceof AppError && error.code === "VENDOR_MATERIAL_CAPABILITY_IN_USE",
    );

    // Keeping SUPPLIER type succeeds
    await service.updateVendor({
      grants: GRANTS,
      actor: ACTOR,
      vendorId: context.vendorId,
      name: "Supplier One Updated",
      vendorTypeIds: [vendorTypeSupplier.id, vendorTypeService.id],
    });
  });

  it("tracks Brand category manual vs SKU enrichment provenance", async () => {
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "pcs" } });
    const supplier = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Wood Vendor" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({
      data: { id: crypto.randomUUID(), vendor_id: supplier.vendorId, vendor_type_id: supplierType.id },
    });

    const catManual = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Laminate", kind: "PRODUCT" });
    const catEnrich = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Veneer", kind: "PRODUCT" });

    // Brand created with MANUAL Laminate category
    const brand = await service.createBrand({
      grants: GRANTS,
      actor: ACTOR,
      name: "TACO",
      categoryIds: [catManual.categoryId],
      hashtags: ["#surface", "#finish"],
    });

    await linkBrand(brand.brandId, supplier.vendorId);

    // SKU created for TACO with Veneer category -> persistent SKU enrichment
    const sku = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "TACO Natural Veneer",
      brandId: brand.brandId,
      baseUnitId: unit.id,
      categoryId: catEnrich.categoryId,
      priceMaterials: [{ supplierVendorId: supplier.vendorId, amount: "450000", currency: "IDR" }],
    });

    const brandCategories = await testDb.prisma.brandCategory.findMany({
      where: { brand_id: brand.brandId },
      include: { origins: true },
    });
    assert.equal(brandCategories.length, 2);

    const manualEntry = brandCategories.find((bc) => bc.category_id === catManual.categoryId);
    assert.equal(manualEntry?.origins[0].kind, "MANUAL");

    const enrichedEntry = brandCategories.find((bc) => bc.category_id === catEnrich.categoryId);
    assert.equal(enrichedEntry?.origins[0].kind, "SKU_ENRICHMENT");
    assert.equal(enrichedEntry?.origins[0].source_sku_id, sku.skuId);

    // Public read returns both discovery categories and hashtags
    const pubBrand = await publicRead.getBrandLibraryRead(brand.brandId);
    assert.equal(pubBrand?.name, "TACO");
    assert.equal(pubBrand?.categories.length, 2);
    assert.equal(pubBrand?.hashtags.length, 2);
  });

  it("handles all three Pricing models and public read integration", async () => {
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const subconType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Multi Vendor" });
    await testDb.prisma.vendorVendorType.create({
      data: { id: crypto.randomUUID(), vendor_id: vendor.vendorId, vendor_type_id: subconType.id },
    });

    const workCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Flooring", kind: "WORK" });
    const prodCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Tile", kind: "PRODUCT" });
    const brand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Tile Brand" });

    await linkBrand(brand.brandId, vendor.vendorId);

    // 1. Material price via SKU
    const sku = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Granite Tile 60x60",
      brandId: brand.brandId,
      baseUnitId: unit.id,
      categoryId: prodCat.categoryId,
      priceMaterials: [{ supplierVendorId: vendor.vendorId, amount: "185000", currency: "IDR" }],
    });

    // 2. Material + Labor price
    const mlPrice = await service.createPriceMaterialLabor({
      grants: GRANTS,
      actor: ACTOR,
      name: "Pasang Granit 60x60 Termasuk Semen",
      categoryId: workCat.categoryId,
      vendorId: vendor.vendorId,
      unitId: unit.id,
      amount: "285000",
      currency: "IDR",
      scopeNote: "Termasuk semen, pasir, dan nat",
    });

    // 3. Labor Only price
    const laborPrice = await service.createPriceLabor({
      grants: GRANTS,
      actor: ACTOR,
      name: "Upah Pasang Granit 60x60 Saja",
      categoryId: workCat.categoryId,
      vendorId: vendor.vendorId,
      unitId: unit.id,
      amount: "100000",
      currency: "IDR",
    });

    // Public read tests
    const matOptions = await publicRead.getSkuPricingOptions(sku.skuId);
    assert.equal(matOptions.length, 1);
    assert.equal(matOptions[0].amount, "185000");

    const byId = await publicRead.getMaterialPriceOption(matOptions[0].id);
    assert.equal(byId?.id, matOptions[0].id);
    assert.equal(byId?.amount, "185000");
    assert.equal(await publicRead.getMaterialPriceOption("00000000-0000-0000-0000-000000000000"), null);

    const workPrices = await publicRead.listWorkPricesRead({ categoryId: workCat.categoryId });
    assert.equal(workPrices.length, 2);
    assert.equal(workPrices.some((w) => w.id === mlPrice.priceMaterialLaborId && w.kind === "material-labor"), true);
    assert.equal(workPrices.some((w) => w.id === laborPrice.priceLaborId && w.kind === "labor"), true);

    const searchedWorkPrices = await publicRead.listWorkPricesRead({ search: "Upah", limit: 1 });
    assert.deepEqual(searchedWorkPrices.map((w) => w.id), [laborPrice.priceLaborId]);

    const searchedMaterialLabor = await publicRead.listWorkPricesRead({ kind: "material-labor", search: "Termasuk", limit: 1 });
    assert.deepEqual(searchedMaterialLabor.map((w) => w.id), [mlPrice.priceMaterialLaborId]);
  });

  it("creates Pricing quick-entry vendors only with an active matching capability", async () => {
    const supplier = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const serviceType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SERVICE" } });

    const materialVendor = await service.createPricingVendorQuick({
      grants: GRANTS,
      actor: ACTOR,
      name: "Quick Material Vendor",
      vendorTypeId: supplier.id,
      capability: "MATERIAL",
    });
    const assignment = await testDb.prisma.vendorVendorType.findFirstOrThrow({
      where: { vendor_id: materialVendor.vendorId },
    });
    assert.equal(assignment.vendor_type_id, supplier.id);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "vendor.created", entity_id: materialVendor.vendorId } }), 1);

    await assert.rejects(
      service.createPricingVendorQuick({
        grants: GRANTS,
        actor: ACTOR,
        name: "Wrong Capability Vendor",
        vendorTypeId: serviceType.id,
        capability: "MATERIAL",
      }),
      (error: unknown) => error instanceof AppError && error.code === "VENDOR_TYPE_CAPABILITY_REQUIRED",
    );
    assert.equal(await testDb.prisma.vendor.count({ where: { name: "Wrong Capability Vendor" } }), 0);
  });

  it("allows Vendor managers to load assignment options without dictionary or Brand read grants", async () => {
    const brand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Assignment Brand" });
    const vendorOnlyGrants = [MASTERDATA_PERMISSIONS.vendorManage];

    const [vendorTypes, brands] = await Promise.all([
      service.listVendorTypesForAssignment({ grants: vendorOnlyGrants }),
      service.listBrandsForVendorAssignment({ grants: vendorOnlyGrants }),
    ]);

    assert.equal(vendorTypes.some((vendorType) => vendorType.code === "SUPPLIER"), true);
    assert.deepEqual(brands, [{ id: brand.brandId, name: "Assignment Brand" }]);
  });

  it("does not rewrite identical Supplier contacts and still supports clearing optional contact fields", async () => {
    const vendor = await service.createVendor({
      grants: GRANTS,
      actor: ACTOR,
      name: "Stable Contact Supplier",
      contacts: [{ personName: "Mira", jobTitle: "Sales", notes: "Call first" }],
    });
    const contact = await testDb.prisma.vendorContact.findFirstOrThrow({ where: { vendor_id: vendor.vendorId } });
    const old = new Date("2000-01-01T00:00:00.000Z");
    await testDb.prisma.vendorContact.update({ where: { id: contact.id }, data: { updated_at: old } });
    const auditCount = await testDb.prisma.auditEvent.count({ where: { action: "vendor.updated", entity_id: vendor.vendorId } });

    await service.updateVendor({
      grants: GRANTS,
      actor: ACTOR,
      vendorId: vendor.vendorId,
      name: "Stable Contact Supplier",
      contacts: [{ id: contact.id, personName: "Mira", jobTitle: "Sales", notes: "Call first" }],
    });
    assert.equal((await testDb.prisma.vendorContact.findUniqueOrThrow({ where: { id: contact.id } })).updated_at.toISOString(), old.toISOString());
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "vendor.updated", entity_id: vendor.vendorId } }), auditCount);

    await service.updateVendor({
      grants: GRANTS,
      actor: ACTOR,
      vendorId: vendor.vendorId,
      name: "Stable Contact Supplier",
      contacts: [{ id: contact.id, personName: "Mira" }],
    });
    const cleared = await testDb.prisma.vendorContact.findUniqueOrThrow({ where: { id: contact.id } });
    assert.equal(cleared.job_title, null);
    assert.equal(cleared.notes, null);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "vendor.updated", entity_id: vendor.vendorId } }), auditCount + 1);
  });

  it("keeps BrandSupplier mutation on Brand and exposes only a read projection on Supplier", async () => {
    const supplier = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Projection Supplier" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({
      data: { id: crypto.randomUUID(), vendor_id: supplier.vendorId, vendor_type_id: supplierType.id },
    });
    const brand = await service.createBrand({
      grants: GRANTS,
      actor: ACTOR,
      name: "Owned Catalog Brand",
      links: [{ kind: "catalog", url: "https://example.com/catalog" }],
      suppliers: [{ vendorId: supplier.vendorId, isAuthorized: true }],
    });

    const storedRelation = await testDb.prisma.brandSupplier.findFirstOrThrow({
      where: { brand_id: brand.brandId, vendor_id: supplier.vendorId },
    });
    assert.equal(storedRelation.is_authorized, true);
    const supplierProjection = await service.getVendor({ grants: GRANTS, vendorId: supplier.vendorId });
    assert.deepEqual(supplierProjection.brand_suppliers.map((row) => row.brand.name), ["Owned Catalog Brand"]);
    assert.equal("links" in supplierProjection, false);
    assert.equal(await testDb.prisma.brandLink.count({ where: { brand_id: brand.brandId } }), 1);
  });

  it("cascades Brand lifecycle with provenance and purges only its branded catalog", async () => {
    const context = await createMaterialContext();
    const sku = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Lifecycle SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "100", currency: "IDR" }],
    });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: sku.skuId } });
    const unbranded = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Independent SKU", baseUnitId: context.unit.id,
      categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "200", currency: "IDR" }],
    });

    await service.archiveBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId });
    assert.notEqual((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: sku.skuId } })).deleted_at, null);
    assert.notEqual((await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: price.id } })).deleted_at, null);
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: unbranded.skuId } })).deleted_at, null);

    await service.restoreBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: sku.skuId } })).deleted_at, null);
    assert.equal((await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: price.id } })).deleted_at, null);

    await service.archiveBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId });
    const request = await service.requestBrandDeletion({ grants: GRANTS, actor: ACTOR, brandId: context.brandId });
    await service.approveDeletion({ grants: GRANTS, actor: ACTOR, requestId: request.requestId });
    assert.equal(await testDb.prisma.brand.findUnique({ where: { id: context.brandId } }), null);
    assert.equal(await testDb.prisma.brandSupplier.count({ where: { brand_id: context.brandId } }), 0, "the supplier links went with the archived Brand");
    assert.equal(await testDb.prisma.sku.findUnique({ where: { id: sku.skuId } }), null);
    assert.equal(await testDb.prisma.priceMaterial.findUnique({ where: { id: price.id } }), null);
    assert.notEqual(await testDb.prisma.sku.findUnique({ where: { id: unbranded.skuId } }), null);
  });

  it("preserves direct SKU and Price causes when a Brand is restored", async () => {
    const context = await createMaterialContext();
    const alternateVendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Alternate Lifecycle Supplier" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({
      data: { id: crypto.randomUUID(), vendor_id: alternateVendor.vendorId, vendor_type_id: supplierType.id },
    });
    await linkBrand(context.brandId, alternateVendor.vendorId);
    const directSku = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Direct Archived SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "110", currency: "IDR" }],
    });
    const liveSku = await service.createSku({
      grants: GRANTS, actor: ACTOR, name: "Direct Archived Price SKU", brandId: context.brandId,
      baseUnitId: context.unit.id, categoryId: context.categoryId,
      priceMaterials: [
        { supplierVendorId: context.vendorId, amount: "120", currency: "IDR" },
        { supplierVendorId: alternateVendor.vendorId, amount: "125", currency: "IDR" },
      ],
    });
    const directSkuPrice = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: directSku.skuId } });
    const directPrice = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: liveSku.skuId, supplier_vendor_id: context.vendorId } });

    await service.archiveSku({ grants: GRANTS, actor: ACTOR, skuId: directSku.skuId });
    await service.archivePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: directPrice.id });
    await service.archiveBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId });
    await service.restoreBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId });

    assert.notEqual((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: directSku.skuId } })).deleted_at, null);
    assert.notEqual((await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: directSkuPrice.id } })).deleted_at, null);
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: liveSku.skuId } })).deleted_at, null);
    assert.notEqual((await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: directPrice.id } })).deleted_at, null);
    assert.equal(await testDb.prisma.archiveCause.count({ where: { entity_type: "sku", entity_id: directSku.skuId, kind: "DIRECT" } }), 1);
    assert.equal(await testDb.prisma.archiveCause.count({ where: { entity_type: "price_material", entity_id: directPrice.id, kind: "DIRECT" } }), 1);
  });

  it("executes approved permanent deletion atomically and preserves the final audit event", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "TEST_BOX", name: "Test Box" });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });
    const request = await service.requestUnitDeletion({
      grants: GRANTS,
      actor: ACTOR,
      unitId: created.unitId,
      reason: "Unused test dictionary value",
    });
    await service.approveDeletion({ grants: GRANTS, actor: ACTOR, requestId: request.requestId });

    assert.equal(await testDb.prisma.unit.findUnique({ where: { id: created.unitId } }), null);
    const decision = await testDb.prisma.deletionRequest.findUniqueOrThrow({ where: { id: request.requestId } });
    assert.equal(decision.status, "APPROVED");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "unit.deleted", entity_id: created.unitId } }), 1);
  });

  it("lets the deletion approver hard-delete without creating a request", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "DIRECT_DELETE", name: "Direct Delete" });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });

    const result = await service.hardDeleteArchived({
      grants: GRANTS,
      actor: ACTOR,
      targetType: "unit",
      targetId: created.unitId,
    });

    assert.equal(result?.direct, true);
    assert.equal(await testDb.prisma.unit.findUnique({ where: { id: created.unitId } }), null);
    assert.equal(await testDb.prisma.deletionRequest.count({ where: { target_id: created.unitId } }), 0);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "unit.deleted", entity_id: created.unitId } }), 1);
  });

  it("permanently deletes an archived Supplier that has categories, contacts and types", async () => {
    const { categoryId } = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: `Category with supplier ${crypto.randomUUID().slice(0, 8)}`, kind: "WORK" });
    const { vendorId } = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: `Supplier With Category ${crypto.randomUUID().slice(0, 8)}`, categoryIds: [categoryId] });
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { vendor_id: vendorId } }), 1);
    await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId });

    const result = await service.hardDeleteArchived({ grants: GRANTS, actor: ACTOR, targetType: "vendor", targetId: vendorId });

    assert.equal(result?.direct, true);
    assert.equal(await testDb.prisma.vendor.findUnique({ where: { id: vendorId } }), null);
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { vendor_id: vendorId } }), 0);
    assert.equal(await testDb.prisma.category.count({ where: { id: categoryId } }), 1, "the category itself stays");
  });

  it("files a supplier under the category of every work price saved for it", async () => {
    const subconType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const mep = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: `MEP ${crypto.randomUUID().slice(0, 6)}`, kind: "WORK" });
    const finishing = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: `Finishing ${crypto.randomUUID().slice(0, 6)}`, kind: "WORK" });
    const { vendorId } = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: `Category Link Vendor ${crypto.randomUUID().slice(0, 6)}`, vendorTypeIds: [subconType.id], categoryIds: [mep.categoryId] });

    await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "Finishing job", categoryId: finishing.categoryId, vendorId, unitId: unit.id, amount: "10", currency: "IDR" });
    await service.createPriceMaterialLabor({ grants: GRANTS, actor: ACTOR, name: "MEP job", categoryId: mep.categoryId, vendorId, unitId: unit.id, amount: "20", currency: "IDR" });

    const linked = (await testDb.prisma.vendorCategory.findMany({ where: { vendor_id: vendorId } })).map((row) => row.category_id).sort();
    assert.deepEqual(linked, [mep.categoryId, finishing.categoryId].sort(), "the new category joins the existing one and nothing is duplicated");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "vendor.categories-linked", entity_id: vendorId } }), 1, "only the genuinely new link is audited");
  });

  it("will not take a category off a supplier while live prices still use it", async () => {
    const subconType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const trade = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: `Guarded trade ${crypto.randomUUID().slice(0, 6)}`, kind: "WORK" });
    const { vendorId } = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: `Guarded Category Vendor ${crypto.randomUUID().slice(0, 6)}`, vendorTypeIds: [subconType.id], categoryIds: [trade.categoryId] });
    const { priceLaborId } = await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "Guarded job", categoryId: trade.categoryId, vendorId, unitId: unit.id, amount: "10", currency: "IDR" });

    await assert.rejects(
      () => service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId, name: "Guarded Category Vendor", categoryIds: [] }),
      (error: unknown) => error instanceof AppError && error.code === "VENDOR_CATEGORY_IN_USE",
    );

    await service.archivePriceLabor({ grants: GRANTS, actor: ACTOR, priceLaborId });
    await service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId, name: "Guarded Category Vendor", categoryIds: [] });
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { vendor_id: vendorId } }), 0);
  });

  it("moves supplier categories onto the surviving category when two categories are merged", async () => {
    const source = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: `Merge source ${crypto.randomUUID().slice(0, 6)}`, kind: "WORK" });
    const target = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: `Merge target ${crypto.randomUUID().slice(0, 6)}`, kind: "WORK" });
    const onlySource = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: `Merge only source ${crypto.randomUUID().slice(0, 6)}`, categoryIds: [source.categoryId] });
    const both = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: `Merge both ${crypto.randomUUID().slice(0, 6)}`, categoryIds: [source.categoryId, target.categoryId] });

    await service.mergeCategory({ grants: GRANTS, actor: ACTOR, sourceCategoryId: source.categoryId, targetCategoryId: target.categoryId });

    assert.equal(await testDb.prisma.vendorCategory.count({ where: { category_id: source.categoryId } }), 0);
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { vendor_id: onlySource.vendorId, category_id: target.categoryId } }), 1);
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { vendor_id: both.vendorId, category_id: target.categoryId } }), 1, "no duplicate link for a supplier that already had the target");
  });

  it("reuses an existing pending deletion request instead of creating a duplicate for the same target", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "DUP_REQUEST", name: "Duplicate Request" });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });

    const first = await service.requestUnitDeletion({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, reason: "First request" });
    const second = await service.requestUnitDeletion({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, reason: "Second request" });

    assert.equal(second.requestId, first.requestId);
    assert.equal(await testDb.prisma.deletionRequest.count({ where: { target_id: created.unitId, status: "PENDING" } }), 1);
  });

  it("direct hard-delete resolves a pre-existing pending request instead of stranding it", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "DIRECT_RESOLVES", name: "Direct Resolves Pending" });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });
    const request = await service.requestUnitDeletion({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });

    const result = await service.hardDeleteArchived({ grants: GRANTS, actor: ACTOR, targetType: "unit", targetId: created.unitId });

    assert.equal(result?.direct, true);
    assert.equal(await testDb.prisma.unit.findUnique({ where: { id: created.unitId } }), null);
    const decision = await testDb.prisma.deletionRequest.findUniqueOrThrow({ where: { id: request.requestId } });
    assert.equal(decision.status, "APPROVED", "the pending request must be resolved, not left stuck pointing at a deleted target");
  });

  it("keeps a deletion request pending when its archived target is restored before approval", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "RESTORE_GUARD", name: "Restore Guard" });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });
    const request = await service.requestUnitDeletion({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });
    await service.restoreUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId });

    await assert.rejects(
      service.approveDeletion({ grants: GRANTS, actor: ACTOR, requestId: request.requestId }),
      (error: unknown) => error instanceof AppError && error.code === "UNIT_NOT_ARCHIVED",
    );

    assert.equal(await testDb.prisma.unit.findUnique({ where: { id: created.unitId } }).then((unit) => unit?.status), "ACTIVE");
    assert.equal(
      await testDb.prisma.deletionRequest.findUniqueOrThrow({ where: { id: request.requestId } }).then((decision) => decision.status),
      "PENDING",
    );
  });
  it("blocks category deactivation for each live family and permits it after a merge", async () => {
    const context = await createMaterialContext();
    const skuCategory = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Used by SKU", kind: "PRODUCT" });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Category SKU", baseUnitId: context.unit.id, categoryId: skuCategory.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });
    await assert.rejects(service.deactivateCategory({ grants: GRANTS, actor: ACTOR, categoryId: skuCategory.categoryId }), (error: unknown) => error instanceof AppError && error.code === "CATEGORY_IN_USE");
    const brandCategory = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Used by Brand", kind: "PRODUCT" });
    await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Category Brand", categoryIds: [brandCategory.categoryId] });
    await assert.rejects(service.deactivateCategory({ grants: GRANTS, actor: ACTOR, categoryId: brandCategory.categoryId }), (error: unknown) => error instanceof AppError && error.code === "CATEGORY_IN_USE");
    const vendorCategory = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Used by Supplier", kind: "PRODUCT" });
    await service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId, name: "Supplier One", categoryIds: [vendorCategory.categoryId] });
    await assert.rejects(service.deactivateCategory({ grants: GRANTS, actor: ACTOR, categoryId: vendorCategory.categoryId }), (error: unknown) => error instanceof AppError && error.code === "CATEGORY_IN_USE");
    const workCategory = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Used by Work Price", kind: "WORK" });
    const laborType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SERVICE" } });
    await service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: context.vendorId, name: "Supplier One", vendorTypeIds: [(await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } })).id, laborType.id] });
    await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "Category labor", categoryId: workCategory.categoryId, vendorId: context.vendorId, unitId: context.unit.id, amount: "1", currency: "IDR" });
    await assert.rejects(service.deactivateCategory({ grants: GRANTS, actor: ACTOR, categoryId: workCategory.categoryId }), (error: unknown) => error instanceof AppError && error.code === "CATEGORY_IN_USE");
    const target = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Merged target", kind: "PRODUCT" });
    await service.mergeCategory({ grants: GRANTS, actor: ACTOR, sourceCategoryId: skuCategory.categoryId, targetCategoryId: target.categoryId });
    assert.equal((await testDb.prisma.category.findUniqueOrThrow({ where: { id: skuCategory.categoryId } })).status, "DEACTIVATED");
  });

  it("blocks archiving a capability in use, permits an unused type, and rejects every archived root update", async () => {
    const context = await createMaterialContext();
    const materialType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Type guard SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });
    await assert.rejects(service.archiveVendorType({ grants: GRANTS, actor: ACTOR, vendorTypeId: materialType.id }), (error: unknown) => error instanceof AppError && error.code === "VENDOR_MATERIAL_CAPABILITY_IN_USE");
    const unused = await service.createVendorType({ grants: GRANTS, actor: ACTOR, code: "UNUSED_TEST", name: "Unused type", canSupplyMaterial: true });
    await service.archiveVendorType({ grants: GRANTS, actor: ACTOR, vendorTypeId: unused.vendorTypeId });
    await assert.rejects(service.updateVendorType({ grants: GRANTS, actor: ACTOR, vendorTypeId: unused.vendorTypeId, name: "Unused type", canSupplyMaterial: true, canSupplyLabor: false }), (error: unknown) => error instanceof AppError && error.code === "VENDOR_TYPE_ARCHIVED");
    const unit = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "ARCH_ROOT", name: "Archived root" }); await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: unit.unitId });
    await assert.rejects(service.updateUnit({ grants: GRANTS, actor: ACTOR, unitId: unit.unitId, code: "ARCH_ROOT", name: "Changed" }), (error: unknown) => error instanceof AppError && error.code === "UNIT_ARCHIVED");
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Archived category", kind: "PRODUCT" }); await service.deactivateCategory({ grants: GRANTS, actor: ACTOR, categoryId: category.categoryId });
    await assert.rejects(service.updateCategory({ grants: GRANTS, actor: ACTOR, categoryId: category.categoryId, name: "Changed" }), (error: unknown) => error instanceof AppError && error.code === "CATEGORY_INACTIVE");
    const brand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Archived brand" }); await service.archiveBrand({ grants: GRANTS, actor: ACTOR, brandId: brand.brandId });
    await assert.rejects(service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId: brand.brandId, name: "Changed" }), (error: unknown) => error instanceof AppError && error.code === "BRAND_ARCHIVED");
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Archived vendor" }); await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId: vendor.vendorId });
    await assert.rejects(service.updateVendor({ grants: GRANTS, actor: ACTOR, vendorId: vendor.vendorId, name: "Changed" }), (error: unknown) => error instanceof AppError && error.code === "VENDOR_ARCHIVED");
  });
});

describe("Brand → Supplier → Price chain", () => {
  async function unlinkedSupplier(name: string) {
    const type = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor.vendorId, vendor_type_id: type.id } });
    return vendor.vendorId;
  }
  const rejectsWith = (work: () => Promise<unknown>, code: string) => assert.rejects(work, (error: unknown) => error instanceof AppError && error.code === code);

  it("prices a branded SKU only for a supplier that carries the Brand, and linking is idempotent and audited", async () => {
    const context = await createMaterialContext();
    const other = await unlinkedSupplier("Chain Other Supplier");
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Chain SKU", brandId: context.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "10", currency: "IDR" }] });

    await rejectsWith(() => service.createPriceMaterial({ grants: GRANTS, actor: ACTOR, skuId, supplierVendorId: other, amount: "11", currency: "IDR" }), "PRICE_BRAND_SUPPLIER_NOT_LINKED");
    await rejectsWith(() => service.createSku({ grants: GRANTS, actor: ACTOR, name: "Chain SKU Two", brandId: context.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: other, amount: "5", currency: "IDR" }] }), "PRICE_BRAND_SUPPLIER_NOT_LINKED");

    await service.linkBrandToSupplier({ grants: GRANTS, actor: ACTOR, brandId: context.brandId, vendorId: other });
    await service.linkBrandToSupplier({ grants: GRANTS, actor: ACTOR, brandId: context.brandId, vendorId: other });
    assert.equal(await testDb.prisma.brandSupplier.count({ where: { brand_id: context.brandId, vendor_id: other } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "brand.supplier-linked", entity_id: context.brandId } }), 1, "the second call changes nothing and writes nothing");
    await service.createPriceMaterial({ grants: GRANTS, actor: ACTOR, skuId, supplierVendorId: other, amount: "11", currency: "IDR" });
  });

  it("lets a Brand's owner and any supplier of an unbranded SKU price without a link", async () => {
    const context = await createMaterialContext();
    const owner = await unlinkedSupplier("Chain Owner Supplier");
    const stranger = await unlinkedSupplier("Chain Stranger Supplier");
    const owned = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Chain Owned Brand", ownerVendorId: owner });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Owned SKU", brandId: owned.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: owner, amount: "1", currency: "IDR" }] });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Unbranded SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: stranger, amount: "2", currency: "IDR" }] });
  });

  it("blocks unlinking a supplier while live prices depend on it, and refuses to restore a price whose supplier no longer carries the Brand", async () => {
    const context = await createMaterialContext();
    const second = await unlinkedSupplier("Chain Second Supplier");
    await service.linkBrandToSupplier({ grants: GRANTS, actor: ACTOR, brandId: context.brandId, vendorId: second });
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Unlink SKU", brandId: context.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "10", currency: "IDR" }, { supplierVendorId: second, amount: "12", currency: "IDR" }] });
    await rejectsWith(() => service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId, name: "Panel Brand", suppliers: [{ vendorId: second }] }), "BRAND_SUPPLIER_IN_USE");

    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId, supplier_vendor_id: context.vendorId } });
    await service.archivePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id });
    await service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId: context.brandId, name: "Panel Brand", suppliers: [{ vendorId: second }] });
    assert.equal(await testDb.prisma.brandSupplier.count({ where: { brand_id: context.brandId, vendor_id: context.vendorId } }), 0);

    await rejectsWith(() => service.restorePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id }), "PRICE_BRAND_SUPPLIER_NOT_LINKED");
  });

  it("will not let a Brand lose the owner that still has live prices", async () => {
    const context = await createMaterialContext();
    const owner = await unlinkedSupplier("Chain Former Owner");
    const successor = await unlinkedSupplier("Chain Successor");
    const owned = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Chain Handover Brand", ownerVendorId: owner });
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Handover SKU", brandId: owned.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: owner, amount: "1", currency: "IDR" }] });
    await rejectsWith(() => service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId: owned.brandId, name: "Chain Handover Brand", ownerVendorId: successor }), "BRAND_OWNER_IN_USE");
    await service.updateBrand({ grants: GRANTS, actor: ACTOR, brandId: owned.brandId, name: "Chain Handover Brand", ownerVendorId: successor, suppliers: [{ vendorId: owner }] });
  });

  it("exposes the Brands each material supplier can price", async () => {
    const context = await createMaterialContext();
    const refs = await service.listPricingMaterialRefs({ grants: GRANTS });
    const supplier = refs.vendors.find((vendor) => vendor.id === context.vendorId);
    assert.deepEqual(supplier?.brandIds, [context.brandId]);
  });
});

describe("Bulk price entry", () => {
  async function workSupplier(name: string) {
    const subcon = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor.vendorId, vendor_type_id: subcon.id } });
    return vendor.vendorId;
  }
  const bulkRows = (error: unknown) => (error as { details?: { rows?: Array<{ rowIndex: number; field: string | null; code: string }> } }).details?.rows ?? [];

  it("creates many labor prices at once, files the supplier under the category once, and audits each price plus the batch", async () => {
    const vendorId = await workSupplier("Bulk Supplier");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Bulk Floor Works", kind: "WORK" });

    const result = await service.createWorkPricesBulk({ grants: GRANTS, actor: ACTOR, kind: "labor", vendorId, categoryId: category.categoryId, currency: "IDR", rows: [
      { name: "Screeding base", unitId: unit.id, amount: "120000", notes: "ex. mortar 1:3" },
      { name: "Install floor", unitId: unit.id, amount: "135000" },
      { name: "Lease line", unitId: unit.id, amount: "150000", notes: "inlay stainless" },
    ] });

    assert.equal(result.ids.length, 3);
    assert.equal(await testDb.prisma.priceLabor.count({ where: { vendor_id: vendorId, category_id: category.categoryId } }), 3);
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { vendor_id: vendorId, category_id: category.categoryId } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-labor.created", entity_id: { in: result.ids } } }), 3);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-bulk.created", entity_id: vendorId } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "vendor.categories-linked", entity_id: vendorId } }), 1);
  });

  it("saves nothing when any row is wrong and reports every problem row together", async () => {
    const vendorId = await workSupplier("Bulk All Or Nothing");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Bulk Ceiling Works", kind: "WORK" });
    await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "Existing item", categoryId: category.categoryId, vendorId, unitId: unit.id, amount: "1", currency: "IDR" });
    const before = await testDb.prisma.priceLabor.count();
    const auditBefore = await testDb.prisma.auditEvent.count({ where: { action: "price-labor.created" } });

    await assert.rejects(
      () => service.createWorkPricesBulk({ grants: GRANTS, actor: ACTOR, kind: "labor", vendorId, categoryId: category.categoryId, currency: "IDR", rows: [
        { name: "Fine item", unitId: unit.id, amount: "10" },
        { name: "Existing item", unitId: unit.id, amount: "11" },
        { name: "Bad amount", unitId: unit.id, amount: "-5" },
        { name: "fine item", unitId: unit.id, amount: "12" },
      ] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError && error.code === "BULK_ROWS_INVALID");
        const rows = bulkRows(error);
        assert.deepEqual(rows.map((row) => row.rowIndex), [1, 2, 3]);
        assert.equal(rows[0].code, "PRICE_IDENTITY_CONFLICT");
        assert.equal(rows[2].code, "BULK_DUPLICATE_IN_BATCH");
        return true;
      },
    );
    assert.equal(await testDb.prisma.priceLabor.count(), before, "the valid first row was rolled back too");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-labor.created" } }), auditBefore);
  });

  it("saves material prices where each row names its own supplier, reports every bad row, and writes one batch event", async () => {
    const context = await createMaterialContext();
    const second = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Row Supplier Two" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: second.vendorId, vendor_type_id: supplierType.id } });
    const sku = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Row SKU", code: "TH001AA", brandId: context.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "100", currency: "IDR" }] });
    await linkBrand(context.brandId, second.vendorId);
    const other = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Row SKU Two", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });

    await assert.rejects(
      () => service.createMaterialPriceRows({ grants: GRANTS, actor: ACTOR, currency: "IDR", rows: [
        { skuId: sku.skuId, vendorId: second.vendorId, amount: "120" },
        { skuId: sku.skuId, vendorId: context.vendorId, amount: "130" },
        { skuId: other.skuId, vendorId: second.vendorId, amount: "5" },
        { skuId: other.skuId, vendorId: second.vendorId, amount: "6" },
      ] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError && error.code === "BULK_ROWS_INVALID");
        assert.deepEqual(bulkRows(error).map((row) => [row.rowIndex, row.code]), [[1, "PRICE_PAIR_CONFLICT"], [3, "BULK_DUPLICATE_IN_BATCH"]]);
        return true;
      },
    );
    assert.equal(await testDb.prisma.priceMaterial.count({ where: { supplier_vendor_id: second.vendorId } }), 0, "the valid rows were rolled back too");

    const ok = await service.createMaterialPriceRows({ grants: GRANTS, actor: ACTOR, currency: "IDR", rows: [{ skuId: sku.skuId, vendorId: second.vendorId, amount: "120" }, { skuId: other.skuId, vendorId: second.vendorId, amount: "5", notes: "quote 1" }] });
    assert.equal(ok.ids.length, 2);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-bulk.created", entity_id: second.vendorId } }), 1);
  });

  it("treats names that differ only in spacing or case as the same price inside one batch, with a row error rather than a failed save", async () => {
    const vendorId = await workSupplier("Bulk Slug Supplier");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Bulk Slug Works", kind: "WORK" });
    await assert.rejects(
      () => service.createWorkPricesBulk({ grants: GRANTS, actor: ACTOR, kind: "labor", vendorId, categoryId: category.categoryId, currency: "IDR", rows: [
        { name: "Screeding  base", unitId: unit.id, amount: "1" },
        { name: "screeding base", unitId: unit.id, amount: "2" },
      ] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError && error.code === "BULK_ROWS_INVALID");
        assert.deepEqual(bulkRows(error).map((row) => [row.rowIndex, row.code]), [[1, "BULK_DUPLICATE_IN_BATCH"]]);
        return true;
      },
    );
  });

  it("limits a batch to 100 rows and rejects an empty one", async () => {
    const vendorId = await workSupplier("Bulk Limits");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Bulk Limits Works", kind: "WORK" });
    const base = { grants: GRANTS, actor: ACTOR, kind: "labor" as const, vendorId, categoryId: category.categoryId, currency: "IDR" };
    await assert.rejects(() => service.createWorkPricesBulk({ ...base, rows: [] }), (error: unknown) => error instanceof AppError && error.code === "BULK_EMPTY");
    const many = Array.from({ length: 101 }, (_, index) => ({ name: `Item ${index}`, unitId: unit.id, amount: "1" }));
    await assert.rejects(() => service.createWorkPricesBulk({ ...base, rows: many }), (error: unknown) => error instanceof AppError && error.code === "BULK_TOO_MANY_ROWS");
  });

  it("creates many material prices for existing SKUs and applies the supplier chain rule per row", async () => {
    const context = await createMaterialContext();
    const stranger = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Bulk Stranger Brand" });
    const mk = (name: string, brandId?: string) => service.createSku({ grants: GRANTS, actor: ACTOR, name, ...(brandId ? { brandId } : {}), baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });
    const second = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Bulk Material Supplier" });
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: second.vendorId, vendor_type_id: supplierType.id } });
    await linkBrand(context.brandId, second.vendorId);
    const linked = await mk("Bulk linked SKU", context.brandId);
    const unbranded = await mk("Bulk unbranded SKU");
    const unlinked = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Bulk unlinked SKU", brandId: stranger.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] }).catch(() => null);
    assert.equal(unlinked, null, "the context supplier is not linked to the stranger Brand");
    await linkBrand(stranger.brandId, context.vendorId);
    const strangerSku = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Bulk stranger SKU", brandId: stranger.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }] });

    await assert.rejects(
      () => service.createMaterialPricesBulk({ grants: GRANTS, actor: ACTOR, vendorId: second.vendorId, currency: "IDR", rows: [{ skuId: linked.skuId, amount: "10" }, { skuId: strangerSku.skuId, amount: "11" }, { skuId: unbranded.skuId, amount: "12" }] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError && error.code === "BULK_ROWS_INVALID");
        assert.deepEqual(bulkRows(error).map((row) => [row.rowIndex, row.code]), [[1, "PRICE_BRAND_SUPPLIER_NOT_LINKED"]]);
        return true;
      },
    );
    assert.equal(await testDb.prisma.priceMaterial.count({ where: { supplier_vendor_id: second.vendorId } }), 0);

    const ok = await service.createMaterialPricesBulk({ grants: GRANTS, actor: ACTOR, vendorId: second.vendorId, currency: "IDR", rows: [{ skuId: linked.skuId, amount: "10" }, { skuId: unbranded.skuId, amount: "12", notes: "bulk" }] });
    assert.equal(ok.ids.length, 2);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-bulk.created", entity_id: second.vendorId } }), 1);
  });
});

describe("Compare-suppliers grid", () => {
  async function workSupplier(name: string) {
    const subcon = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor.vendorId, vendor_type_id: subcon.id } });
    return vendor.vendorId;
  }

  it("creates one price per filled cell, skips blank cells, and files each supplier under the category", async () => {
    const a = await workSupplier("Grid Supplier A");
    const b = await workSupplier("Grid Supplier B");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Grid Floor Works", kind: "WORK" });

    const result = await service.createWorkPriceMatrix({ grants: GRANTS, actor: ACTOR, kind: "labor", categoryId: category.categoryId, currency: "IDR", vendorIds: [a, b], rows: [
      { name: "Screeding base", unitId: unit.id, notes: "mortar", amounts: { [a]: "120000", [b]: "135000" } },
      { name: "Lease line", unitId: unit.id, amounts: { [a]: "150000", [b]: "" } },
      { name: "Cove ceiling", unitId: unit.id, amounts: { [b]: "170000" } },
    ] });

    assert.equal(result.ids.length, 4);
    assert.equal(await testDb.prisma.priceLabor.count({ where: { vendor_id: a } }), 2);
    assert.equal(await testDb.prisma.priceLabor.count({ where: { vendor_id: b } }), 2);
    assert.equal(await testDb.prisma.vendorCategory.count({ where: { category_id: category.categoryId, vendor_id: { in: [a, b] } } }), 2);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-matrix.created", entity_id: category.categoryId } }), 1);
  });

  it("rolls the whole grid back when one supplier's cell is wrong and names the supplier and row", async () => {
    const a = await workSupplier("Grid Rollback A");
    const b = await workSupplier("Grid Rollback B");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Grid Rollback Works", kind: "WORK" });
    await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "Existing item", categoryId: category.categoryId, vendorId: b, unitId: unit.id, amount: "1", currency: "IDR" });
    const before = await testDb.prisma.priceLabor.count();

    await assert.rejects(
      () => service.createWorkPriceMatrix({ grants: GRANTS, actor: ACTOR, kind: "labor", categoryId: category.categoryId, currency: "IDR", vendorIds: [a, b], rows: [
        { name: "Fine item", unitId: unit.id, amounts: { [a]: "10", [b]: "11" } },
        { name: "Existing item", unitId: unit.id, amounts: { [a]: "12", [b]: "13" } },
      ] }),
      (error: unknown) => {
        assert.ok(error instanceof AppError && error.code === "BULK_ROWS_INVALID");
        const rows = (error.details as { rows: Array<{ rowIndex: number; vendorId: string; code: string }> }).rows;
        assert.deepEqual(rows.map((row) => [row.rowIndex, row.vendorId, row.code]), [[1, b, "PRICE_IDENTITY_CONFLICT"]]);
        return true;
      },
    );
    assert.equal(await testDb.prisma.priceLabor.count(), before, "supplier A's valid cells were rolled back too");
  });

  it("limits suppliers, requires an amount somewhere, and keeps blank grids out", async () => {
    const a = await workSupplier("Grid Limits A");
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Grid Limits Works", kind: "WORK" });
    const base = { grants: GRANTS, actor: ACTOR, kind: "labor" as const, categoryId: category.categoryId, currency: "IDR" };
    await assert.rejects(() => service.createWorkPriceMatrix({ ...base, vendorIds: [], rows: [{ name: "x", unitId: unit.id, amounts: {} }] }), (error: unknown) => error instanceof AppError && error.code === "BULK_EMPTY");
    await assert.rejects(() => service.createWorkPriceMatrix({ ...base, vendorIds: [a], rows: [{ name: "Blank", unitId: unit.id, amounts: { [a]: "" } }] }), (error: unknown) => error instanceof AppError && error.code === "BULK_EMPTY");
    const many = Array.from({ length: 13 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    await assert.rejects(() => service.createWorkPriceMatrix({ ...base, vendorIds: many, rows: [{ name: "x", unitId: unit.id, amounts: {} }] }), (error: unknown) => error instanceof AppError && error.code === "BULK_TOO_MANY_SUPPLIERS");
  });
});

describe("Supplier and price database workbook", () => {
  async function ownerStyleWorkbook(extraItem?: (ws: ExcelJS.Worksheet) => void) {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("📋 COVER").addRow(["DATABASE HARGA INTERNAL"]);
    const subcon = wb.addWorksheet("Database - SUBCON");
    subcon.addRow(["DATABASE SUBCON — INTERIOR CONSTRUCTION"]);
    subcon.addRow(["Daftar supplier yang telah digunakan"]);
    subcon.addRow(["No", "Nama Subcon", "Kategori Pekerjaan", "Alamat", "No. HP / WA", "No. HP / WA 2", "Email", "IG / Website", "Nama PIC", "Termin Pembayaran", "Catatan"]);
    subcon.addRow([1, "afa interindo", "Furniture, Stairs", "Jl. Pondok Jagung No. 55", "0813-1562-2561", "-", "info@afa.example", "Instagram", "Ahmad Amin", "Termin", "-"]);
    subcon.addRow([2, "Sono Sipil", "Sipil", "-", "0812-0000-1111", "-", "-", "-", "-", "-", "-"]);
    const sipil = wb.addWorksheet("Database Harga - Sipil");
    sipil.addRow(["DATABASE HARGA SIPIL"]);
    sipil.addRow(["Terakhir Update: 26 June 2026"]);
    sipil.addRow(["No", "Nama Material", "Spesifikasi", "Satuan", "Surojoyo Kreasindo (Pak Joyo)", "Sono Sipil", "Catatan / Merk Referensi"]);
    sipil.addRow(["FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS"]);
    sipil.mergeCells("A4:G4");
    sipil.addRow(["-", "Screeding base", "-", "m2", 120000, "135.000", ""]);
    sipil.addRow(["-", "Supply & install floor", "Finish storage ex. Asia Tile", "m2", "Rp 135.000", "-", "Ref 2026-1"]);
    sipil.addRow(["-", "Lease line MT1", "ex. inlay stainless", "m", "By Request", 100000, ""]);
    extraItem?.(sipil);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const importAs = (file: Buffer) => ({ grants: GRANTS, actor: ACTOR, file, options: { priceKind: "labor" as const } });

  it("reads an owner-style workbook: suppliers by type sheet, section headings as categories, a matrix of amounts, and tolerates dashes and By Request", async () => {
    const file = await ownerStyleWorkbook();
    const preview = await service.previewPriceDatabaseImport(importAs(file));
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.totals.suppliersCreated, 2);
    assert.equal(preview.totals.suppliersFromPrices, 1, "Surojoyo Kreasindo only exists as a price column");
    assert.equal(preview.totals.pricesCreated, 5, "By Request is kept as a price of 0");
    assert.equal(await testDb.prisma.vendor.count(), 0, "a preview saves nothing");

    const applied = await service.applyPriceDatabaseImport({ ...importAs(file), hash: preview.hash });
    assert.equal(applied.totals.pricesCreated, 5);
    const afa = await testDb.prisma.vendor.findFirstOrThrow({ where: { name: "Afa Interindo" }, include: { contacts: true, categories: { include: { category: true } }, types: { include: { vendor_type: true } } } });
    assert.equal(afa.types[0].vendor_type.code, "SUBCON");
    assert.deepEqual(afa.categories.map((c) => c.category.name).sort(), ["Furniture", "Stairs"]);
    assert.equal(afa.contacts[0].person_name, "Ahmad Amin");
    assert.match(afa.notes ?? "", /Payment terms: Termin/);
    const joyo = await testDb.prisma.vendor.findFirstOrThrow({ where: { name: "Surojoyo Kreasindo" }, include: { contacts: true } });
    assert.equal(joyo.contacts[0].person_name, "Pak Joyo");
    const floor = await testDb.prisma.category.findFirstOrThrow({ where: { name: "Floor Works", kind: "WORK" } });
    assert.equal(await testDb.prisma.priceLabor.count({ where: { category_id: floor.id } }), 5);
    const onRequest = await testDb.prisma.priceLabor.findFirstOrThrow({ where: { name: "Lease Line MT1", vendor: { name: "Surojoyo Kreasindo" } } });
    assert.equal(onRequest.amount.toString(), "0", "By Request in the sheet is a price of 0 (on request)");
    const install = await testDb.prisma.priceLabor.findFirstOrThrow({ where: { name: "Supply & Install Floor", vendor: { name: "Surojoyo Kreasindo" } }, include: { unit: true } });
    assert.equal(install.amount.toString(), "135000");
    assert.equal(install.unit.code, "m2");
    assert.equal(install.notes, "Finish storage ex. Asia Tile · Ref: Ref 2026-1");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "price-database-workbook.applied" } }), 1);

    const again = await service.previewPriceDatabaseImport(importAs(file));
    assert.equal(again.totals.pricesCreated, 0);
    assert.equal(again.totals.pricesUnchanged, 5);
    assert.equal(again.totals.suppliersExisting, 2);
  });

  it("updates a changed amount on re-import and leaves everything else", async () => {
    const file = await ownerStyleWorkbook();
    const first = await service.previewPriceDatabaseImport(importAs(file));
    await service.applyPriceDatabaseImport({ ...importAs(file), hash: first.hash });
    const edited = await ownerStyleWorkbook();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("Database Harga - Sipil")!;
    ws.getRow(5).getCell(5).value = 125000; // Screeding base, first supplier
    const changed = Buffer.from(await wb.xlsx.writeBuffer());
    const preview = await service.previewPriceDatabaseImport(importAs(changed));
    assert.equal(preview.totals.pricesUpdated, 1);
    assert.equal(preview.totals.pricesUnchanged, 4);
    await service.applyPriceDatabaseImport({ ...importAs(changed), hash: preview.hash });
    const price = await testDb.prisma.priceLabor.findFirstOrThrow({ where: { name: "Screeding Base", vendor: { name: "Surojoyo Kreasindo" } } });
    assert.equal(price.amount.toString(), "125000");
  });

  it("reports unknown units and unreadable amounts with sheet and row, applies nothing, and accepts a default unit", async () => {
    const file = await ownerStyleWorkbook((ws) => { ws.addRow(["-", "Odd item", "", "kontainer", 5000, null, ""]); ws.addRow(["-", "Bad amount", "", "m2", "abc", null, ""]); });
    const preview = await service.previewPriceDatabaseImport(importAs(file));
    assert.ok(preview.errors.some((e) => e.sheet === "Database Harga - Sipil" && e.row === 8 && /kontainer/.test(e.message)));
    assert.ok(preview.errors.some((e) => e.row === 9 && /not a number/.test(e.message)));
    await assert.rejects(() => service.applyPriceDatabaseImport({ ...importAs(file), hash: preview.hash }), (error: unknown) => error instanceof AppError && error.code === "PRICE_DATABASE_IMPORT_ERRORS");
    assert.equal(await testDb.prisma.vendor.count(), 0, "all or nothing");
    assert.equal(await testDb.prisma.priceLabor.count(), 0);

    const fine = await ownerStyleWorkbook((ws) => { ws.addRow(["-", "Odd item", "", "kontainer", 5000, null, ""]); });
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "set" } });
    const withDefault = await service.previewPriceDatabaseImport({ ...importAs(fine), options: { priceKind: "labor", defaultUnitId: unit.id } });
    assert.deepEqual(withDefault.errors, []);
  });

  it("reads sub-headings as areas and tells apart the same item priced in different areas for one supplier", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Database Harga - Sipil");
    ws.addRow(["DATABASE HARGA SIPIL"]);
    ws.addRow(["Terakhir Update"]);
    ws.addRow(["No", "Nama Material", "Spesifikasi", "Surojoyo Kreasindo", "Sono Sipil", "Catatan / Merk Referensi"]);
    ws.addRow(["WALL WORKS", "WALL WORKS", "WALL WORKS", "WALL WORKS", "WALL WORKS", "WALL WORKS"]);
    ws.mergeCells("A4:F4");
    ws.addRow([null, "Shopfront Area"]);
    ws.addRow(["-", "Second Skin Partition", "ex. plywood 9mm", 250000, 215000, ""]);
    ws.addRow([null, "Store Area"]);
    ws.addRow(["-", "Second Skin Partition", "ex. gypsum 9mm", 210000, 215000, ""]);
    ws.addRow(["-", "Finish Emulsion Paint", "col. white", 55000, 55000, ""]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const options = { priceKind: "labor" as const, defaultUnitId: unit.id };
    const preview = await service.previewPriceDatabaseImport({ grants: GRANTS, actor: ACTOR, file, options });
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.totals.pricesCreated, 6);
    await service.applyPriceDatabaseImport({ grants: GRANTS, actor: ACTOR, file, options, hash: preview.hash });
    const names = (await testDb.prisma.priceLabor.findMany({ where: { vendor: { name: "Surojoyo Kreasindo" } }, orderBy: { name: "asc" } })).map((price) => [price.name, price.amount.toString()]);
    assert.deepEqual(names, [["Finish Emulsion Paint", "55000"], ["Second Skin Partition (Shopfront Area)", "250000"], ["Second Skin Partition (Store Area)", "210000"]]);
    const again = await service.previewPriceDatabaseImport({ grants: GRANTS, actor: ACTOR, file, options });
    assert.equal(again.totals.pricesUnchanged, 6, "importing the same file again changes nothing");
  });

  it("tells repeated items apart by their specification when they share the same area", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Database Harga - Sipil");
    ws.addRow(["DATABASE HARGA SIPIL"]);
    ws.addRow(["Terakhir Update"]);
    ws.addRow(["No", "Nama Material", "Spesifikasi", "Surojoyo Kreasindo", "Catatan / Merk Referensi"]);
    ws.addRow(["FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS", "FLOOR WORKS"]);
    ws.mergeCells("A4:E4");
    ws.addRow(["-", "Supply & Install Floor", "Finish HT2 ex. Niro GCA01 Lilac", 135000, ""]);
    ws.addRow(["-", "Supply & Install Floor", "Finish storage ex. Asia Tile 300x300", 165000, ""]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const options = { priceKind: "labor" as const, defaultUnitId: unit.id };
    const preview = await service.previewPriceDatabaseImport({ grants: GRANTS, actor: ACTOR, file, options });
    assert.deepEqual(preview.errors, []);
    await service.applyPriceDatabaseImport({ grants: GRANTS, actor: ACTOR, file, options, hash: preview.hash });
    const names = (await testDb.prisma.priceLabor.findMany({ orderBy: { name: "asc" } })).map((price) => price.name);
    assert.deepEqual(names, ["Supply & Install Floor (Finish HT2 Ex. Niro GCA01 Lilac)", "Supply & Install Floor (Finish Storage Ex. Asia Tile 300x300)"]);
  });

  it("exports in the import layout so an export can be edited and imported back unchanged", async () => {
    const a = (await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Round Trip A", vendorTypeIds: [(await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } })).id], contacts: [{ personName: "Budi", phones: ["0811"] }] })).vendorId;
    const b = (await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Round Trip B", vendorTypeIds: [(await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } })).id] })).vendorId;
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Round Trip Works", kind: "WORK" });
    await service.createWorkPricesBulk({ grants: GRANTS, actor: ACTOR, kind: "labor", vendorId: a, categoryId: category.categoryId, currency: "IDR", rows: [{ name: "Item One", unitId: unit.id, amount: "100", notes: "spec one" }, { name: "Item Two", unitId: unit.id, amount: "200" }, { name: "Item On Request", unitId: unit.id, amount: "0" }] });
    await service.createWorkPricesBulk({ grants: GRANTS, actor: ACTOR, kind: "labor", vendorId: b, categoryId: category.categoryId, currency: "IDR", rows: [{ name: "Item One", unitId: unit.id, amount: "110", notes: "spec one" }] });

    const exported = await service.exportPriceDatabase({ grants: GRANTS });
    assert.match(exported.filename, /\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exported.data as unknown as ExcelJS.Buffer);
    assert.ok(wb.getWorksheet("Database - Subcon"));
    assert.ok(wb.getWorksheet("Database Harga - Labor"));

    const preview = await service.previewPriceDatabaseImport({ grants: GRANTS, actor: ACTOR, file: exported.data, options: { priceKind: "labor" } });
    assert.deepEqual(preview.errors, []);
    assert.equal(preview.totals.pricesUnchanged, 4, "the on-request price exports as By Request and comes back as 0");
    assert.equal(preview.totals.pricesCreated + preview.totals.pricesUpdated, 0);
    assert.equal(preview.totals.suppliersExisting, 2);
  });
});

describe("Name capitalization", () => {
  it("stores typed names with the first letter of every word capitalized and everything else untouched", async () => {
    const type = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "m2" } });
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "  pt  mulia   sejahtera MEP ", legalName: "cv  maju jaya", vendorTypeIds: [type.id], contacts: [{ personName: "rachmat hidayat", jobTitle: "site manager", phones: ["0811"] }] });
    const row = await testDb.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.vendorId }, include: { contacts: true } });
    assert.equal(row.name, "Pt Mulia Sejahtera MEP");
    assert.equal(row.legal_name, "Cv Maju Jaya");
    assert.equal(row.contacts[0].person_name, "Rachmat Hidayat");
    assert.equal(row.contacts[0].job_title, "Site Manager");

    const category = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "floor works", kind: "WORK" });
    assert.equal((await testDb.prisma.category.findUniqueOrThrow({ where: { id: category.categoryId } })).name, "Floor Works");
    const price = await service.createPriceLabor({ grants: GRANTS, actor: ACTOR, name: "supply & install floor 60x60", categoryId: category.categoryId, vendorId: vendor.vendorId, unitId: unit.id, amount: "1", currency: "IDR" });
    assert.equal((await testDb.prisma.priceLabor.findUniqueOrThrow({ where: { id: price.priceLaborId } })).name, "Supply & Install Floor 60x60");
    const sku = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "granite tile", code: "gt-60x60 cm", baseUnitId: unit.id, categoryId: (await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "tile", kind: "PRODUCT" })).categoryId, priceMaterials: [{ supplierVendorId: vendor.vendorId, amount: "1", currency: "IDR" }] });
    const stored = await testDb.prisma.sku.findUniqueOrThrow({ where: { id: sku.skuId } });
    assert.equal(stored.name, "Granite Tile");
    assert.equal(stored.code, "gt-60x60 cm", "codes are never recased");
  });

  it("keeps tags lower case and names that differ only in case still conflict", async () => {
    const brand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "taco", hashtags: ["#Surface", "FINISH"] });
    const tags = await testDb.prisma.brandHashtag.findMany({ where: { brand_id: brand.brandId } });
    assert.deepEqual(tags.map((tag) => tag.label).sort(), ["finish", "surface"]);
    await assert.rejects(() => service.createBrand({ grants: GRANTS, actor: ACTOR, name: "TACO" }), (error: unknown) => error instanceof AppError && error.kind === "CONFLICT");
  });
});

describe("Sample request intake (Master Data side of StudioFlow sample requests)", () => {
  const STAFF = { kind: "USER" as const, userId: "sample-staff-1", label: "Sari Staff" };
  const OTHER = { kind: "USER" as const, userId: "sample-staff-2", label: "Budi Staff" };
  const snapshot = (id: string) => ({
    sourceRequestId: id, sourceProjectId: "project-1", sourceProjectName: "2026-506 Test Project", sourceOptionId: "option-1",
    productName: "Oak Panel", brandName: "Panel Brand", color: "Natural", pattern: null, finishing: "Matte", dimension: "1200x2400",
    requestedFrom: "Toko Kayu", requestNote: "Need a 30 cm sample", requesterUserId: "designer-1", requesterLabel: "Dina Designer",
    requestedAt: new Date("2026-09-20T03:00:00Z"),
  });
  const rejectsWithCode = (promise: Promise<unknown>, code: string) =>
    assert.rejects(promise, (error: unknown) => error instanceof AppError && error.code === code, `expected ${code}`);
  const start = (id = "request-1", actor = STAFF) => service.startSampleRequestIntake({ grants: GRANTS, actor, snapshot: snapshot(id) });
  const eventsFor = (entityId: string) => testDb.prisma.auditEvent.findMany({ where: { entity_id: entityId }, orderBy: { occurred_at: "asc" } });

  it("refuses every operation without the sample-request permission", async () => {
    const intake = await start();
    const denied = GRANTS.filter((grant) => grant !== MASTERDATA_PERMISSIONS.sampleRequestManage);
    for (const attempt of [
      service.startSampleRequestIntake({ grants: denied, actor: STAFF, snapshot: snapshot("request-x") }),
      service.recordSampleQuote({ grants: denied, actor: STAFF, intakeId: intake.id, quotedAmount: "10", quotedCurrency: "IDR" }),
      service.markSampleRequestPriced({ grants: denied, actor: STAFF, intakeId: intake.id, quotedAmount: "10", quotedCurrency: "IDR" }),
      service.declineSampleRequest({ grants: denied, actor: STAFF, intakeId: intake.id, reason: "No" }),
      service.listSampleRequestIntakes({ grants: denied }),
      service.getSampleRequestIntake({ grants: denied, intakeId: intake.id }),
    ]) await rejectsWithCode(attempt, "PERMISSION_DENIED");
    assert.equal(await testDb.prisma.sampleRequestIntake.count(), 1, "nothing was created or changed");
  });

  it("takes a request once: same person is idempotent, another person and a finished request conflict", async () => {
    const first = await start("request-1");
    assert.equal(first.status, "IN_PROGRESS");
    assert.deepEqual(first.handledBy, { id: STAFF.userId, label: STAFF.label });
    assert.equal(first.productName, "Oak Panel");
    assert.equal((await start("request-1")).id, first.id, "pressing Take twice returns the same intake");
    await rejectsWithCode(start("request-1", OTHER), "SAMPLE_INTAKE_ALREADY_TAKEN");
    assert.equal(await testDb.prisma.sampleRequestIntake.count(), 1);

    await service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: first.id, reason: "Vendor stopped this line" });
    await rejectsWithCode(start("request-1"), "SAMPLE_INTAKE_ALREADY_RESOLVED");
    const events = await eventsFor(first.id);
    assert.deepEqual(events.map((event) => event.action), ["masterdata.sample-request.started", "masterdata.sample-request.declined"]);
    assert.ok(events.every((event) => event.actor_kind === "USER" && event.app_id === "masterdata"));
  });

  it("accepts a request that names no supplier", async () => {
    const intake = await service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: { ...snapshot("request-blank"), requestedFrom: "  " } });
    assert.ok(intake);
    assert.equal((await testDb.prisma.sampleRequestIntake.findFirstOrThrow({ where: { source_request_id: "request-blank" } })).requested_from, "");
  });

  it("checks source facts and rejects an unusable actor", async () => {
    await rejectsWithCode(service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: { ...snapshot("request-2"), productName: "   " } }), "SAMPLE_SOURCE_INVALID");
    await rejectsWithCode(service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: { ...snapshot("request-2"), requestedFrom: "x".repeat(301) } }), "SAMPLE_SOURCE_INVALID");
    await rejectsWithCode(service.startSampleRequestIntake({ grants: GRANTS, actor: { kind: "SYSTEM", label: "system" }, snapshot: snapshot("request-2") }), "ACTOR_REQUIRED");
    assert.equal(await testDb.prisma.sampleRequestIntake.count(), 0);
  });

  it("records a quote with validated links, leaves unset fields alone, and audits what changed", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Quoted SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1000", currency: "IDR" }] });
    const intake = await start();

    const quoted = await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, vendorId: context.vendorId, quotedAmount: "125000.5", quotedCurrency: "idr", staffNote: "  Valid until October  ", skuId });
    assert.equal(quoted.vendorId, context.vendorId);
    assert.equal(quoted.quotedAmount, "125000.5");
    assert.equal(quoted.quotedCurrency, "IDR", "currency is normalized");
    assert.equal(quoted.staffNote, "Valid until October");
    assert.equal(quoted.skuId, skuId);
    assert.equal(quoted.status, "IN_PROGRESS");

    const untouched = await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, staffNote: "Follow up Monday" });
    assert.equal(untouched.quotedAmount, "125000.5");
    assert.equal(untouched.vendorId, context.vendorId, "fields that were not sent stay as they were");

    const cleared = await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, quotedAmount: null });
    assert.equal(cleared.quotedAmount, null);
    assert.equal(cleared.quotedCurrency, null, "clearing the amount clears its currency");

    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, quotedAmount: "50000", quotedCurrency: "IDR" });
    const currencyCleared = await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, quotedCurrency: null });
    assert.equal(currencyCleared.quotedCurrency, null);
    assert.equal(currencyCleared.quotedAmount, null, "clearing the currency alone also clears the amount, so a price can never be stored without one");

    const noop = await eventsFor(intake.id);
    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id });
    assert.equal((await eventsFor(intake.id)).length, noop.length, "a call that changes nothing writes no audit event");
    const quoteEvent = noop.find((event) => event.action === "masterdata.sample-request.quote-recorded");
    assert.ok(quoteEvent, "the first quote was audited");
    assert.deepEqual((quoteEvent!.changes as Record<string, { from: unknown; to: unknown }>).quotedCurrency, { from: null, to: "IDR" });
    assert.equal(JSON.stringify(noop).includes("Valid until October"), false, "free-text notes are not copied into the audit trail");
  });

  it("refuses bad money and links without changing the request", async () => {
    const context = await createMaterialContext();
    const archived = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Gone Supplier" });
    await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId: archived.vendorId });
    const intake = await start();
    const attempt = (fields: Record<string, unknown>) => service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, ...fields });
    await rejectsWithCode(attempt({ quotedAmount: "abc", quotedCurrency: "IDR" }), "PRICE_AMOUNT_INVALID");
    await rejectsWithCode(attempt({ quotedAmount: "-5", quotedCurrency: "IDR" }), "PRICE_AMOUNT_NEGATIVE");
    await rejectsWithCode(attempt({ quotedAmount: "5" }), "CURRENCY_INVALID");
    await rejectsWithCode(attempt({ quotedAmount: "5", quotedCurrency: "RUPIAH" }), "CURRENCY_INVALID");
    await rejectsWithCode(attempt({ quotedCurrency: "IDR" }), "SAMPLE_AMOUNT_REQUIRED");
    await rejectsWithCode(attempt({ vendorId: crypto.randomUUID() }), "SAMPLE_VENDOR_NOT_FOUND");
    await rejectsWithCode(attempt({ vendorId: archived.vendorId }), "SAMPLE_VENDOR_NOT_FOUND");
    await rejectsWithCode(attempt({ skuId: crypto.randomUUID() }), "SAMPLE_SKU_NOT_FOUND");
    await rejectsWithCode(attempt({ priceMaterialId: crypto.randomUUID() }), "SAMPLE_PRICE_NOT_FOUND");
    await rejectsWithCode(attempt({ staffNote: "n".repeat(1001) }), "SAMPLE_NOTE_TOO_LONG");
    await rejectsWithCode(service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: crypto.randomUUID(), staffNote: "x" }), "SAMPLE_INTAKE_NOT_FOUND");
    const row = await testDb.prisma.sampleRequestIntake.findUniqueOrThrow({ where: { id: intake.id } });
    assert.equal(row.vendor_id, null);
    assert.equal(row.quoted_amount, null);
    assert.equal(context.vendorId.length > 0, true);
  });

  it("rejects a material price whose SKU or Supplier does not match the quote", async () => {
    const context = await createMaterialContext();
    const second = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Second sample supplier" });
    const type = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: second.vendorId, vendor_type_id: type.id } });
    const firstSku = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Sample first SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "10", currency: "IDR" }] });
    const secondSku = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Sample second SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: second.vendorId, amount: "20", currency: "IDR" }] });
    const secondPrice = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: secondSku.skuId } });
    const intake = await start("request-mismatch");
    await rejectsWithCode(service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, vendorId: context.vendorId, skuId: firstSku.skuId, priceMaterialId: secondPrice.id }), "SAMPLE_PRICE_RELATION_MISMATCH");
    await rejectsWithCode(service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: intake.id, vendorId: context.vendorId, skuId: firstSku.skuId, priceMaterialId: secondPrice.id }), "SAMPLE_PRICE_RELATION_MISMATCH");
    await rejectsWithCode(service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: snapshot("request-mismatch-start"), quote: { vendorId: context.vendorId, skuId: firstSku.skuId, priceMaterialId: secondPrice.id } }), "SAMPLE_PRICE_RELATION_MISMATCH");
  });

  it("marks priced only with a price, then closes the request for further changes", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Priced SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1000", currency: "IDR" }] });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    const withAmount = await start("request-a");
    const withLink = await start("request-b");
    const neither = await start("request-c");

    await rejectsWithCode(service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: neither.id, staffNote: "just a note" }), "SAMPLE_PRICE_REQUIRED");
    assert.equal((await service.getSampleRequestIntake({ grants: GRANTS, intakeId: neither.id })).status, "IN_PROGRESS");

    const pricedByAmount = await service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: withAmount.id, quotedAmount: "99000", quotedCurrency: "IDR" });
    assert.equal(pricedByAmount.status, "PRICED");
    assert.ok(pricedByAmount.resolvedAt instanceof Date);
    const pricedByLink = await service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: withLink.id, vendorId: context.vendorId, skuId, priceMaterialId: price.id });
    assert.equal(pricedByLink.priceMaterialId, price.id);
    assert.equal(pricedByLink.quotedAmount, null, "a linked price is enough; no amount is invented");

    await rejectsWithCode(service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: withAmount.id, staffNote: "late edit" }), "SAMPLE_INTAKE_NOT_OPEN");
    await rejectsWithCode(service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: withAmount.id, quotedAmount: "1", quotedCurrency: "IDR" }), "SAMPLE_INTAKE_NOT_OPEN");
    await rejectsWithCode(service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: withAmount.id, reason: "too late" }), "SAMPLE_INTAKE_NOT_OPEN");
    assert.deepEqual((await eventsFor(withAmount.id)).map((event) => event.action), ["masterdata.sample-request.started", "masterdata.sample-request.priced"]);
  });

  it("declines only with a reason", async () => {
    const intake = await start();
    await rejectsWithCode(service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: intake.id, reason: "   " }), "SAMPLE_REASON_INVALID");
    const declined = await service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: intake.id, reason: "  Vendor has no stock  " });
    assert.equal(declined.status, "DECLINED");
    assert.equal(declined.staffNote, "Vendor has no stock");
    assert.ok(declined.resolvedAt instanceof Date);
  });

  it("offers active suppliers to sample-request staff without vendor-directory permission", async () => {
    const later = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Beta Supplier" });
    const first = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Alpha Supplier" });
    const archived = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Archived Supplier" });
    await service.archiveVendor({ grants: GRANTS, actor: ACTOR, vendorId: archived.vendorId });

    const choices = await service.listSampleRequestVendorChoices({ grants: [MASTERDATA_PERMISSIONS.sampleRequestManage] });
    assert.deepEqual(choices, [{ id: first.vendorId, name: "Alpha Supplier" }, { id: later.vendorId, name: "Beta Supplier" }]);
    await rejectsWithCode(service.listSampleRequestVendorChoices({ grants: GRANTS.filter((grant) => grant !== MASTERDATA_PERMISSIONS.sampleRequestManage) }), "PERMISSION_DENIED");
  });

  it("syncs again when the supplier changes even if the amount stays the same, and lists SKUs for sample-request staff", async () => {
    const context = await createMaterialContext();
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const other = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Other Supplier" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: other.vendorId, vendor_type_id: supplierType.id } });
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Choice SKU", code: "CH-1", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "10", currency: "IDR" }] });
    const choices = await service.listSampleRequestSkuChoices({ grants: [MASTERDATA_PERMISSIONS.sampleRequestManage] });
    assert.ok(choices.some((choice) => choice.id === skuId && choice.name === "Choice SKU" && choice.code === "CH-1"));
    await rejectsWithCode(service.listSampleRequestSkuChoices({ grants: GRANTS.filter((grant) => grant !== MASTERDATA_PERMISSIONS.sampleRequestManage) }), "PERMISSION_DENIED");

    const intake = await start("request-sync-supplier-change");
    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, vendorId: context.vendorId, skuId, quotedAmount: "500", quotedCurrency: "IDR" });
    const first = await service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: intake.id });
    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, vendorId: other.vendorId, priceMaterialId: null });
    const second = await service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: intake.id });
    assert.notEqual(second.priceMaterialId, first.priceMaterialId, "a different supplier gets its own price even at the same amount");
    assert.equal(await testDb.prisma.priceMaterial.count({ where: { sku_id: skuId, supplier_vendor_id: other.vendorId, deleted_at: null } }), 1);
  });

  it("copies a complete quote to pricing once, preserves notes, and requires both permissions", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Sample sync SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1000", currency: "IDR" }] });
    const existing = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId, supplier_vendor_id: context.vendorId } });
    await testDb.prisma.priceMaterial.update({ where: { id: existing.id }, data: { notes: "Existing note" } });
    const intake = await start("request-sync");
    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, vendorId: context.vendorId, skuId, quotedAmount: "2500.50", quotedCurrency: "IDR" });

    await rejectsWithCode(service.syncSampleQuoteToPrice({ grants: GRANTS.filter((grant) => grant !== MASTERDATA_PERMISSIONS.sampleRequestManage), actor: STAFF, intakeId: intake.id }), "PERMISSION_DENIED");
    await rejectsWithCode(service.syncSampleQuoteToPrice({ grants: GRANTS.filter((grant) => grant !== MASTERDATA_PERMISSIONS.priceMaterialManage), actor: STAFF, intakeId: intake.id }), "PERMISSION_DENIED");

    const synced = await service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: intake.id });
    assert.equal(synced.priceMaterialId, existing.id);
    assert.equal(synced.linkedSkuName, "Sample Sync SKU");
    assert.equal(synced.linkedPriceAmount, "2500.5");
    const price = await testDb.prisma.priceMaterial.findUniqueOrThrow({ where: { id: existing.id } });
    assert.equal(price.amount.toString(), "2500.5");
    assert.equal(price.notes, "Existing note\nFrom sample request: Oak Panel (2026-506 Test Project)");
    const events = await eventsFor(intake.id);
    assert.equal(events.filter((event) => event.action === "masterdata.sample-request.price-synced").length, 1);
    assert.equal(events.filter((event) => event.action === "price-material.updated").length, 0);

    await service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: intake.id });
    assert.equal((await eventsFor(intake.id)).filter((event) => event.action === "masterdata.sample-request.price-synced").length, 1, "a matching linked price is idempotent");

    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const secondVendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Two" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: secondVendor.vendorId, vendor_type_id: supplierType.id } });
    const createIntake = await start("request-sync-create");
    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: createIntake.id, vendorId: secondVendor.vendorId, skuId, quotedAmount: "3000", quotedCurrency: "IDR" });
    const created = await service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: createIntake.id });
    assert.ok(created.priceMaterialId);
    assert.equal(await testDb.prisma.priceMaterial.count({ where: { sku_id: skuId, supplier_vendor_id: secondVendor.vendorId, deleted_at: null } }), 1);
    const createdEvent = (await eventsFor(createIntake.id)).find((event) => event.action === "masterdata.sample-request.price-synced");
    assert.ok(createdEvent);
    assert.equal(JSON.stringify(createdEvent.changes).includes("created"), true);
  });

  it("rejects incomplete and declined quote syncs", async () => {
    const intake = await start("request-incomplete");
    await rejectsWithCode(service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: intake.id }), "SAMPLE_PRICE_SYNC_INCOMPLETE");
    const declined = await start("request-declined-sync");
    await service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: declined.id, reason: "No stock" });
    await rejectsWithCode(service.syncSampleQuoteToPrice({ grants: GRANTS, actor: STAFF, intakeId: declined.id }), "SAMPLE_INTAKE_DECLINED");
  });

  it("lists by status and source id, newest first, within a clamped limit", async () => {
    const a = await start("request-a");
    const b = await start("request-b");
    const c = await start("request-c");
    await service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: b.id, reason: "No" });
    assert.deepEqual((await service.listSampleRequestIntakes({ grants: GRANTS })).map((row) => row.id), [c.id, b.id, a.id]);
    assert.deepEqual((await service.listSampleRequestIntakes({ grants: GRANTS, status: "IN_PROGRESS" })).map((row) => row.id), [c.id, a.id]);
    assert.deepEqual((await service.listSampleRequestIntakes({ grants: GRANTS, status: "DECLINED" })).map((row) => row.id), [b.id]);
    assert.deepEqual((await service.listSampleRequestIntakes({ grants: GRANTS, sourceRequestIds: ["request-a", "missing"] })).map((row) => row.id), [a.id]);
    assert.deepEqual(await service.listSampleRequestIntakes({ grants: GRANTS, sourceRequestIds: [] }), []);
    assert.equal((await service.listSampleRequestIntakes({ grants: GRANTS, limit: 1 })).length, 1);
    assert.equal((await service.listSampleRequestIntakes({ grants: GRANTS, limit: 0 })).length, 3, "an unusable limit falls back to the default");
    assert.equal((await service.listSampleRequestIntakes({ grants: GRANTS, limit: -5 })).length, 3, "a negative limit falls back to the default too");
  });
});

describe("Sample request notifications (Master Data side, real database)", () => {
  const STAFF = { kind: "USER" as const, userId: "sample-staff-1", label: "Sari Staff" };
  const notifying = () => createMasterDataService(testDb.prisma, {
    runTransaction: (work) => testDb.prisma.$transaction(work),
    auditWriter: createAuditEventWriter(),
    sampleRequestNotifier: createSampleRequestResolvedNotifier({ writer: createNotificationWriter() }),
  });
  const snapshot = (id: string) => ({
    sourceRequestId: id, sourceProjectId: "project-9", sourceProjectName: "2026-506 Sociolla", sourceOptionId: "option-1", productName: "Oak Panel",
    brandName: null, color: null, pattern: null, finishing: null, dimension: null, requestedFrom: "Toko Kayu", requestNote: null,
    requesterUserId: "designer-1", requesterLabel: "Dina Designer", requestedAt: new Date("2026-09-20T03:00:00Z"),
  });
  const inbox = () => testDb.prisma.notification.findMany({ orderBy: { created_at: "asc" } });

  it("tells the requester, and only the requester, when a request is priced", async () => {
    const service = notifying();
    const intake = await service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: snapshot("request-1") });
    assert.equal((await inbox()).length, 0, "taking a request tells nobody");
    await service.recordSampleQuote({ grants: GRANTS, actor: STAFF, intakeId: intake.id, quotedAmount: "99000", quotedCurrency: "IDR" });
    assert.equal((await inbox()).length, 0, "recording a quote tells nobody");
    await service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: intake.id });
    const [note, ...rest] = await inbox();
    assert.equal(rest.length, 0);
    assert.equal(note.recipient_user_id, "designer-1");
    assert.equal(note.kind, "masterdata.sample-request.priced");
    assert.equal(note.app_id, "masterdata");
    assert.equal(note.href, "/studioflow/projects/project-9/schedule");
    assert.deepEqual([note.entity_type, note.entity_id], ["sample_request_intake", intake.id]);
    assert.ok(note.body?.includes("IDR 99000"));
    assert.equal(note.read_at, null);
  });

  it("tells the requester about a decline, with the reason", async () => {
    const service = notifying();
    const intake = await service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: snapshot("request-2") });
    await service.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: intake.id, reason: "Vendor has no stock" });
    const [note] = await inbox();
    assert.equal(note.kind, "masterdata.sample-request.declined");
    assert.equal(note.recipient_user_id, "designer-1");
    assert.ok(note.body?.includes("Vendor has no stock"));
  });

  it("writes no notification when finishing the request fails, and rolls a failed notification back with it", async () => {
    const service = notifying();
    const intake = await service.startSampleRequestIntake({ grants: GRANTS, actor: STAFF, snapshot: snapshot("request-3") });
    await assert.rejects(service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: intake.id }), (error: unknown) => error instanceof AppError && error.code === "SAMPLE_PRICE_REQUIRED");
    assert.equal((await inbox()).length, 0);

    const failing = createMasterDataService(testDb.prisma, {
      runTransaction: (work) => testDb.prisma.$transaction(work),
      auditWriter: createAuditEventWriter(),
      sampleRequestNotifier: { async resolved() { throw new Error("inbox unavailable"); } },
    });
    await assert.rejects(failing.declineSampleRequest({ grants: GRANTS, actor: STAFF, intakeId: intake.id, reason: "No" }), /inbox unavailable/);
    const row = await testDb.prisma.sampleRequestIntake.findUniqueOrThrow({ where: { id: intake.id } });
    assert.equal(row.status, "IN_PROGRESS", "the request stays open so it can be finished again");
  });

  it("exports the price list as xlsx, csv and pdf, re-imports the csv, and builds an import template", async () => {
    const context = await createMaterialContext();
    await service.createSku({ grants: GRANTS, actor: ACTOR, name: "Format SKU", baseUnitId: context.unit.id, categoryId: context.categoryId, priceMaterials: [{ supplierVendorId: context.vendorId, amount: "120", currency: "IDR" }] });
    const csv = await service.exportSkuPriceList({ grants: GRANTS, format: "csv" });
    assert.equal(csv.filename, "sku-prices.csv");
    const preview = await service.previewSkuPriceImport({ grants: GRANTS, file: { data: csv.data, name: csv.filename } });
    assert.equal(preview.errors.length, 0);
    assert.equal(preview.totals.unchanged, preview.rows.length, "an unedited export imports as no changes");
    const pdf = await service.exportSkuPriceList({ grants: GRANTS, format: "pdf" });
    assert.equal(pdf.data.subarray(0, 4).toString(), "%PDF");
    for (const format of ["xlsx", "csv"] as const) {
      const template = await service.skuPriceImportTemplate({ grants: GRANTS, format });
      const parsed = await service.previewSkuPriceImport({ grants: GRANTS, file: { data: template.data, name: template.filename } });
      assert.ok(parsed.rows.length === 1 && parsed.rows[0].errors.length > 0, "the example row is checked against real suppliers, so it reports errors instead of saving");
    }
  });
});
