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

const ACTOR = { kind: "USER" as const, userId: "masterdata-test-user", label: "Master Data Test" };
const GRANTS = Object.values(MASTERDATA_PERMISSIONS);

let testDb: TestDb;
let service: ReturnType<typeof createMasterDataService>;

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
  await db.unit.updateMany({ data: { status: "ACTIVE", archived_at: null } });
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

  it("executes approved permanent deletion atomically and preserves the final audit event", async () => {
    const created = await service.createUnit({ grants: GRANTS, actor: ACTOR, code: "BOX", name: "Box" });
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
