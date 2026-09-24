import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredSlug, requiredCurrency, requiredAmount, assertVendorMaterialCapable, assertVendorLaborCapable, assertWorkPriceRestorable, assertPriceMaterialRestorable, addDirectCause, removeDirectCause, createDeletionRequest, writeAudit } from "./shared";

export function createPricingService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  return {
    async listPriceMaterials(input: { grants: PermissionGrants; search?: string; skuId?: string; supplierVendorId?: string; brandId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material prices.");
      const search = input.search?.trim();
      return db.priceMaterial.findMany({
        where: { ...(input.includeArchived ? {} : { deleted_at: null }), ...(input.skuId ? { sku_id: input.skuId } : {}), ...(input.supplierVendorId ? { supplier_vendor_id: input.supplierVendorId } : {}), ...(input.brandId ? { sku: { brand_id: input.brandId } } : {}), ...(search ? { OR: [{ sku: { name: { contains: search, mode: "insensitive" } } }, { supplier_vendor: { name: { contains: search, mode: "insensitive" } } }] } : {}) },
        orderBy: [{ sku: { name: "asc" } }, { supplier_vendor: { name: "asc" } }],
        select: { id: true, amount: true, currency: true, notes: true, updated_at: true, updated_by_label: true, deleted_at: true, sku: { select: { id: true, name: true, slug: true, code: true, brand: { select: { id: true, name: true, slug: true } } } }, supplier_vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } }, source_link: { select: { id: true, kind: true, url: true, label: true } } },
      });
    },

    async getPriceMaterial(input: { grants: PermissionGrants; priceMaterialId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material prices.");
      return db.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId }, include: { sku: { include: { brand: { select: { id: true, name: true, slug: true, links: true } }, base_unit: true, purchase_unit: true } }, supplier_vendor: true, unit: true, source_link: true } });
    },

    async createPriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; skuId: string; supplierVendorId: string; amount: string; currency: string; sourceLinkId?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx: any) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at !== null) throw new AppError("VALIDATION", "SKU_ARCHIVED", "SKU is archived.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.supplierVendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorMaterialCapable(tx, input.supplierVendorId);
        if (input.sourceLinkId) { const link = await tx.brandLink.findUniqueOrThrow({ where: { id: input.sourceLinkId } }); if (!sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_REQUIRED", "Source link requires a SKU Brand."); if (link.brand_id !== sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_MISMATCH", "Source link must belong to the SKU's Brand."); }
        const unitId = sku.purchase_unit_id ?? sku.base_unit_id;
        let price;
        try { price = await tx.priceMaterial.create({ data: { id: randomUUID(), sku_id: input.skuId, supplier_vendor_id: input.supplierVendorId, amount, currency, unit_id: unitId, source_link_id: input.sourceLinkId || null, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material.created", entityType: "price_material", entityId: price!.id, actor: input.actor, metadata: { sku_id: input.skuId, vendor_id: input.supplierVendorId } });
        return { priceMaterialId: price!.id };
      });
    },

    async updatePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string; amount: string; currency: string; unitId?: string; sourceLinkId?: string | null; notes?: string | null }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx: any) => {
        const existing = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId }, include: { sku: true } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ARCHIVED", "Cannot update an archived price.");
        if (input.sourceLinkId) { const link = await tx.brandLink.findUniqueOrThrow({ where: { id: input.sourceLinkId } }); if (!existing.sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_REQUIRED", "Source link requires a SKU Brand."); if (link.brand_id !== existing.sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_MISMATCH", "Source link must belong to the SKU's Brand."); }
        const unitId = input.unitId ?? existing.unit_id;
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "PRICE_UNIT_INACTIVE", "Unit must be active.");
        const allowedUnitId = existing.sku.purchase_unit_id ?? existing.sku.base_unit_id;
        if (unitId !== allowedUnitId) throw new AppError("VALIDATION", "PRICE_UNIT_SKU_MISMATCH", "Unit must match the SKU's purchase unit or base unit.");
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.unit_id !== unitId) changes.unit_id = { from: existing.unit_id, to: unitId };
        if (input.sourceLinkId !== undefined && (existing.source_link_id || null) !== (input.sourceLinkId || null)) changes.source_link_id = { from: existing.source_link_id, to: input.sourceLinkId || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length === 0) return { priceMaterialId: input.priceMaterialId };
        try { await tx.priceMaterial.update({ where: { id: input.priceMaterialId }, data: { amount, currency, unit_id: unitId, source_link_id: input.sourceLinkId !== undefined ? (input.sourceLinkId || null) : existing.source_link_id, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material.updated", entityType: "price_material", entityId: input.priceMaterialId, actor: input.actor, changes: Object.keys(changes).length > 0 ? changes : undefined });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async archivePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: price.sku_id }, select: { deleted_at: true } });
        if (sku.deleted_at === null) { const livePriceCount = await tx.priceMaterial.count({ where: { sku_id: price.sku_id, deleted_at: null } }); if (livePriceCount <= 1) throw new AppError("CONFLICT", "SKU_PRICE_REQUIRED", "A live SKU must retain at least one active material price."); }
        await addDirectCause(tx, "price_material", input.priceMaterialId);
        await tx.priceMaterial.update({ where: { id: input.priceMaterialId }, data: { deleted_at: new Date() } });
        await writeAudit(ports, tx, { action: "price-material.archived", entityType: "price_material", entityId: input.priceMaterialId, actor: input.actor });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async restorePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price is not archived.");
        await removeDirectCause(tx, "price_material", input.priceMaterialId);
        const remaining = await tx.archiveCause.count({ where: { entity_type: "price_material", entity_id: input.priceMaterialId } });
        if (remaining > 0) throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent is still archived.");
        await assertPriceMaterialRestorable(tx, input.priceMaterialId);
        await tx.priceMaterial.update({ where: { id: input.priceMaterialId }, data: { deleted_at: null } });
        await writeAudit(ports, tx, { action: "price-material.restored", entityType: "price_material", entityId: input.priceMaterialId, actor: input.actor });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async requestPriceMaterialDeletion(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at === null) throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "price_material", targetId: input.priceMaterialId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "price-material.deletion-requested", entityType: "price_material", entityId: input.priceMaterialId, actor: input.actor });
        return { requestId };
      });
    },

    async listPriceMaterialLabors(input: { grants: PermissionGrants; search?: string; categoryId?: string; vendorId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view material + labor prices.");
      const search = input.search?.trim();
      return db.priceMaterialLabor.findMany({
        where: { ...(input.includeArchived ? {} : { deleted_at: null }), ...(input.categoryId ? { category_id: input.categoryId } : {}), ...(input.vendorId ? { vendor_id: input.vendorId } : {}), ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { vendor: { name: { contains: search, mode: "insensitive" } } }, { category: { name: { contains: search, mode: "insensitive" } } }] } : {}) },
        orderBy: [{ name: "asc" }, { vendor: { name: "asc" } }],
        select: { id: true, name: true, slug: true, amount: true, currency: true, scope_note: true, spec: true, dim_display: true, notes: true, updated_at: true, updated_by_label: true, deleted_at: true, category: { select: { id: true, name: true, slug: true } }, vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } } },
      });
    },

    async getPriceMaterialLabor(input: { grants: PermissionGrants; priceMaterialLaborId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view material + labor prices.");
      return db.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId }, include: { category: true, vendor: true, unit: true } });
    },

    async createPriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; scopeNote?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx: any) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);
        let price;
        try { price = await tx.priceMaterialLabor.create({ data: { id: randomUUID(), name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, currency, scope_note: input.scopeNote?.trim() || null, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material-labor.created", entityType: "price_material_labor", entityId: price!.id, actor: input.actor, metadata: { vendor_id: input.vendorId, category_id: input.categoryId } });
        return { priceMaterialLaborId: price!.id };
      });
    },

    async updatePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; scopeNote?: string | null; notes?: string | null }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx: any) => {
        const existing = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ARCHIVED", "Cannot update an archived price.");
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.category_id !== input.categoryId) changes.category_id = { from: existing.category_id, to: input.categoryId };
        if (existing.vendor_id !== input.vendorId) changes.vendor_id = { from: existing.vendor_id, to: input.vendorId };
        if (existing.unit_id !== input.unitId) changes.unit_id = { from: existing.unit_id, to: input.unitId };
        if ((existing.scope_note || null) !== (input.scopeNote?.trim() || null)) changes.scope_note = { from: existing.scope_note, to: input.scopeNote?.trim() || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length === 0) return { priceMaterialLaborId: input.priceMaterialLaborId };
        try { await tx.priceMaterialLabor.update({ where: { id: input.priceMaterialLaborId }, data: { name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, currency, scope_note: input.scopeNote?.trim() || null, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material-labor.updated", entityType: "price_material_labor", entityId: input.priceMaterialLaborId, actor: input.actor, changes: Object.keys(changes).length > 0 ? changes : undefined });
        return { priceMaterialLaborId: input.priceMaterialLaborId };
      });
    },

    async archivePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        await addDirectCause(tx, "price_material_labor", input.priceMaterialLaborId);
        await tx.priceMaterialLabor.update({ where: { id: input.priceMaterialLaborId }, data: { deleted_at: new Date() } });
        await writeAudit(ports, tx, { action: "price-material-labor.archived", entityType: "price_material_labor", entityId: input.priceMaterialLaborId, actor: input.actor });
        return { priceMaterialLaborId: input.priceMaterialLaborId };
      });
    },

    async restorePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price is not archived.");
        await removeDirectCause(tx, "price_material_labor", input.priceMaterialLaborId);
        const remaining = await tx.archiveCause.count({ where: { entity_type: "price_material_labor", entity_id: input.priceMaterialLaborId } });
        if (remaining > 0) throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent Supplier is still archived.");
        await assertWorkPriceRestorable(tx, "material-labor", input.priceMaterialLaborId);
        await tx.priceMaterialLabor.update({ where: { id: input.priceMaterialLaborId }, data: { deleted_at: null } });
        await writeAudit(ports, tx, { action: "price-material-labor.restored", entityType: "price_material_labor", entityId: input.priceMaterialLaborId, actor: input.actor });
        return { priceMaterialLaborId: input.priceMaterialLaborId };
      });
    },

    async requestPriceMaterialLaborDeletion(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (price.deleted_at === null) throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "price_material_labor", targetId: input.priceMaterialLaborId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "price-material-labor.deletion-requested", entityType: "price_material_labor", entityId: input.priceMaterialLaborId, actor: input.actor });
        return { requestId };
      });
    },

    async listPriceLabors(input: { grants: PermissionGrants; search?: string; categoryId?: string; vendorId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view labor prices.");
      const search = input.search?.trim();
      return db.priceLabor.findMany({
        where: { ...(input.includeArchived ? {} : { deleted_at: null }), ...(input.categoryId ? { category_id: input.categoryId } : {}), ...(input.vendorId ? { vendor_id: input.vendorId } : {}), ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { vendor: { name: { contains: search, mode: "insensitive" } } }, { category: { name: { contains: search, mode: "insensitive" } } }] } : {}) },
        orderBy: [{ name: "asc" }, { vendor: { name: "asc" } }],
        select: { id: true, name: true, slug: true, amount: true, currency: true, spec: true, dim_display: true, notes: true, updated_at: true, updated_by_label: true, deleted_at: true, category: { select: { id: true, name: true, slug: true } }, vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } } },
      });
    },

    async getPriceLabor(input: { grants: PermissionGrants; priceLaborId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view labor prices.");
      return db.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId }, include: { category: true, vendor: true, unit: true } });
    },

    async createPriceLabor(input: { grants: PermissionGrants; actor: AuditActor; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx: any) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);
        let price;
        try { price = await tx.priceLabor.create({ data: { id: randomUUID(), name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, currency, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-labor.created", entityType: "price_labor", entityId: price!.id, actor: input.actor, metadata: { vendor_id: input.vendorId, category_id: input.categoryId } });
        return { priceLaborId: price!.id };
      });
    },

    async updatePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; notes?: string | null }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx: any) => {
        const existing = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ARCHIVED", "Cannot update an archived price.");
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.category_id !== input.categoryId) changes.category_id = { from: existing.category_id, to: input.categoryId };
        if (existing.vendor_id !== input.vendorId) changes.vendor_id = { from: existing.vendor_id, to: input.vendorId };
        if (existing.unit_id !== input.unitId) changes.unit_id = { from: existing.unit_id, to: input.unitId };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length === 0) return { priceLaborId: input.priceLaborId };
        try { await tx.priceLabor.update({ where: { id: input.priceLaborId }, data: { name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, currency, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-labor.updated", entityType: "price_labor", entityId: input.priceLaborId, actor: input.actor, changes: Object.keys(changes).length > 0 ? changes : undefined });
        return { priceLaborId: input.priceLaborId };
      });
    },

    async archivePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        await addDirectCause(tx, "price_labor", input.priceLaborId);
        await tx.priceLabor.update({ where: { id: input.priceLaborId }, data: { deleted_at: new Date() } });
        await writeAudit(ports, tx, { action: "price-labor.archived", entityType: "price_labor", entityId: input.priceLaborId, actor: input.actor });
        return { priceLaborId: input.priceLaborId };
      });
    },

    async restorePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price is not archived.");
        await removeDirectCause(tx, "price_labor", input.priceLaborId);
        const remaining = await tx.archiveCause.count({ where: { entity_type: "price_labor", entity_id: input.priceLaborId } });
        if (remaining > 0) throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent Supplier is still archived.");
        await assertWorkPriceRestorable(tx, "labor", input.priceLaborId);
        await tx.priceLabor.update({ where: { id: input.priceLaborId }, data: { deleted_at: null } });
        await writeAudit(ports, tx, { action: "price-labor.restored", entityType: "price_labor", entityId: input.priceLaborId, actor: input.actor });
        return { priceLaborId: input.priceLaborId };
      });
    },

    async requestPriceLaborDeletion(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at === null) throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "price_labor", targetId: input.priceLaborId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "price-labor.deletion-requested", entityType: "price_labor", entityId: input.priceLaborId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
