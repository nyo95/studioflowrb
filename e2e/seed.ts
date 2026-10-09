import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.test.local" });
loadEnv({ path: ".env.test" });

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { bootstrapFirstOwner } from "@platform/core/auth/bootstrap";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables } from "@platform/core/db/test-support";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import { createNotificationWriter } from "@platform/core/notifications/persistence";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";
import { FakeObjectStorage } from "@platform/core/storage";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBqService } from "@/apps/bq/service";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { createMasterDataService, MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { LEGACY_PHASE_DEFINITION_IDS as LEGACY } from "@/apps/studioflow/domain/phase";
import { createStudioFlowService } from "@/apps/studioflow/service";
import { APP_REGISTRATIONS } from "../src/app/app-registrations";

/**
 * Seeds the disposable test database for the Playwright screen-size checks (DESIGN v2 §12): one owner with every
 * grant and one StudioFlow project and one BQ project, both with long names. It refuses any database that is not the disposable test
 * database (same guard as `npm test`). The generated test credentials go to `e2e/.tmp/owner.json`, which is
 * git-ignored; they are never real credentials.
 */
async function main() {
  process.env.DATABASE_URL = process.env.PLATFORM_TEST_DATABASE_URL;
  const testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  const db = testDb.prisma;
  try {
    await testDb.pool.query(`TRUNCATE TABLE ${["sf_project", "sf_client", "sf_phase_definition", "sf_phase_template", "sf_settings", "sf_checklist_template", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix"].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    await testDb.pool.query('TRUNCATE TABLE "bq"."bq_project" RESTART IDENTITY CASCADE');
    await truncatePlatformTables(testDb);

    const registry = initializePermissionRegistry(APP_REGISTRATIONS);
    const email = "e2e-owner@example.test";
    const password = `E2e-${randomBytes(12).toString("hex")}!`;
    const owner = await bootstrapFirstOwner(
      { runTransaction: (work) => runSerializableTransaction(db, work), auditWriter: createAuditEventWriter(), now: () => new Date(), generateId: () => crypto.randomUUID() },
      { email, displayName: "Eka Tester", password, permissionIds: registry.permissions },
    );

    const template = await db.sfPhaseTemplate.create({ data: { name: "Standard", is_default: true, is_active: true } });
    const definitions = [
      { id: LEGACY.moodboard, name: "Moodboard", prefix: "MB", order_index: 1, allow_parallel: false, seat: "designer" },
      { id: LEGACY.layout, name: "Layout Plan", prefix: "L", order_index: 2, allow_parallel: true, seat: "designer" },
      { id: LEGACY.design3d, name: "Design 3D", prefix: "D", order_index: 3, allow_parallel: true, seat: "designer" },
      { id: LEGACY.cd, name: "Construction Drawing", prefix: "CD", order_index: 4, allow_parallel: true, seat: "drafter" },
      { id: LEGACY.supervision, name: "Supervision", prefix: "SV", order_index: 5, allow_parallel: false, seat: "designer" },
    ];
    for (const definition of definitions) await db.sfPhaseDefinition.create({ data: { ...definition, template_id: template.id } });

    const sf = createStudioFlowService(db, {
      runTransaction: (work) => db.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(),
      people: createPeopleDirectory(db),
      storage: new FakeObjectStorage(),
      notificationWriter: createNotificationWriter(),
      masterData: createMasterDataPublicRead(db),
      now: () => new Date(),
    });
    const actor = { kind: "USER" as const, userId: owner.userId, label: "Eka Tester" };
    // Browser-acceptance fixtures. They are created through the public
    // Master Data service so the UI tests start from the same valid state as a
    // real account, without depending on another spec's mutations.
    await testDb.pool.query(`TRUNCATE TABLE "master_data"."SampleRequestIntake", "master_data"."SampleMovement", "master_data"."Sample", "master_data"."Category", "master_data"."Vendor", "master_data"."Brand", "master_data"."Sku", "master_data"."ArchiveCause", "master_data"."DeletionRequest" RESTART IDENTITY CASCADE`);
    await db.vendorType.deleteMany({ where: { code: { in: ["E2E_MATERIAL", "E2E_LABOR", "E2E_BOTH"] } } });
    const masterData = createMasterDataService(db, {
      runTransaction: (work) => db.$transaction(work),
      auditWriter: createAuditEventWriter(),
      sampleRequestNotifier: { resolved: async () => undefined },
    });
    const masterDataGrants = Object.values(MASTERDATA_PERMISSIONS);
    const [materialType, laborType, bothType] = await Promise.all([
      masterData.createVendorType({ grants: masterDataGrants, actor, code: "E2E_MATERIAL", name: "E2E Material", canSupplyMaterial: true }),
      masterData.createVendorType({ grants: masterDataGrants, actor, code: "E2E_LABOR", name: "E2E Labor", canSupplyLabor: true }),
      masterData.createVendorType({ grants: masterDataGrants, actor, code: "E2E_BOTH", name: "E2E Both", canSupplyMaterial: true, canSupplyLabor: true }),
    ]);
    const [productCategory, workCategory] = await Promise.all([
      masterData.createCategory({ grants: masterDataGrants, actor, name: "ZZ-Test Product", kind: "PRODUCT" }),
      masterData.createCategory({ grants: masterDataGrants, actor, name: "ZZ-Test Work", kind: "WORK" }),
    ]);
    const [matA, matB, both, labor] = await Promise.all([
      masterData.createVendor({ grants: masterDataGrants, actor, name: "ZZ-Test Mat A", vendorTypeIds: [materialType.vendorTypeId] }),
      masterData.createVendor({ grants: masterDataGrants, actor, name: "ZZ-Test Mat B", vendorTypeIds: [materialType.vendorTypeId] }),
      masterData.createVendor({ grants: masterDataGrants, actor, name: "ZZ-Test Both", vendorTypeIds: [bothType.vendorTypeId] }),
      masterData.createVendor({ grants: masterDataGrants, actor, name: "ZZ-Test Labor", vendorTypeIds: [laborType.vendorTypeId] }),
    ]);
    const brand = await masterData.createBrand({ grants: masterDataGrants, actor, name: "ZZ-Test Brand", ownerVendorId: matA.vendorId, suppliers: [{ vendorId: matA.vendorId }] });
    const pcs = await db.unit.findUniqueOrThrow({ where: { code: "pcs" } });
    const sku1 = await masterData.createSku({ grants: masterDataGrants, actor, name: "ZZ-Test SKU 1", brandId: brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id, priceMaterials: [{ supplierVendorId: matA.vendorId, amount: "10000", currency: "IDR" }] });
    const sku2 = await masterData.createSku({ grants: masterDataGrants, actor, name: "ZZ-Test SKU 2", brandId: brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id, priceMaterials: [{ supplierVendorId: matA.vendorId, amount: "11000", currency: "IDR" }] });
    const sku3 = await masterData.createSku({ grants: masterDataGrants, actor, name: "ZZ-Test SKU 3", brandId: brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id, priceMaterials: [{ supplierVendorId: matA.vendorId, amount: "11000", currency: "IDR" }] });
    const guardBrand = await masterData.createBrand({ grants: masterDataGrants, actor, name: "ZZ-Test Guard Brand", ownerVendorId: matA.vendorId, suppliers: [{ vendorId: matA.vendorId }, { vendorId: matB.vendorId }] });
    await masterData.createSku({ grants: masterDataGrants, actor, name: "ZZ-Test Guard SKU", brandId: guardBrand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id, priceMaterials: [{ supplierVendorId: matB.vendorId, amount: "15000", currency: "IDR" }] });
    await masterData.createPriceMaterialLabor({ grants: masterDataGrants, actor, name: "ZZ-Test Existing Matrix", categoryId: workCategory.categoryId, vendorId: labor.vendorId, unitId: pcs.id, amount: "9000", currency: "IDR" });

    const createCascadeFixture = async (step: string) => {
      const supplier = await masterData.createVendor({ grants: masterDataGrants, actor, name: `ZZ-Test ${step} Supplier`, vendorTypeIds: [materialType.vendorTypeId] });
      const ownedBrand = await masterData.createBrand({ grants: masterDataGrants, actor, name: `ZZ-Test ${step} Owned Brand`, ownerVendorId: supplier.vendorId, suppliers: [{ vendorId: supplier.vendorId }] });
      const sku = await masterData.createSku({ grants: masterDataGrants, actor, name: `ZZ-Test ${step} Owned SKU`, brandId: ownedBrand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id, priceMaterials: [{ supplierVendorId: supplier.vendorId, amount: "51000", currency: "IDR" }] });
      const linkedBrand = await masterData.createBrand({ grants: masterDataGrants, actor, name: `ZZ-Test ${step} Linked Brand`, suppliers: [{ vendorId: supplier.vendorId }] });
      return { supplier, ownedBrand, sku, linkedBrand };
    };
    await createCascadeFixture("5.1");
    await createCascadeFixture("5.2");
    const restoreCascade = await createCascadeFixture("5.3");
    await masterData.archiveVendor({ grants: masterDataGrants, actor, vendorId: restoreCascade.supplier.vendorId });

    const directSupplier = await masterData.createVendor({ grants: masterDataGrants, actor, name: "ZZ-Test 5.4 Supplier", vendorTypeIds: [materialType.vendorTypeId] });
    const directBrand = await masterData.createBrand({ grants: masterDataGrants, actor, name: "ZZ-Test 5.4 Direct Brand", ownerVendorId: directSupplier.vendorId, suppliers: [{ vendorId: directSupplier.vendorId }] });
    await masterData.archiveBrand({ grants: masterDataGrants, actor, brandId: directBrand.brandId });

    const conflictArchived = await masterData.createBrand({ grants: masterDataGrants, actor, name: "ZZ-Test 5.5 Conflict Brand" });
    await masterData.archiveBrand({ grants: masterDataGrants, actor, brandId: conflictArchived.brandId });
    await masterData.createBrand({ grants: masterDataGrants, actor, name: "ZZ-Test 5.5 Conflict Brand" });

    const priceLess62 = await masterData.createSkuForSampleShelf({ grants: masterDataGrants, actor, name: "ZZ-Test 6.2 Price-less SKU", code: "ZZ62", brandId: brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id });
    const priceLess63Brand = await masterData.createBrand({ grants: masterDataGrants, actor, name: "ZZ-Test 6.3 Price-less Brand" });
    const priceLess63 = await masterData.createSkuForSampleShelf({ grants: masterDataGrants, actor, name: "ZZ-Test 6.3 Price-less SKU", code: "ZZ63", brandId: priceLess63Brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id });
    const sampleSkus = await Promise.all(["Main", "Lost", "Discard", "Held"].map((kind, index) => masterData.createSkuForSampleShelf({ grants: masterDataGrants, actor, name: `ZZ-Test 6.4 ${kind} Sample`, code: `ZZ64${index + 1}`, brandId: brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id })));
    const samples64 = await Promise.all(sampleSkus.map((sku, index) => masterData.createSample({ grants: masterDataGrants, actor, skuId: sku.skuId, rack: "S2", box: String(index + 1) })));
    const requestSku = await masterData.createSkuForSampleShelf({ grants: masterDataGrants, actor, name: "ZZ-Test 6.5 Requested SKU", code: "ZZ65", brandId: brand.brandId, categoryId: productCategory.categoryId, baseUnitId: pcs.id });
    const project = await sf.projects.createProject({
      grants: registry.permissions,
      actor,
      name: "2026-999 E2E Long Project Name For Phone Width Checks At The Breeze BSD Phase 2",
      newClientName: "E2E Client",
      picDesignerId: owner.userId,
      picDrafterId: owner.userId,
    });

    await masterData.setSampleStatus({ grants: masterDataGrants, actor, sampleId: samples64[3].id, status: "BORROWED", holderName: "E2E Holder", holderProjectId: project.projectId, holderProjectName: "2026-999 E2E Long Project Name For Phone Width Checks At The Breeze BSD Phase 2" });
    const requestEntry = await sf.schedule.createEntry({ ...{ grants: registry.permissions, actor }, projectId: project.projectId, section: "MATERIAL", category: "E2E Samples", snapshot: { productName: "ZZ-Test 6.5 Requested Sample", brandName: "ZZ-Test Brand" } });
    const seededEntry = (await sf.schedule.listSchedule({ grants: registry.permissions, projectId: project.projectId })).find((entry) => entry.id === requestEntry.entryId)!;
    await sf.schedule.requestSample({ ...{ grants: registry.permissions, actor }, projectId: project.projectId, optionId: seededEntry.options[0].id, requestedFrom: "ZZ-Test Mat A" });

    const bq = createBqService(db, { auditWriter: createAuditEventWriter(), runTransaction: (work) => db.$transaction((tx) => work(tx as unknown as PrismaClient)) });
    const bqProject = await bq.createProject({ grants: registry.permissions, actor, title: "E2E Long BQ Project Title For Phone Width Checks At The Breeze BSD Phase 2", clientName: "E2E Client" });

    mkdirSync("e2e/.tmp", { recursive: true });
    writeFileSync("e2e/.tmp/owner.json", JSON.stringify({ email, password, projectId: project.projectId, bqProjectId: bqProject.id, masterData: { brandId: brand.brandId, matA: matA.vendorId, matB: matB.vendorId, both: both.vendorId, labor: labor.vendorId, sku1: sku1.skuId, sku2: sku2.skuId, sku3: sku3.skuId, workCategory: workCategory.categoryId, priceLess62: priceLess62.skuId, priceLess63: priceLess63.skuId, priceLess63Brand: priceLess63Brand.brandId, requestSku: requestSku.skuId } }));
  } finally {
    await closeTestDb(testDb);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
