import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { parsePriceAmount } from "../domain/price-amount";
import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, type TxClient, asPrismaClient, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredTitleName, requiredSlug, requiredCurrency, requiredPriceAmount, assertVendorMaterialCapable, assertVendorLaborCapable, assertVendorWorkCapable, assertPriceMaterialBrandSupplierChain, ensurePriceMaterialBrandSupplierLink, ensureVendorCategory, assertWorkPriceRestorable, assertPriceMaterialRestorable, addDirectCause, removeDirectCause, createDeletionRequest, writeAudit } from "./shared";

/** A grid cell that is blank, "-" or "n/a" is not offered and skipped; unreadable text stays so its row reports the problem. */
function isOffered(text: string): boolean {
  try { return parsePriceAmount(text).kind !== "not-offered"; } catch { return true; }
}

export const BULK_PRICE_ROW_LIMIT = 100;
export const MATRIX_SUPPLIER_LIMIT = 12;

export type BulkRowError = { rowIndex: number; field: string | null; code: string; message: string };
type OnInvalid = "reject-all" | "save-valid";

function bulkErrorField(code: string): string | null {
  if (code.includes("NAME") || code.includes("IDENTITY") || code === "BULK_DUPLICATE_IN_BATCH") return "name";
  if (code.includes("AMOUNT") || code.includes("LABEL")) return "amount";
  if (code.includes("UNIT")) return "unitId";
  if (code.includes("SKU") || code.includes("PAIR") || code.includes("BRAND")) return "skuId";
  return null;
}

