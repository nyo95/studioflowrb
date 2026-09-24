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
