import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import type { PrismaClient } from "@/generated/prisma/client";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  type TestDb,
} from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";

import { createMasterDataService, MASTERDATA_PERMISSIONS } from "./service";
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
      "platform"."AuditEvent"
    RESTART IDENTITY CASCADE
  `);
  await db.unit.deleteMany({
    where: { code: { notIn: ["PCS", "M", "M2", "M3", "KG", "SET", "LOT", "LS", "HR", "DAY"] } },
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
  const vendor = await service.createVendor({ grants: GRANTS, actor: ACTOR, name: "Supplier One" });
  await testDb.prisma.vendorVendorType.create({
    data: {
      id: crypto.randomUUID(),
      vendor_id: vendor.vendorId,
      vendor_type_id: vendorType.id,
    },
  });
  return { unit, categoryId: category.categoryId, vendorId: vendor.vendorId };
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
  it("creates a complete SKU atomically with exact decimal material pricing", async () => {
    const context = await createMaterialContext();
    const result = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "HPL Panel",
      baseUnitId: context.unit.id,
      categoryIds: [context.categoryId],
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

  it("rejects incomplete, duplicate, and invalid-price SKU input before persistence", async () => {
    const context = await createMaterialContext();
    const base = {
      grants: GRANTS,
      actor: ACTOR,
      name: "Invalid SKU",
      baseUnitId: context.unit.id,
      categoryIds: [context.categoryId],
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1", currency: "IDR" }],
    };

    await assert.rejects(
      () => service.createSku({ ...base, categoryIds: [] }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_CATEGORY_REQUIRED",
    );
    await assert.rejects(
      () => service.createSku({ ...base, categoryIds: [context.categoryId, context.categoryId] }),
      (error: unknown) => error instanceof AppError && error.code === "SKU_CATEGORY_DUPLICATE",
    );
    await assert.rejects(
      () => service.createSku({ ...base, priceMaterials: [{ ...base.priceMaterials[0], amount: "NaN" }] }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_AMOUNT_INVALID",
    );
    assert.equal(await testDb.prisma.sku.count(), 0);
  });

  it("preserves overlapping direct and SKU-parent archive causes", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Cause-safe SKU",
      baseUnitId: context.unit.id,
      categoryIds: [context.categoryId],
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "1000", currency: "IDR" }],
    });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });

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

  it("rolls back restore when a required Unit is archived", async () => {
    const context = await createMaterialContext();
    const { skuId } = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Unit-bound SKU",
      baseUnitId: context.unit.id,
      categoryIds: [context.categoryId],
      priceMaterials: [{ supplierVendorId: context.vendorId, amount: "250", currency: "IDR" }],
    });
    const price = await testDb.prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: skuId } });
    await service.archivePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id });
    await service.archiveUnit({ grants: GRANTS, actor: ACTOR, unitId: context.unit.id });

    await assert.rejects(
      () => service.restorePriceMaterial({ grants: GRANTS, actor: ACTOR, priceMaterialId: price.id }),
      (error: unknown) => error instanceof AppError && error.code === "PRICE_UNIT_INACTIVE",
    );
    assert.equal(
      await testDb.prisma.archiveCause.count({ where: { entity_type: "price_material", entity_id: price.id, kind: "DIRECT" } }),
      1,
    );
  });

  it("handles Unit update and list queries", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "TEST_ROLL", name: "Test Roll" });
    await service.updateUnit({ grants: GRANTS, actor: ACTOR, unitId: created.unitId, code: "TEST_ROLL_PK", name: "Test Roll Pack" });

    const updated = await service.getUnit({ grants: GRANTS, unitId: created.unitId });
    assert.equal(updated.code, "TEST_ROLL_PK");
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
      baseUnitId: context.unit.id,
      categoryIds: [context.categoryId],
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
      categoryIds: [catEnrich.categoryId],
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

    // 1. Material price via SKU
    const sku = await service.createSku({
      grants: GRANTS,
      actor: ACTOR,
      name: "Granite Tile 60x60",
      baseUnitId: unit.id,
      categoryIds: [prodCat.categoryId],
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

    const workPrices = await publicRead.listWorkPricesRead({ categoryId: workCat.categoryId });
    assert.equal(workPrices.length, 2);
    assert.equal(workPrices.some((w) => w.id === mlPrice.priceMaterialLaborId && w.kind === "material-labor"), true);
    assert.equal(workPrices.some((w) => w.id === laborPrice.priceLaborId && w.kind === "labor"), true);
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
});