export function createPricingService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  // Saving a price files the supplier under that price's category, so a supplier's categories grow with real use.
  async function linkVendorCategories(tx: TxClient, actor: AuditActor, vendorId: string, categoryIds: readonly string[]) {
    const added: string[] = [];
    for (const categoryId of new Set(categoryIds)) if (await ensureVendorCategory(tx, vendorId, categoryId)) added.push(categoryId);
    if (added.length > 0) await writeAudit(ports, tx, { action: "vendor.categories-linked", entityType: "vendor", entityId: vendorId, actor, metadata: { category_ids: added, via: "price" } });
  }

  return {
    async listPriceMaterials(input: { grants: PermissionGrants; search?: string; skuId?: string; supplierVendorId?: string; brandId?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material prices.");
      const search = input.search?.trim();
      return db.priceMaterial.findMany({
        where: { ...(input.includeArchived ? {} : { deleted_at: null }), ...(input.skuId ? { sku_id: input.skuId } : {}), ...(input.supplierVendorId ? { supplier_vendor_id: input.supplierVendorId } : {}), ...(input.brandId ? { sku: { brand_id: input.brandId } } : {}), ...(search ? { OR: [{ sku: { name: { contains: search, mode: "insensitive" } } }, { supplier_vendor: { name: { contains: search, mode: "insensitive" } } }] } : {}) },
        orderBy: [{ sku: { name: "asc" } }, { supplier_vendor: { name: "asc" } }],
        select: { id: true, amount: true, amount_label: true, currency: true, notes: true, updated_at: true, updated_by_label: true, deleted_at: true, sku: { select: { id: true, name: true, slug: true, code: true, brand: { select: { id: true, name: true, slug: true } }, categories: { select: { category: { select: { id: true, name: true } } } }, dimension_length: true, dimension_width: true, dimension_thickness: true, dimension_unit: { select: { code: true } } } }, supplier_vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } }, source_link: { select: { id: true, kind: true, url: true, label: true } } },
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
      const { amount, label: amountLabel } = requiredPriceAmount(input.amount);
      return runTransaction(async (tx: TxClient) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at !== null) throw new AppError("VALIDATION", "SKU_ARCHIVED", "SKU is archived.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.supplierVendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorMaterialCapable(tx, input.supplierVendorId);
        await ensurePriceMaterialBrandSupplierLink(tx, ports, input.actor, input.skuId, input.supplierVendorId);
        if (input.sourceLinkId) { const link = await tx.brandLink.findUniqueOrThrow({ where: { id: input.sourceLinkId } }); if (!sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_REQUIRED", "Source link requires a SKU Brand."); if (link.brand_id !== sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_MISMATCH", "Source link must belong to the SKU's Brand."); }
        const unitId = sku.purchase_unit_id ?? sku.base_unit_id;
        let price;
        try { price = await tx.priceMaterial.create({ data: { id: randomUUID(), sku_id: input.skuId, supplier_vendor_id: input.supplierVendorId, amount, amount_label: amountLabel, currency, unit_id: unitId, source_link_id: input.sourceLinkId || null, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material.created", entityType: "price_material", entityId: price!.id, actor: input.actor, metadata: { sku_id: input.skuId, vendor_id: input.supplierVendorId } });
        await linkVendorCategories(tx, input.actor, input.supplierVendorId, (await tx.skuCategory.findMany({ where: { sku_id: input.skuId }, select: { category_id: true } })).map((row) => row.category_id));
        return { priceMaterialId: price!.id };
      });
    },

    async updatePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string; amount: string; currency: string; unitId?: string; sourceLinkId?: string | null; notes?: string | null }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      const currency = requiredCurrency(input.currency);
      const { amount, label: amountLabel } = requiredPriceAmount(input.amount);
      return runTransaction(async (tx: TxClient) => {
        const existing = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId }, include: { sku: true } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ARCHIVED", "Cannot update an archived price.");
        await assertPriceMaterialBrandSupplierChain(tx, existing.sku_id, existing.supplier_vendor_id);
        if (input.sourceLinkId) { const link = await tx.brandLink.findUniqueOrThrow({ where: { id: input.sourceLinkId } }); if (!existing.sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_REQUIRED", "Source link requires a SKU Brand."); if (link.brand_id !== existing.sku.brand_id) throw new AppError("VALIDATION", "LINK_BRAND_MISMATCH", "Source link must belong to the SKU's Brand."); }
        const unitId = input.unitId ?? existing.unit_id;
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "PRICE_UNIT_INACTIVE", "Unit must be active.");
        const allowedUnitId = existing.sku.purchase_unit_id ?? existing.sku.base_unit_id;
        if (unitId !== allowedUnitId) throw new AppError("VALIDATION", "PRICE_UNIT_SKU_MISMATCH", "Unit must match the SKU's purchase unit or base unit.");
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if ((existing.amount_label ?? null) !== amountLabel) changes.amount_label = { from: existing.amount_label ?? null, to: amountLabel };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.unit_id !== unitId) changes.unit_id = { from: existing.unit_id, to: unitId };
        if (input.sourceLinkId !== undefined && (existing.source_link_id || null) !== (input.sourceLinkId || null)) changes.source_link_id = { from: existing.source_link_id, to: input.sourceLinkId || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length === 0) return { priceMaterialId: input.priceMaterialId };
        try { await tx.priceMaterial.update({ where: { id: input.priceMaterialId }, data: { amount, amount_label: amountLabel, currency, unit_id: unitId, source_link_id: input.sourceLinkId !== undefined ? (input.sourceLinkId || null) : existing.source_link_id, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material.updated", entityType: "price_material", entityId: input.priceMaterialId, actor: input.actor, changes: Object.keys(changes).length > 0 ? changes : undefined });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async archivePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: TxClient) => {
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
      return runTransaction(async (tx: TxClient) => {
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
      return runTransaction(async (tx: TxClient) => {
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
        select: { id: true, name: true, slug: true, amount: true, amount_label: true, currency: true, scope_note: true, spec: true, dim_display: true, notes: true, updated_at: true, updated_by_label: true, deleted_at: true, category: { select: { id: true, name: true, slug: true } }, vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } } },
      });
    },

    async getPriceMaterialLabor(input: { grants: PermissionGrants; priceMaterialLaborId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view material + labor prices.");
      return db.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId }, include: { category: true, vendor: true, unit: true } });
    },

    async createPriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; scopeNote?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredTitleName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const { amount, label: amountLabel } = requiredPriceAmount(input.amount);
      return runTransaction(async (tx: TxClient) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorWorkCapable(tx, input.vendorId);
        let price;
        try { price = await tx.priceMaterialLabor.create({ data: { id: randomUUID(), name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, amount_label: amountLabel, currency, scope_note: input.scopeNote?.trim() || null, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material-labor.created", entityType: "price_material_labor", entityId: price!.id, actor: input.actor, metadata: { vendor_id: input.vendorId, category_id: input.categoryId } });
        await linkVendorCategories(tx, input.actor, input.vendorId, [input.categoryId]);
        return { priceMaterialLaborId: price!.id };
      });
    },

    async updatePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; scopeNote?: string | null; notes?: string | null }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredTitleName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const { amount, label: amountLabel } = requiredPriceAmount(input.amount);
      return runTransaction(async (tx: TxClient) => {
        const existing = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (existing.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ARCHIVED", "Cannot update an archived price.");
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorWorkCapable(tx, input.vendorId);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if ((existing.amount_label ?? null) !== amountLabel) changes.amount_label = { from: existing.amount_label ?? null, to: amountLabel };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.category_id !== input.categoryId) changes.category_id = { from: existing.category_id, to: input.categoryId };
        if (existing.vendor_id !== input.vendorId) changes.vendor_id = { from: existing.vendor_id, to: input.vendorId };
        if (existing.unit_id !== input.unitId) changes.unit_id = { from: existing.unit_id, to: input.unitId };
        if ((existing.scope_note || null) !== (input.scopeNote?.trim() || null)) changes.scope_note = { from: existing.scope_note, to: input.scopeNote?.trim() || null };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length === 0) return { priceMaterialLaborId: input.priceMaterialLaborId };
        try { await tx.priceMaterialLabor.update({ where: { id: input.priceMaterialLaborId }, data: { name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, amount_label: amountLabel, currency, scope_note: input.scopeNote?.trim() || null, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-material-labor.updated", entityType: "price_material_labor", entityId: input.priceMaterialLaborId, actor: input.actor, changes: Object.keys(changes).length > 0 ? changes : undefined });
        await linkVendorCategories(tx, input.actor, input.vendorId, [input.categoryId]);
        return { priceMaterialLaborId: input.priceMaterialLaborId };
      });
    },

    async archivePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: TxClient) => {
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
      return runTransaction(async (tx: TxClient) => {
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
      return runTransaction(async (tx: TxClient) => {
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
        select: { id: true, name: true, slug: true, amount: true, amount_label: true, currency: true, spec: true, dim_display: true, notes: true, updated_at: true, updated_by_label: true, deleted_at: true, category: { select: { id: true, name: true, slug: true } }, vendor: { select: { id: true, name: true, slug: true } }, unit: { select: { id: true, code: true, name: true } } },
      });
    },

    async getPriceLabor(input: { grants: PermissionGrants; priceLaborId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view labor prices.");
      return db.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId }, include: { category: true, vendor: true, unit: true } });
    },

    /**
     * Creates many work prices for one supplier and one category in a single transaction. Every row goes through the
     * same single-price service (so every rule is identical); if any row fails the whole batch is rolled back and all
     * row problems are returned together in `details.rows`.
     */
    async createWorkPricesBulk(input: { grants: PermissionGrants; actor: AuditActor; kind: "labor" | "material-labor"; vendorId: string; categoryId: string; currency: string; rows: Array<{ name: string; unitId: string; amount: string; notes?: string | null; scopeNote?: string | null }>; onInvalid?: OnInvalid; writeBatchAudit?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      if (input.rows.length === 0) throw new AppError("VALIDATION", "BULK_EMPTY", "Add at least one row.");
      if (input.rows.length > BULK_PRICE_ROW_LIMIT) throw new AppError("VALIDATION", "BULK_TOO_MANY_ROWS", `A batch holds at most ${BULK_PRICE_ROW_LIMIT} rows.`);
      if (input.onInvalid === "save-valid") {
        const errors: BulkRowError[] = []; const ids: string[] = []; const batchId = randomUUID(); const seen = new Map<string, number>();
        const existing = input.kind === "labor" ? await db.priceLabor.findMany({ where: { vendor_id: input.vendorId, deleted_at: null }, select: { name: true, slug: true } }) : await db.priceMaterialLabor.findMany({ where: { vendor_id: input.vendorId, deleted_at: null }, select: { name: true, slug: true } });
        const liveNames = new Set(existing.flatMap((row) => [row.name.trim().toLowerCase(), row.slug]));
        for (const [rowIndex, row] of input.rows.entries()) {
          const slugKey = (() => { try { return requiredSlug(row.name); } catch { return ""; } })(); const key = slugKey || row.name.trim().toLowerCase();
          if (key && seen.has(key)) { errors.push({ rowIndex, field: "name", code: "BULK_DUPLICATE_IN_BATCH", message: "Same name as another row in this batch." }); continue; }
          if (key) seen.set(key, rowIndex);
          if (key && (liveNames.has(key) || (slugKey && liveNames.has(slugKey)))) { errors.push({ rowIndex, field: "name", code: "PRICE_IDENTITY_CONFLICT", message: "This supplier already has a price with this name. Make the name more specific." }); continue; }
          try {
            const created = await runTransaction(async (rowTx: TxClient) => {
              const inner = createPricingService(asPrismaClient(rowTx), { ...ports, runTransaction: async (work) => work(rowTx) });
              const common = { grants: input.grants, actor: input.actor, name: row.name, categoryId: input.categoryId, vendorId: input.vendorId, unitId: row.unitId, amount: row.amount, currency: input.currency, notes: row.notes ?? undefined };
              return input.kind === "labor" ? inner.createPriceLabor(common) : inner.createPriceMaterialLabor({ ...common, scopeNote: row.scopeNote ?? undefined });
            });
            ids.push("priceLaborId" in created ? created.priceLaborId : created.priceMaterialLaborId); if (key) { liveNames.add(key); if (slugKey) liveNames.add(slugKey); }
          } catch (error) { errors.push(error instanceof AppError ? { rowIndex, field: bulkErrorField(error.code), code: error.code, message: error.safeMessage } : { rowIndex, field: null, code: "PRICE_SAVE_FAILED", message: "This row could not be saved." }); }
        }
        if (ids.length === 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${errors.length} row(s) need fixing. Nothing was saved.`, { details: { rows: errors } });
        if (input.writeBatchAudit !== false) await runTransaction((auditTx: TxClient) => writeAudit(ports, auditTx, { action: "price-bulk.created", entityType: "vendor", entityId: input.vendorId, actor: input.actor, metadata: { batch_id: batchId, kind: input.kind, count: ids.length, rejected_count: errors.length, category_id: input.categoryId } }));
        return { batchId, ids, rejected: errors };
      }
      return runTransaction(async (tx: TxClient) => {
        const inner = createPricingService(asPrismaClient(tx), { ...ports, runTransaction: async (work) => work(tx) });
        const errors: BulkRowError[] = [];
        const batchId = randomUUID();
        const seen = new Map<string, number>();
        const existing = input.kind === "labor"
          ? await tx.priceLabor.findMany({ where: { vendor_id: input.vendorId, deleted_at: null }, select: { name: true, slug: true } })
          : await tx.priceMaterialLabor.findMany({ where: { vendor_id: input.vendorId, deleted_at: null }, select: { name: true, slug: true } });
        const liveNames = new Set<string>(existing.flatMap((row: { name: string; slug: string }) => [row.name.trim().toLowerCase(), row.slug]));
        const ids: string[] = [];
        for (const [rowIndex, row] of input.rows.entries()) {
          const slugKey = (() => { try { return requiredSlug(row.name); } catch { return ""; } })();
          const key = slugKey || row.name.trim().toLowerCase(); // two names with the same slug are the same price to the database
          if (key && seen.has(key)) { errors.push({ rowIndex, field: "name", code: "BULK_DUPLICATE_IN_BATCH", message: "Same name as another row in this batch." }); continue; }
          if (key && (liveNames.has(key) || (slugKey && liveNames.has(slugKey)))) { errors.push({ rowIndex, field: "name", code: "PRICE_IDENTITY_CONFLICT", message: "This supplier already has a price with this name. Make the name more specific." }); continue; }
          if (key) seen.set(key, rowIndex);
          try {
            const common = { grants: input.grants, actor: input.actor, name: row.name, categoryId: input.categoryId, vendorId: input.vendorId, unitId: row.unitId, amount: row.amount, currency: input.currency, notes: row.notes ?? undefined };
            const created = input.kind === "labor"
              ? await inner.createPriceLabor(common)
              : await inner.createPriceMaterialLabor({ ...common, scopeNote: row.scopeNote ?? undefined });
            ids.push("priceLaborId" in created ? created.priceLaborId : created.priceMaterialLaborId);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            errors.push({ rowIndex, field: bulkErrorField(error.code), code: error.code, message: error.safeMessage });
          }
        }
        if (errors.length > 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${errors.length} row(s) need fixing. Nothing was saved.`, { details: { rows: errors } });
        await writeAudit(ports, tx, { action: "price-bulk.created", entityType: "vendor", entityId: input.vendorId, actor: input.actor, metadata: { batch_id: batchId, kind: input.kind, count: ids.length, category_id: input.categoryId } });
        return { batchId, ids };
      });
    },

    /**
     * Compare-suppliers entry: one category, several suppliers, rows of items with one amount per supplier (a blank cell
     * means that supplier has no price for the item). Runs the per-supplier bulk command for each supplier inside one
     * transaction, so the whole grid is all or nothing; every problem comes back as `details.rows` with its supplier.
     */
    async createWorkPriceMatrix(input: { grants: PermissionGrants; actor: AuditActor; kind: "labor" | "material-labor"; categoryId: string; currency: string; vendorIds: string[]; rows: Array<{ name: string; unitId: string; notes?: string | null; amounts: Record<string, string | null | undefined> }>; onInvalid?: OnInvalid }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const vendorIds = [...new Set(input.vendorIds)];
      if (vendorIds.length === 0) throw new AppError("VALIDATION", "BULK_EMPTY", "Choose at least one supplier.");
      if (vendorIds.length > MATRIX_SUPPLIER_LIMIT) throw new AppError("VALIDATION", "BULK_TOO_MANY_SUPPLIERS", `A grid compares at most ${MATRIX_SUPPLIER_LIMIT} suppliers.`);
      if (input.rows.length === 0) throw new AppError("VALIDATION", "BULK_EMPTY", "Add at least one row.");
      if (input.rows.length > BULK_PRICE_ROW_LIMIT) throw new AppError("VALIDATION", "BULK_TOO_MANY_ROWS", `A batch holds at most ${BULK_PRICE_ROW_LIMIT} rows.`);
      if (input.onInvalid === "save-valid") {
        const ids: string[] = []; const rejected: Array<BulkRowError & { vendorId: string }> = []; const batchId = randomUUID();
        for (const vendorId of vendorIds) {
          const picked = input.rows.map((row, rowIndex) => ({ row, rowIndex })).filter(({ row }) => isOffered(row.amounts[vendorId] ?? "")); if (picked.length === 0) continue;
          try {
            const result = await createPricingService(db, ports).createWorkPricesBulk({ grants: input.grants, actor: input.actor, kind: input.kind, vendorId, categoryId: input.categoryId, currency: input.currency, onInvalid: "save-valid", writeBatchAudit: false, rows: picked.map(({ row }) => ({ name: row.name, unitId: row.unitId, amount: row.amounts[vendorId]!, notes: row.notes ?? undefined })) });
            ids.push(...result.ids); for (const row of ("rejected" in result ? result.rejected : [])) rejected.push({ ...row, rowIndex: picked[row.rowIndex]?.rowIndex ?? row.rowIndex, vendorId });
          } catch (error) {
            if (error instanceof AppError && error.code === "BULK_ROWS_INVALID") {
              const rows = (error.details as { rows?: BulkRowError[] } | undefined)?.rows ?? [];
              for (const row of rows) rejected.push({ ...row, rowIndex: picked[row.rowIndex]?.rowIndex ?? row.rowIndex, vendorId });
            } else {
              // Earlier suppliers are already saved: report this supplier's cells instead of failing the whole call.
              const known = error instanceof AppError;
              for (const { rowIndex } of picked) rejected.push({ rowIndex, vendorId, field: null, code: known ? error.code : "PRICE_SAVE_FAILED", message: known ? error.safeMessage : "These prices could not be saved." });
            }
          }
        }
        if (ids.length === 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${rejected.length} cell(s) need fixing. Nothing was saved.`, { details: { rows: rejected } });
        await runTransaction((auditTx: TxClient) => writeAudit(ports, auditTx, { action: "price-matrix.created", entityType: "category", entityId: input.categoryId, actor: input.actor, metadata: { batch_id: batchId, kind: input.kind, suppliers: vendorIds.length, count: ids.length, rejected_count: rejected.length } }));
        return { batchId, ids, rejected };
      }
      return runTransaction(async (tx: TxClient) => {
        const inner = createPricingService(asPrismaClient(tx), { ...ports, runTransaction: async (work) => work(tx) });
        const errors: Array<BulkRowError & { vendorId: string }> = [];
        const ids: string[] = [];
        const batchId = randomUUID();
        for (const vendorId of vendorIds) {
          const picked = input.rows.map((row, rowIndex) => ({ row, rowIndex })).filter(({ row }) => isOffered(row.amounts[vendorId] ?? ""));
          if (picked.length === 0) continue;
          try {
            const created = await inner.createWorkPricesBulk({ grants: input.grants, actor: input.actor, kind: input.kind, vendorId, categoryId: input.categoryId, currency: input.currency, rows: picked.map(({ row }) => ({ name: row.name, unitId: row.unitId, amount: row.amounts[vendorId]!, notes: row.notes ?? undefined })) });
            ids.push(...created.ids);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            const detailRows = (error.details as { rows?: BulkRowError[] } | undefined)?.rows;
            if (error.code === "BULK_ROWS_INVALID" && detailRows) {
              for (const detail of detailRows) errors.push({ ...detail, rowIndex: picked[detail.rowIndex]?.rowIndex ?? detail.rowIndex, vendorId });
            } else {
              errors.push({ rowIndex: picked[0]!.rowIndex, vendorId, field: null, code: error.code, message: error.safeMessage });
            }
          }
        }
        if (errors.length === 0 && ids.length === 0) throw new AppError("VALIDATION", "BULK_EMPTY", "Enter at least one amount.");
        if (errors.length > 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${errors.length} cell(s) need fixing. Nothing was saved.`, { details: { rows: errors } });
        await writeAudit(ports, tx, { action: "price-matrix.created", entityType: "category", entityId: input.categoryId, actor: input.actor, metadata: { batch_id: batchId, kind: input.kind, suppliers: vendorIds.length, count: ids.length } });
        return { batchId, ids };
      });
    },

    /**
     * Creates many material prices (existing SKUs), each row naming its own supplier, all or nothing. A SKU can be priced
     * by several suppliers and one supplier can price many SKUs in the same save. Row problems come back in `details.rows`.
     */
    async createMaterialPriceRows(input: { grants: PermissionGrants; actor: AuditActor; currency: string; rows: Array<{ skuId: string; vendorId: string; amount: string; notes?: string | null }>; onInvalid?: OnInvalid; writeBatchAudit?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      if (input.rows.length === 0) throw new AppError("VALIDATION", "BULK_EMPTY", "Add at least one row.");
      if (input.rows.length > BULK_PRICE_ROW_LIMIT) throw new AppError("VALIDATION", "BULK_TOO_MANY_ROWS", `A batch holds at most ${BULK_PRICE_ROW_LIMIT} rows.`);
      if (input.onInvalid === "save-valid") {
        const errors: BulkRowError[] = []; const ids: string[] = []; const batchId = randomUUID(); const seen = new Map<string, number>();
        const vendorIds = [...new Set(input.rows.map((row) => row.vendorId))]; const live = await db.priceMaterial.findMany({ where: { supplier_vendor_id: { in: vendorIds }, deleted_at: null }, select: { sku_id: true, supplier_vendor_id: true } }); const taken = new Set(live.map((row) => `${row.supplier_vendor_id}|${row.sku_id}`));
        for (const [rowIndex, row] of input.rows.entries()) {
          const pair = `${row.vendorId}|${row.skuId}`;
          if (seen.has(pair)) { errors.push({ rowIndex, field: "skuId", code: "BULK_DUPLICATE_IN_BATCH", message: "Same SKU and supplier as another row in this batch." }); continue; }
          seen.set(pair, rowIndex); if (taken.has(pair)) { errors.push({ rowIndex, field: "skuId", code: "PRICE_PAIR_CONFLICT", message: "This supplier already has a live price for this SKU. Edit that price instead." }); continue; }
          try { const created = await runTransaction(async (rowTx: TxClient) => createPricingService(asPrismaClient(rowTx), { ...ports, runTransaction: async (work) => work(rowTx) }).createPriceMaterial({ grants: input.grants, actor: input.actor, skuId: row.skuId, supplierVendorId: row.vendorId, amount: row.amount, currency: input.currency, notes: row.notes ?? undefined })); ids.push(created.priceMaterialId); taken.add(pair); }
          catch (error) { errors.push(error instanceof AppError ? { rowIndex, field: bulkErrorField(error.code), code: error.code, message: error.safeMessage } : { rowIndex, field: null, code: "PRICE_SAVE_FAILED", message: "This row could not be saved." }); }
        }
        if (ids.length === 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${errors.length} row(s) need fixing. Nothing was saved.`, { details: { rows: errors } });
        const single = vendorIds.length === 1; if (input.writeBatchAudit !== false) await runTransaction((auditTx: TxClient) => writeAudit(ports, auditTx, { action: "price-bulk.created", entityType: single ? "vendor" : "price_batch", entityId: single ? vendorIds[0]! : batchId, actor: input.actor, metadata: { batch_id: batchId, kind: "material", count: ids.length, rejected_count: errors.length, suppliers: vendorIds.length } }));
        return { batchId, ids, rejected: errors };
      }
      return runTransaction(async (tx: TxClient) => {
        const inner = createPricingService(asPrismaClient(tx), { ...ports, runTransaction: async (work) => work(tx) });
        const errors: BulkRowError[] = [];
        const batchId = randomUUID();
        const vendorIds = [...new Set(input.rows.map((row) => row.vendorId))];
        const live = await tx.priceMaterial.findMany({ where: { supplier_vendor_id: { in: vendorIds }, deleted_at: null }, select: { sku_id: true, supplier_vendor_id: true } });
        const taken = new Set<string>(live.map((row: { sku_id: string; supplier_vendor_id: string }) => `${row.supplier_vendor_id}|${row.sku_id}`));
        const seen = new Map<string, number>();
        const ids: string[] = [];
        for (const [rowIndex, row] of input.rows.entries()) {
          const pair = `${row.vendorId}|${row.skuId}`;
          if (seen.has(pair)) { errors.push({ rowIndex, field: "skuId", code: "BULK_DUPLICATE_IN_BATCH", message: "Same SKU and supplier as another row in this batch." }); continue; }
          seen.set(pair, rowIndex);
          if (taken.has(pair)) { errors.push({ rowIndex, field: "skuId", code: "PRICE_PAIR_CONFLICT", message: "This supplier already has a live price for this SKU. Edit that price instead." }); continue; }
          try {
            const created = await inner.createPriceMaterial({ grants: input.grants, actor: input.actor, skuId: row.skuId, supplierVendorId: row.vendorId, amount: row.amount, currency: input.currency, notes: row.notes ?? undefined });
            ids.push(created.priceMaterialId);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            errors.push({ rowIndex, field: bulkErrorField(error.code), code: error.code, message: error.safeMessage });
          }
        }
        if (errors.length > 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${errors.length} row(s) need fixing. Nothing was saved.`, { details: { rows: errors } });
        const single = vendorIds.length === 1;
        if (input.writeBatchAudit !== false) await writeAudit(ports, tx, { action: "price-bulk.created", entityType: single ? "vendor" : "price_batch", entityId: single ? vendorIds[0]! : batchId, actor: input.actor, metadata: { batch_id: batchId, kind: "material", count: ids.length, suppliers: vendorIds.length } });
        return { batchId, ids };
      });
    },

    /** Creates many material prices (existing SKUs) for one supplier, all or nothing. See createMaterialPriceRows. */
    async createMaterialPricesBulk(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string; currency: string; rows: Array<{ skuId: string; amount: string; notes?: string | null }>; onInvalid?: OnInvalid }) {
      return createPricingService(db, ports).createMaterialPriceRows({ grants: input.grants, actor: input.actor, currency: input.currency, onInvalid: input.onInvalid, rows: input.rows.map((row) => ({ ...row, vendorId: input.vendorId })) });
    },

    async createPriceLabor(input: { grants: PermissionGrants; actor: AuditActor; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredTitleName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const { amount, label: amountLabel } = requiredPriceAmount(input.amount);
      return runTransaction(async (tx: TxClient) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);
        let price;
        try { price = await tx.priceLabor.create({ data: { id: randomUUID(), name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, amount_label: amountLabel, currency, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-labor.created", entityType: "price_labor", entityId: price!.id, actor: input.actor, metadata: { vendor_id: input.vendorId, category_id: input.categoryId } });
        await linkVendorCategories(tx, input.actor, input.vendorId, [input.categoryId]);
        return { priceLaborId: price!.id };
      });
    },

    async updatePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string; name: string; categoryId: string; vendorId: string; unitId: string; amount: string; currency: string; notes?: string | null }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredTitleName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const { amount, label: amountLabel } = requiredPriceAmount(input.amount);
      return runTransaction(async (tx: TxClient) => {
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
        if ((existing.amount_label ?? null) !== amountLabel) changes.amount_label = { from: existing.amount_label ?? null, to: amountLabel };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.category_id !== input.categoryId) changes.category_id = { from: existing.category_id, to: input.categoryId };
        if (existing.vendor_id !== input.vendorId) changes.vendor_id = { from: existing.vendor_id, to: input.vendorId };
        if (existing.unit_id !== input.unitId) changes.unit_id = { from: existing.unit_id, to: input.unitId };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        if (Object.keys(changes).length === 0) return { priceLaborId: input.priceLaborId };
        try { await tx.priceLabor.update({ where: { id: input.priceLaborId }, data: { name, slug, category_id: input.categoryId, vendor_id: input.vendorId, unit_id: input.unitId, amount, amount_label: amountLabel, currency, notes: input.notes?.trim() || null, updated_by_user_id: input.actor.userId ?? null, updated_by_label: input.actor.label } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "price-labor.updated", entityType: "price_labor", entityId: input.priceLaborId, actor: input.actor, changes: Object.keys(changes).length > 0 ? changes : undefined });
        await linkVendorCategories(tx, input.actor, input.vendorId, [input.categoryId]);
        return { priceLaborId: input.priceLaborId };
      });
    },

    async archivePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: TxClient) => {
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
      return runTransaction(async (tx: TxClient) => {
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
      return runTransaction(async (tx: TxClient) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at === null) throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "price_labor", targetId: input.priceLaborId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "price-labor.deletion-requested", entityType: "price_labor", entityId: input.priceLaborId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
