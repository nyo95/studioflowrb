import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredSlug, requiredCurrency, requiredAmount, resolveSkuIdentity, resolveSkuMeasurement, assertSkuRestorable, assertPriceMaterialRestorable, assertVendorMaterialCapable, assertWorkPriceRestorable, pruneOriginlessBrandCategories, addDirectCause, addParentCauses, removeDirectCause, removeParentCausesAndFindRestored, createDeletionRequest, writeAudit } from "./shared";

export function createSkuService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  return {
    async listSkus(input: { grants: PermissionGrants; search?: string; brandId?: string; categoryId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.skuRead, MASTERDATA_PERMISSIONS.skuManage], "You do not have permission to view SKUs.");
      const search = input.search?.trim();
      return db.sku.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.brandId ? { brand_id: input.brandId } : {}),
          ...(input.categoryId ? { categories: { some: { category_id: input.categoryId } } } : {}),
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }, { brand: { name: { contains: search, mode: "insensitive" } } }] } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, slug: true, code: true, notes: true, deleted_at: true,
          brand: { select: { id: true, name: true, slug: true } },
          base_unit: { select: { id: true, code: true, name: true } },
          purchase_unit: { select: { id: true, code: true, name: true } },
          dimension_length: true, dimension_width: true, dimension_thickness: true, dimension_unit: { select: { id: true, code: true, name: true } },
          purchase_to_base_factor: true,
          categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
          material_prices: { where: { deleted_at: null }, select: { id: true, amount: true, currency: true, supplier_vendor: { select: { id: true, name: true } }, unit: { select: { id: true, code: true, name: true } } } },
          _count: { select: { material_prices: true } },
        },
      });
    },

    async getSku(input: { grants: PermissionGrants; skuId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.skuRead, MASTERDATA_PERMISSIONS.skuManage], "You do not have permission to view SKUs.");
      return db.sku.findUniqueOrThrow({
        where: { id: input.skuId },
        include: { brand: { select: { id: true, name: true, slug: true } }, base_unit: { select: { id: true, code: true, name: true } }, purchase_unit: { select: { id: true, code: true, name: true } }, categories: { include: { category: { select: { id: true, name: true, slug: true, kind: true } } } }, material_prices: { include: { supplier_vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } }, source_link: true } } },
      });
    },

    async createSku(input: { grants: PermissionGrants; actor: AuditActor; name?: string | null; code?: string | null; notes?: string; brandId?: string | null; baseUnitId: string; purchaseUnitId?: string; dimensionLength?: string; dimensionWidth?: string; dimensionThickness?: string; dimensionUnitId?: string; categoryId: string; priceMaterials: Array<{ supplierVendorId: string; amount: string; currency: string; notes?: string }> }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      const identity = resolveSkuIdentity(input.name, input.code);
      if (!input.categoryId) throw new AppError("VALIDATION", "SKU_CATEGORY_REQUIRED", "At least one category is required.");
      if (!input.priceMaterials || input.priceMaterials.length === 0) throw new AppError("VALIDATION", "SKU_PRICE_REQUIRED", "At least one material price is required.");
      const categoryIds = [input.categoryId];
      const supplierIds = input.priceMaterials.map((price) => price.supplierVendorId);
      if (new Set(supplierIds).size !== supplierIds.length) throw new AppError("VALIDATION", "SKU_PRICE_VENDOR_DUPLICATE", "Only one initial price is allowed per Supplier.");
      return runTransaction(async (tx) => {
        const baseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } });
        if (baseUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_BASE_UNIT_INACTIVE", "Base unit must be active.");
        let purchaseUnit = null;
        if (input.purchaseUnitId) { purchaseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.purchaseUnitId } }); if (purchaseUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_PURCHASE_UNIT_INACTIVE", "Purchase unit must be active."); }
        const measurement = await resolveSkuMeasurement(tx, input, baseUnit, purchaseUnit);
        const categories = await tx.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, kind: true, status: true } });
        if (categories.length !== categoryIds.length) throw new AppError("VALIDATION", "SKU_CATEGORY_NOT_FOUND", "One or more categories not found.");
        for (const cat of categories) { if (cat.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_CATEGORY_INACTIVE", `Category ${cat.id} is not active.`); if (cat.kind !== "PRODUCT") throw new AppError("VALIDATION", "SKU_CATEGORY_KIND_INVALID", "SKU categories must be PRODUCT categories."); }
        const brand = input.brandId ? await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } }) : null;
        if (brand?.deleted_at) throw new AppError("VALIDATION", "SKU_BRAND_ARCHIVED", "Brand is archived.");
        const priceUnitId = input.purchaseUnitId ?? input.baseUnitId;
        for (const pm of input.priceMaterials) { requiredCurrency(pm.currency); requiredAmount(pm.amount); const supplier = await tx.vendor.findUniqueOrThrow({ where: { id: pm.supplierVendorId } }); if (supplier.deleted_at !== null) throw new AppError("VALIDATION", "PRICE_VENDOR_ARCHIVED", "Supplier is archived."); await assertVendorMaterialCapable(tx, pm.supplierVendorId); }
        let sku;
        try { sku = await tx.sku.create({ data: { id: randomUUID(), name: identity.name, slug: identity.slug, code: identity.code, notes: input.notes?.trim() || null, brand_id: input.brandId || null, base_unit_id: input.baseUnitId, purchase_unit_id: input.purchaseUnitId ?? null, ...measurement } }); } catch (error) { mapWriteError(error); }
        const skuId = sku!.id;
        await tx.skuCategory.createMany({ data: categoryIds.map((categoryId) => ({ id: randomUUID(), sku_id: skuId, category_id: categoryId })) });
        const productCategoryIds = categories.filter((c) => c.kind === "PRODUCT").map((c) => c.id);
        for (const catId of input.brandId ? productCategoryIds : []) { let bc = await tx.brandCategory.findUnique({ where: { brand_id_category_id: { brand_id: input.brandId!, category_id: catId } } }); if (!bc) { bc = await tx.brandCategory.create({ data: { id: randomUUID(), brand_id: input.brandId!, category_id: catId } }); } await tx.brandCategoryOrigin.create({ data: { id: randomUUID(), brand_category_id: bc.id, kind: "SKU_ENRICHMENT", source_sku_id: skuId, actor_user_id: input.actor.userId ?? null, actor_label: input.actor.label } }); }
        await tx.priceMaterial.createMany({ data: input.priceMaterials.map((pm) => ({ id: randomUUID(), sku_id: skuId, supplier_vendor_id: pm.supplierVendorId, amount: requiredAmount(pm.amount), currency: requiredCurrency(pm.currency), unit_id: priceUnitId, notes: pm.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label })) });
        await writeAudit(ports, tx, { action: "sku.created", entityType: "sku", entityId: skuId, actor: input.actor, metadata: { slug: identity.slug, brand_id: input.brandId, categories: categoryIds.length, prices: input.priceMaterials.length, purchase_to_base_factor: measurement.purchase_to_base_factor } });
        return { skuId };
      });
    },

    async updateSku(input: { grants: PermissionGrants; actor: AuditActor; skuId: string; name?: string | null; code?: string | null; notes?: string | null; brandId?: string | null; baseUnitId: string; purchaseUnitId?: string | null; dimensionLength?: string | null; dimensionWidth?: string | null; dimensionThickness?: string | null; dimensionUnitId?: string | null; categoryId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      const identity = resolveSkuIdentity(input.name, input.code);
      if (!input.categoryId) throw new AppError("VALIDATION", "SKU_CATEGORY_REQUIRED", "At least one category is required.");
      const categoryIds = [input.categoryId];
      return runTransaction(async (tx) => {
        const existing = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId }, include: { categories: true } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "SKU_ARCHIVED", "Cannot update an archived SKU.");
        const baseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } });
        if (baseUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_BASE_UNIT_INACTIVE", "Base unit must be active.");
        let purchaseUnit = null;
        if (input.purchaseUnitId) { purchaseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.purchaseUnitId } }); if (purchaseUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_PURCHASE_UNIT_INACTIVE", "Purchase unit must be active."); }
        const measurementWasProvided = [input.dimensionLength, input.dimensionWidth, input.dimensionThickness, input.dimensionUnitId].some((value) => value !== undefined);
        const measurementInput = measurementWasProvided ? input : { dimensionLength: existing.dimension_length?.toString() ?? null, dimensionWidth: existing.dimension_width?.toString() ?? null, dimensionThickness: existing.dimension_thickness?.toString() ?? null, dimensionUnitId: existing.dimension_unit_id };
        const measurement = await resolveSkuMeasurement(tx, measurementInput, baseUnit, purchaseUnit);
        const brand = input.brandId ? await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } }) : null;
        if (brand?.deleted_at) throw new AppError("VALIDATION", "SKU_BRAND_ARCHIVED", "Brand is archived.");
        if ((input.brandId || null) !== (existing.brand_id || null)) {
          const linkedPriceCount = await tx.priceMaterial.count({ where: { sku_id: input.skuId, deleted_at: null, source_link_id: { not: null } } });
          if (linkedPriceCount > 0) throw new AppError("CONFLICT", "SKU_BRAND_CHANGE_BLOCKED", "Brand cannot be changed while live material prices have source links. Clear source links first.");
        }
        const categories = await tx.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, kind: true, status: true } });
        if (categories.length !== categoryIds.length) throw new AppError("VALIDATION", "SKU_CATEGORY_NOT_FOUND", "One or more categories not found.");
        for (const cat of categories) { if (cat.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_CATEGORY_INACTIVE", `Category ${cat.id} is not active.`); if (cat.kind !== "PRODUCT") throw new AppError("VALIDATION", "SKU_CATEGORY_KIND_INVALID", "SKU categories must be PRODUCT categories."); }
        const liveMaterialPriceCount = await tx.priceMaterial.count({ where: { sku_id: input.skuId, deleted_at: null } });
        const nextMeasurement = { dimension_length: measurement.dimension_length, dimension_width: measurement.dimension_width, dimension_thickness: measurement.dimension_thickness, dimension_unit_id: measurement.dimension_unit_id, purchase_to_base_factor: measurement.purchase_to_base_factor };
        const measurementChanged = existing.base_unit_id !== input.baseUnitId || (existing.purchase_unit_id || null) !== (input.purchaseUnitId || null) || (existing.dimension_length?.toString() ?? null) !== nextMeasurement.dimension_length || (existing.dimension_width?.toString() ?? null) !== nextMeasurement.dimension_width || (existing.dimension_thickness?.toString() ?? null) !== nextMeasurement.dimension_thickness || (existing.dimension_unit_id || null) !== (nextMeasurement.dimension_unit_id || null) || (existing.purchase_to_base_factor?.toString() ?? null) !== nextMeasurement.purchase_to_base_factor;
        if (measurementChanged && liveMaterialPriceCount > 0) throw new AppError("CONFLICT", "SKU_MEASUREMENT_LOCKED_BY_PRICES", "SKU measurement and unit layout cannot change while live material prices exist.");
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== identity.name) { changes.name = { from: existing.name, to: identity.name }; changes.slug = { from: existing.slug, to: identity.slug }; }
        if ((existing.code || null) !== (input.code?.trim() || null)) changes.code = { from: existing.code, to: input.code?.trim() || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (existing.brand_id !== (input.brandId || null)) changes.brand_id = { from: existing.brand_id, to: input.brandId || null };
        const previousCategoryIds = existing.categories.map((row) => row.category_id).sort();
        const nextCategoryIds = [...categoryIds].sort();
        if (previousCategoryIds.join("\u0000") !== nextCategoryIds.join("\u0000")) changes.categories = { from: previousCategoryIds, to: nextCategoryIds };
        if (existing.base_unit_id !== input.baseUnitId) changes.base_unit_id = { from: existing.base_unit_id, to: input.baseUnitId };
        if ((existing.purchase_unit_id || null) !== (input.purchaseUnitId || null)) changes.purchase_unit_id = { from: existing.purchase_unit_id, to: input.purchaseUnitId || null };
        for (const [field, next] of Object.entries(measurement)) { const previousValue = existing[field as keyof typeof existing]; const previous = previousValue && typeof previousValue === "object" && "toString" in previousValue ? previousValue.toString() : previousValue ?? null; if (previous !== next) changes[field] = { from: previous, to: next }; }
        if (changes.name !== undefined || changes.brand_id !== undefined || Object.keys(changes).some((k) => k === "slug")) { const skuIdentityConflict = await tx.sku.findFirst({ where: { id: { not: input.skuId }, brand_id: input.brandId || null, slug: identity.slug, deleted_at: null }, select: { id: true } }); if (skuIdentityConflict) throw new AppError("CONFLICT", "SKU_IDENTITY_CONFLICT", "A live SKU already uses this identity."); }
        if (Object.keys(changes).length > 0) { try { await tx.sku.update({ where: { id: input.skuId }, data: { name: identity.name, slug: identity.slug, code: identity.code, notes: input.notes?.trim() || null, brand_id: input.brandId || null, base_unit_id: input.baseUnitId, purchase_unit_id: input.purchaseUnitId || null, ...measurement } }); } catch (error) { mapWriteError(error); } }
        if (changes.categories) { await tx.skuCategory.deleteMany({ where: { sku_id: input.skuId } }); await tx.skuCategory.createMany({ data: categoryIds.map((categoryId) => ({ id: randomUUID(), sku_id: input.skuId, category_id: categoryId })) }); }
        const touchedBrandCategoryIds = await tx.brandCategoryOrigin.findMany({ where: { source_sku_id: input.skuId }, select: { brand_category_id: true } }).then((rows) => rows.map((row) => row.brand_category_id));
        await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: input.skuId } });
        const productCategoryIds = categories.filter((c) => c.kind === "PRODUCT").map((c) => c.id);
        for (const catId of input.brandId ? productCategoryIds : []) { let bc = await tx.brandCategory.findUnique({ where: { brand_id_category_id: { brand_id: input.brandId!, category_id: catId } } }); if (!bc) { bc = await tx.brandCategory.create({ data: { id: randomUUID(), brand_id: input.brandId!, category_id: catId } }); } await tx.brandCategoryOrigin.create({ data: { id: randomUUID(), brand_category_id: bc.id, kind: "SKU_ENRICHMENT", source_sku_id: input.skuId, actor_user_id: input.actor.userId ?? null, actor_label: input.actor.label } }); }
        await pruneOriginlessBrandCategories(tx, touchedBrandCategoryIds);
        if (Object.keys(changes).length > 0) await writeAudit(ports, tx, { action: "sku.updated", entityType: "sku", entityId: input.skuId, actor: input.actor, changes });
        return { skuId: input.skuId };
      });
    },

    async archiveSku(input: { grants: PermissionGrants; actor: AuditActor; skuId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at !== null) throw new AppError("CONFLICT", "SKU_ALREADY_ARCHIVED", "SKU is already archived.");
        const now = new Date();
        await addDirectCause(tx, "sku", input.skuId);
        await tx.sku.update({ where: { id: input.skuId }, data: { deleted_at: now } });
        const prices = await tx.priceMaterial.findMany({ where: { sku_id: input.skuId }, select: { id: true, deleted_at: true } });
        const priceIds = prices.map((price) => price.id);
        if (priceIds.length > 0) { await addParentCauses(tx, "price_material", "sku", input.skuId, priceIds); await tx.priceMaterial.updateMany({ where: { id: { in: priceIds }, deleted_at: null }, data: { deleted_at: now } }); }
        await writeAudit(ports, tx, { action: "sku.archived", entityType: "sku", entityId: input.skuId, actor: input.actor, metadata: { prices_archived: prices.filter((price) => price.deleted_at === null).length } });
        return { skuId: input.skuId };
      });
    },

    async restoreSku(input: { grants: PermissionGrants; actor: AuditActor; skuId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at === null) throw new AppError("CONFLICT", "SKU_NOT_ARCHIVED", "SKU is not archived.");
        await removeDirectCause(tx, "sku", input.skuId);
        const remaining = await tx.archiveCause.count({ where: { entity_type: "sku", entity_id: input.skuId } });
        if (remaining > 0) throw new AppError("CONFLICT", "SKU_HAS_PARENT_CAUSES", "SKU cannot be restored while its parent (Brand) is still archived.");
        await assertSkuRestorable(tx, input.skuId);
        await tx.sku.update({ where: { id: input.skuId }, data: { deleted_at: null } });
        const restoredPriceIds = await removeParentCausesAndFindRestored(tx, "price_material", "sku", input.skuId);
        if (restoredPriceIds.length > 0) { for (const priceId of restoredPriceIds) await assertPriceMaterialRestorable(tx, priceId); await tx.priceMaterial.updateMany({ where: { id: { in: restoredPriceIds } }, data: { deleted_at: null } }); }
        await writeAudit(ports, tx, { action: "sku.restored", entityType: "sku", entityId: input.skuId, actor: input.actor, metadata: { prices_restored: restoredPriceIds.length } });
        return { skuId: input.skuId };
      });
    },

    async requestSkuDeletion(input: { grants: PermissionGrants; actor: AuditActor; skuId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at === null) throw new AppError("VALIDATION", "SKU_NOT_ARCHIVED", "Only archived SKUs may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "sku", targetId: input.skuId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "sku.deletion-requested", entityType: "sku", entityId: input.skuId, actor: input.actor });
        return { requestId };
      });
    },
  };
}

