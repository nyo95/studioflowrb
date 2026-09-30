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
    where: { code: { notIn: ["PCS", "M", "MM", "CM", "M2", "M3", "KG", "SET", "SHEET", "LOT", "LS", "HR", "DAY"] } },
  });
  await db.unit.updateMany({ data: { status: "ACTIVE", archived_at: null } });
  await db.vendorType.deleteMany({
    where: { code: { notIn: ["SUPPLIER", "SUBCON", "SERVICE", "FABRICATOR", "FREELANCER"] } },
  });
  await db.vendorType.updateMany({ data: { deleted_at: null } });
}

async function createMaterialContext() {
  const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "PCS" } });
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
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).name, "Workbook SKU edited");
    assert.equal((await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } })).amount.toString(), "125.5");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "sku-price-workbook.applied" } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: { in: ["sku.updated", "price-material.updated"] } } }), 0);

    const invalid = new ExcelJS.Workbook(); const invalidSheet = invalid.addWorksheet("SKU Prices");
    invalidSheet.addRow(["SKU ID", "Code", "Name", "Brand", "Category", "Base unit", "Purchase unit", "Length", "Width", "Thickness", "Dimension unit", "Notes", "Price ID", "Supplier", "Amount", "Currency", "Price notes"]);
    invalidSheet.addRow([crypto.randomUUID(), "", "Bad", "", "Unknown category", "PCS", "", "", "", "", "", "", crypto.randomUUID(), "Unknown supplier", "bad", "IDR", ""]);
    invalidSheet.addRow([skuId, "", "Workbook SKU edited", "", "Panel", "PCS", "", "", "", "", "", "", "", context.vendorId, "1", "IDR", ""]);
    invalidSheet.addRow([skuId, "", "Workbook SKU edited", "", "Panel", "PCS", "", "", "", "", "", "", "", context.vendorId, "1", "IDR", ""]);
    const invalidPreview = await service.previewSkuPriceImport({ grants: GRANTS, file: Buffer.from(await invalid.xlsx.writeBuffer()) });
    assert.ok(invalidPreview.errors.some((error) => error.column === "SKU ID"));
    assert.ok(invalidPreview.errors.some((error) => error.column === "Supplier"));
    assert.ok(invalidPreview.errors.some((error) => error.column === "Amount"));
    assert.ok(invalidPreview.errors.some((error) => error.column === "Price ID" || error.column === "Supplier"));
    await assert.rejects(service.applySkuPriceImport({ grants: GRANTS, actor: ACTOR, file: Buffer.from(await invalid.xlsx.writeBuffer()), hash: invalidPreview.hash }), (error: unknown) => error instanceof AppError && error.code === "SKU_PRICE_IMPORT_ERRORS");
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
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "M2" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "SHEET" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "MM" } }),
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
    assert.equal(option.measurement.baseUnit.code, "M2");
    assert.equal(option.measurement.purchaseUnit?.code, "SHEET");

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
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "M2" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "SHEET" } }),
      testDb.prisma.unit.findUniqueOrThrow({ where: { code: "MM" } }),
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
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "M2" } });

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

    // Clearing the source link allows the brand change to proceed
    await service.updatePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id, amount: "1000", currency: "IDR", sourceLinkId: null });
    await service.updateSku({ grants: GRANTS, actor: ACTOR, skuId, name: "Brand-Linked SKU", brandId: brand2.brandId, baseUnitId: context.unit.id, categoryId: context.categoryId });
    assert.equal((await testDb.prisma.sku.findUniqueOrThrow({ where: { id: skuId } })).brand_id, brand2.brandId);
  });

  it("blocks SKU restore when all its prices still have other archive causes", async () => {
    const context = await createMaterialContext();
    const supplierType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUPPLIER" } });
    const vendor2 = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier Two Restore Block" });
    await testDb.prisma.vendorVendorType.create({ data: { id: crypto.randomUUID(), vendor_id: vendor2.vendorId, vendor_type_id: supplierType.id } });

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
    // Brand change is now allowed (the only source-linked price is archived)
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
    await assert.rejects(
      () => service.updateUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, code: "TEST_ROLL_PK", name: "Test Roll Pack" }),
      (error: unknown) => error instanceof AppError && error.code === "UNIT_CODE_IMMUTABLE",
    );
    await service.updateUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, code: "TEST_ROLL", name: "Test Roll Pack" });

    const updated = await service.getUnit({ grants: GRANTS, unitId: created.unitId });
    assert.equal(updated.code, "TEST_ROLL");
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
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "PCS" } });
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
    const unit = await testDb.prisma.unit.findUniqueOrThrow({ where: { code: "M2" } });
    const subconType = await testDb.prisma.vendorType.findUniqueOrThrow({ where: { code: "SUBCON" } });
    const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Multi Vendor" });
    await testDb.prisma.vendorVendorType.create({
      data: { id: crypto.randomUUID(), vendor_id: vendor.vendorId, vendor_type_id: subconType.id },
    });

    const workCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Flooring", kind: "WORK" });
    const prodCat = await service.createCategory({ grants: GRANTS, actor: ACTOR, name: "Tile", kind: "PRODUCT" });
    const brand = await service.createBrand({ grants: GRANTS, actor: ACTOR, name: "Tile Brand" });

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
    const pricedByLink = await service.markSampleRequestPriced({ grants: GRANTS, actor: STAFF, intakeId: withLink.id, priceMaterialId: price.id });
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
});
