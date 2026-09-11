import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, actorIsUsable, requireAnyPermission, mapWriteError, hasPermission, createDeletionRequest, writeAudit } from "./shared";

export function createDeletionService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  function directDeleteOrNull(input: { grants: PermissionGrants; actor: AuditActor; targetType: string; targetId: string }) {
    if (!hasPermission(input.grants, MASTERDATA_PERMISSIONS.deletionApprove)) return null;
    actorIsUsable(input.actor);
    return runTransaction(async (tx: any) => {
      const targetType = await hardDeleteMasterDataTarget(tx, input.targetType, input.targetId);
      await writeAudit(ports, tx, { action: `${targetType.replace(/_/g, "-")}.deleted`, entityType: targetType, entityId: input.targetId, actor: input.actor, metadata: { deletion_mode: "direct", approver_user_id: input.actor.userId, approver_label: input.actor.label } });
      return { targetType, targetId: input.targetId, direct: true as const };
    });
  }

  return {
    async listDeletionRequests(input: { grants: PermissionGrants; status?: string; targetType?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.access);
      return db.deletionRequest.findMany({
        where: { ...(input.status ? { status: input.status as string } : {}), ...(input.targetType ? { target_type: input.targetType } : {}) } as any,
        orderBy: { requested_at: "desc" },
      });
    },

    async rejectDeletion(input: { grants: PermissionGrants; actor: AuditActor; requestId: string; reason?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.deletionApprove);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const request = await tx.deletionRequest.findFirst({ where: { id: input.requestId, status: "PENDING" } });
        if (!request) throw new AppError("NOT_FOUND", "DELETION_REQUEST_NOT_FOUND", "Pending deletion request not found.");
        const rejectionReason = input.reason?.trim() || null;
        await tx.deletionRequest.update({ where: { id: request.id }, data: { status: "REJECTED", approver_user_id: input.actor.userId!, approver_label: input.actor.label, decided_at: new Date() } });
        const entityType = request.target_type.replace(/_/g, "-");
        await writeAudit(ports, tx, { action: `${entityType}.deletion-rejected`, entityType: request.target_type, entityId: request.target_id, actor: input.actor, metadata: { request_id: request.id, requester_user_id: request.requester_user_id, requester_label: request.requester_label, ...(rejectionReason ? { rejection_reason: rejectionReason } : {}) } });
        return { requestId: request.id };
      });
    },

    async hardDeleteArchived(input: { grants: PermissionGrants; actor: AuditActor; targetType: string; targetId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.deletionApprove);
      return directDeleteOrNull(input);
    },

    async approveDeletion(input: { grants: PermissionGrants; actor: AuditActor; requestId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.deletionApprove);
      actorIsUsable(input.actor);
      return runTransaction(async (tx: any) => {
        const request = await tx.deletionRequest.findFirst({ where: { id: input.requestId, status: "PENDING" } });
        if (!request) throw new AppError("NOT_FOUND", "DELETION_REQUEST_NOT_FOUND", "Pending deletion request not found.");
        const { target_type: targetType, target_id: targetId } = request;
        await hardDeleteMasterDataTarget(tx, targetType, targetId);
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: { status: "APPROVED", approver_user_id: input.actor.userId!, approver_label: input.actor.label, decided_at: new Date() },
        });
        await writeAudit(ports, tx, { action: `${targetType.replace(/_/g, "-")}.deleted`, entityType: targetType, entityId: targetId, actor: input.actor, metadata: { request_id: request.id, requester_user_id: request.requester_user_id, requester_label: request.requester_label } });
        return { requestId: request.id, targetType, targetId };
      });
    },
  };
}

async function hardDeleteMasterDataTarget(tx: any, targetType: string, targetId: string): Promise<string> {
  const valid = ["brand", "vendor", "sku", "unit", "category", "vendor_type", "supplier_category", "price_material", "price_material_labor", "price_labor"];
  if (!valid.includes(targetType)) throw new AppError("VALIDATION", "UNKNOWN_TARGET_TYPE", `Unknown deletion target type: ${targetType}`);
  if (targetType === "brand") {
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: targetId } });
    if (brand.deleted_at === null) throw new AppError("CONFLICT", "BRAND_NOT_ARCHIVED", "Brand must be archived before permanent deletion.");
    if (await tx.brandSupplier.count({ where: { brand_id: targetId } }) > 0) throw new AppError("CONFLICT", "BRAND_HAS_SUPPLIERS", "Brand still has supplier relations. Remove them first.");
    if (await tx.vendorContact.count({ where: { brand_id: targetId } }) > 0) throw new AppError("CONFLICT", "BRAND_HAS_CONTACTS", "Brand still has scoped contacts. Remove them first.");
    const activeSkuCount = await tx.sku.count({ where: { brand_id: targetId, deleted_at: null } });
    if (activeSkuCount > 0) throw new AppError("CONFLICT", "BRAND_HAS_ACTIVE_SKUS", "Brand still has active SKUs. Archive them before permanent deletion.");
    const skuIds = await tx.sku.findMany({ where: { brand_id: targetId }, select: { id: true } }).then((rows: any) => rows.map((r: any) => r.id));
    const priceIds = skuIds.length === 0 ? [] : await tx.priceMaterial.findMany({ where: { sku_id: { in: skuIds } }, select: { id: true } }).then((rows: any) => rows.map((r: any) => r.id));
    if (priceIds.length > 0) { await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: { in: priceIds } } }); await tx.priceMaterial.deleteMany({ where: { id: { in: priceIds } } }); }
    if (skuIds.length > 0) { await tx.archiveCause.deleteMany({ where: { entity_type: "sku", entity_id: { in: skuIds } } }); await tx.skuCategory.deleteMany({ where: { sku_id: { in: skuIds } } }); await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: { in: skuIds } } }); await tx.sku.deleteMany({ where: { id: { in: skuIds } } }); }
    const bcIds = await tx.brandCategory.findMany({ where: { brand_id: targetId }, select: { id: true } }).then((rows: any) => rows.map((r: any) => r.id));
    if (bcIds.length > 0) { await tx.brandCategoryOrigin.deleteMany({ where: { brand_category_id: { in: bcIds } } }); await tx.brandCategory.deleteMany({ where: { id: { in: bcIds } } }); }
    await tx.brandHashtag.deleteMany({ where: { brand_id: targetId } });
    await tx.brandLink.deleteMany({ where: { brand_id: targetId } });
    await tx.brandSupplier.deleteMany({ where: { brand_id: targetId } });
    await tx.archiveCause.deleteMany({ where: { entity_type: "brand", entity_id: targetId } });
    await tx.brand.delete({ where: { id: targetId } });
  } else if (targetType === "vendor") {
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: targetId } });
    if (vendor.deleted_at === null) throw new AppError("CONFLICT", "VENDOR_NOT_ARCHIVED", "Supplier must be archived before permanent deletion.");
    if (await tx.brand.count({ where: { owner_vendor_id: targetId } }) > 0) throw new AppError("CONFLICT", "VENDOR_HAS_OWNED_BRANDS", "Supplier still owns Brands. Clear ownership first.");
    if (await tx.brandSupplier.count({ where: { vendor_id: targetId } }) > 0) throw new AppError("CONFLICT", "VENDOR_HAS_SUPPLIER_RELATIONS", "Supplier still has BrandSupplier relations.");
    const priceCount = (await tx.priceMaterial.count({ where: { supplier_vendor_id: targetId } })) + (await tx.priceMaterialLabor.count({ where: { vendor_id: targetId } })) + (await tx.priceLabor.count({ where: { vendor_id: targetId } }));
    if (priceCount > 0) throw new AppError("CONFLICT", "VENDOR_HAS_PRICES", "Supplier still has price rows. Delete them first.");
    await tx.vendorContact.deleteMany({ where: { vendor_id: targetId } });
    await tx.vendorVendorType.deleteMany({ where: { vendor_id: targetId } });
    await tx.archiveCause.deleteMany({ where: { entity_type: "vendor", entity_id: targetId } });
    await tx.vendor.delete({ where: { id: targetId } });
  } else if (targetType === "sku") {
    const sku = await tx.sku.findUniqueOrThrow({ where: { id: targetId } });
    if (sku.deleted_at === null) throw new AppError("CONFLICT", "SKU_NOT_ARCHIVED", "SKU must be archived before permanent deletion.");
    const priceIds = await tx.priceMaterial.findMany({ where: { sku_id: targetId }, select: { id: true } }).then((rows: any) => rows.map((r: any) => r.id));
    if (priceIds.length > 0) { await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: { in: priceIds } } }); await tx.priceMaterial.deleteMany({ where: { id: { in: priceIds } } }); }
    await tx.skuCategory.deleteMany({ where: { sku_id: targetId } });
    await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: targetId } });
    await tx.archiveCause.deleteMany({ where: { entity_type: "sku", entity_id: targetId } });
    await tx.sku.delete({ where: { id: targetId } });
  } else if (targetType === "unit") {
    const unit = await tx.unit.findUniqueOrThrow({ where: { id: targetId } });
    if (unit.status !== "ARCHIVED") throw new AppError("CONFLICT", "UNIT_NOT_ARCHIVED", "Unit must be archived before permanent deletion.");
    const [uMatPrice, uMatLabor, uLabor, uSku] = await Promise.all([tx.priceMaterial.count({ where: { unit_id: targetId } }), tx.priceMaterialLabor.count({ where: { unit_id: targetId } }), tx.priceLabor.count({ where: { unit_id: targetId } }), tx.sku.count({ where: { OR: [{ base_unit_id: targetId }, { purchase_unit_id: targetId }, { dimension_unit_id: targetId }] } })]);
    if (uMatPrice + uMatLabor + uLabor + uSku > 0) throw new AppError("CONFLICT", "UNIT_IN_USE", `Unit is still referenced by ${uMatPrice + uMatLabor + uLabor + uSku} record(s) and cannot be permanently deleted.`);
    await tx.archiveCause.deleteMany({ where: { entity_type: "unit", entity_id: targetId } });
    try { await tx.unit.delete({ where: { id: targetId } }); } catch (error) { mapWriteError(error); }
  } else if (targetType === "category") {
    const category = await tx.category.findUniqueOrThrow({ where: { id: targetId } });
    if (category.status !== "DEACTIVATED") throw new AppError("CONFLICT", "CATEGORY_STILL_ACTIVE", "Category must be deactivated before permanent deletion.");
    const [brandCatCount, skuCatCount, laborCount, workPriceCount] = await Promise.all([tx.brandCategory.count({ where: { category_id: targetId } }), tx.skuCategory.count({ where: { category_id: targetId } }), tx.priceMaterialLabor.count({ where: { category_id: targetId } }), tx.priceLabor.count({ where: { category_id: targetId } })]);
    const dependencyCount = brandCatCount + skuCatCount + laborCount + workPriceCount;
    if (dependencyCount > 0) throw new AppError("CONFLICT", "CATEGORY_HAS_DEPENDENCIES", `Category is still referenced by ${dependencyCount} record(s) and cannot be permanently deleted.`);
    try { await tx.category.delete({ where: { id: targetId } }); } catch (error) { mapWriteError(error); }
  } else if (targetType === "vendor_type") {
    const vendorType = await tx.vendorType.findUniqueOrThrow({ where: { id: targetId } });
    if (vendorType.deleted_at === null) throw new AppError("CONFLICT", "VENDOR_TYPE_NOT_ARCHIVED", "Supplier Type must be archived before permanent deletion.");
    const vendorAssignmentCount = await tx.vendorVendorType.count({ where: { vendor_type_id: targetId } });
    if (vendorAssignmentCount > 0) throw new AppError("CONFLICT", "VENDOR_TYPE_HAS_ASSIGNMENTS", `Supplier Type is assigned to ${vendorAssignmentCount} Supplier(s) and cannot be permanently deleted.`);
    await tx.archiveCause.deleteMany({ where: { entity_type: "vendor_type", entity_id: targetId } });
    try { await tx.vendorType.delete({ where: { id: targetId } }); } catch (error) { mapWriteError(error); }
  } else if (targetType === "supplier_category") {
    const supplierCategory = await tx.supplierCategory.findUniqueOrThrow({ where: { id: targetId } });
    if (supplierCategory.deleted_at === null) throw new AppError("CONFLICT", "SUPPLIER_CATEGORY_NOT_ARCHIVED", "Supplier Category must be archived before permanent deletion.");
    const assignmentCount = await tx.vendorSupplierCategory.count({ where: { supplier_category_id: targetId } });
    if (assignmentCount > 0) throw new AppError("CONFLICT", "SUPPLIER_CATEGORY_HAS_ASSIGNMENTS", `Supplier Category is assigned to ${assignmentCount} Supplier(s) and cannot be permanently deleted.`);
    await tx.archiveCause.deleteMany({ where: { entity_type: "supplier_category", entity_id: targetId } });
    try { await tx.supplierCategory.delete({ where: { id: targetId } }); } catch (error) { mapWriteError(error); }
  } else if (targetType === "price_material") {
    const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: targetId } });
    if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price must be archived before permanent deletion.");
    await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: targetId } });
    await tx.priceMaterial.delete({ where: { id: targetId } });
  } else if (targetType === "price_material_labor") {
    const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: targetId } });
    if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price must be archived before permanent deletion.");
    await tx.archiveCause.deleteMany({ where: { entity_type: "price_material_labor", entity_id: targetId } });
    await tx.priceMaterialLabor.delete({ where: { id: targetId } });
  } else {
    const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: targetId } });
    if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price must be archived before permanent deletion.");
    await tx.archiveCause.deleteMany({ where: { entity_type: "price_labor", entity_id: targetId } });
    await tx.priceLabor.delete({ where: { id: targetId } });
  }
  return targetType;
}
