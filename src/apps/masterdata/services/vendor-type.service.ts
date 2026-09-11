import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, addDirectCause, removeDirectCause, createDeletionRequest, writeAudit } from "./shared";

export function createVendorTypeService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  return {
    async listVendorTypes(input: { grants: PermissionGrants; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view Supplier Types.");
      return db.vendorType.findMany({
        where: input.includeArchived ? {} : { deleted_at: null },
        orderBy: { sort_order: "asc" },
        select: { id: true, code: true, name: true, sort_order: true, can_supply_material: true, can_supply_labor: true, deleted_at: true, _count: { select: { vendor_types: true } } },
      });
    },

    async listVendorTypesForAssignment(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      return db.vendorType.findMany({ where: { deleted_at: null }, orderBy: { sort_order: "asc" }, select: { id: true, code: true, name: true, sort_order: true, can_supply_material: true, can_supply_labor: true } });
    },

    async getVendorType(input: { grants: PermissionGrants; vendorTypeId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view Supplier Types.");
      return db.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId }, include: { _count: { select: { vendor_types: true } } } });
    },

    async createVendorType(input: { grants: PermissionGrants; actor: AuditActor; code: string; name: string; canSupplyMaterial?: boolean; canSupplyLabor?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "VENDOR_TYPE_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "VENDOR_TYPE_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        let vt;
        try { vt = await tx.vendorType.create({ data: { id: randomUUID(), code, name, can_supply_material: input.canSupplyMaterial ?? false, can_supply_labor: input.canSupplyLabor ?? false } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "vendor-type.created", entityType: "vendor_type", entityId: vt!.id, actor: input.actor, metadata: { code } });
        return { vendorTypeId: vt!.id };
      });
    },

    async updateVendorType(input: { grants: PermissionGrants; actor: AuditActor; vendorTypeId: string; name: string; canSupplyMaterial: boolean; canSupplyLabor: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_TYPE_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        const existing = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) changes.name = { from: existing.name, to: name };
        if (existing.can_supply_material !== input.canSupplyMaterial) changes.can_supply_material = { from: existing.can_supply_material, to: input.canSupplyMaterial };
        if (existing.can_supply_labor !== input.canSupplyLabor) changes.can_supply_labor = { from: existing.can_supply_labor, to: input.canSupplyLabor };
        if (Object.keys(changes).length === 0) return { vendorTypeId: input.vendorTypeId };
        if (existing.can_supply_material && !input.canSupplyMaterial) {
          const assignments = await tx.vendorVendorType.findMany({ where: { vendor_type_id: input.vendorTypeId, vendor: { deleted_at: null } }, select: { vendor_id: true } });
          for (const a of assignments) {
            const otherTypes = await tx.vendorVendorType.findMany({ where: { vendor_id: a.vendor_id, vendor_type_id: { not: input.vendorTypeId }, vendor_type: { deleted_at: null } }, include: { vendor_type: true } });
            if (!otherTypes.some((o) => o.vendor_type.can_supply_material)) {
              const priceCount = await tx.priceMaterial.count({ where: { supplier_vendor_id: a.vendor_id, deleted_at: null } });
              const supplierCount = await tx.brandSupplier.count({ where: { vendor_id: a.vendor_id } });
              if (priceCount > 0 || supplierCount > 0) throw new AppError("CONFLICT", "VENDOR_TYPE_MATERIAL_CAPABILITY_IN_USE", "Cannot disable material capability while live Suppliers depend on this type for material pricing.");
            }
          }
        }
        if (existing.can_supply_labor && !input.canSupplyLabor) {
          const assignments = await tx.vendorVendorType.findMany({ where: { vendor_type_id: input.vendorTypeId, vendor: { deleted_at: null } }, select: { vendor_id: true } });
          for (const a of assignments) {
            const otherTypes = await tx.vendorVendorType.findMany({ where: { vendor_id: a.vendor_id, vendor_type_id: { not: input.vendorTypeId }, vendor_type: { deleted_at: null } }, include: { vendor_type: true } });
            if (!otherTypes.some((o) => o.vendor_type.can_supply_labor)) {
              const mlCount = await tx.priceMaterialLabor.count({ where: { vendor_id: a.vendor_id, deleted_at: null } });
              const laborCount = await tx.priceLabor.count({ where: { vendor_id: a.vendor_id, deleted_at: null } });
              if (mlCount > 0 || laborCount > 0) throw new AppError("CONFLICT", "VENDOR_TYPE_LABOR_CAPABILITY_IN_USE", "Cannot disable labor capability while live Suppliers depend on this type for labor pricing.");
            }
          }
        }
        try { await tx.vendorType.update({ where: { id: input.vendorTypeId }, data: { name, can_supply_material: input.canSupplyMaterial, can_supply_labor: input.canSupplyLabor } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "vendor-type.updated", entityType: "vendor_type", entityId: input.vendorTypeId, actor: input.actor, changes });
        return { vendorTypeId: input.vendorTypeId };
      });
    },

    async archiveVendorType(input: { grants: PermissionGrants; actor: AuditActor; vendorTypeId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vt = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        if (vt.deleted_at !== null) throw new AppError("CONFLICT", "VENDOR_TYPE_ALREADY_ARCHIVED", "Supplier Type is already archived.");
        await addDirectCause(tx, "vendor_type", input.vendorTypeId);
        await tx.vendorType.update({ where: { id: input.vendorTypeId }, data: { deleted_at: new Date() } });
        await writeAudit(ports, tx, { action: "vendor-type.archived", entityType: "vendor_type", entityId: input.vendorTypeId, actor: input.actor });
        return { vendorTypeId: input.vendorTypeId };
      });
    },

    async restoreVendorType(input: { grants: PermissionGrants; actor: AuditActor; vendorTypeId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vt = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        if (vt.deleted_at === null) throw new AppError("CONFLICT", "VENDOR_TYPE_NOT_ARCHIVED", "Supplier Type is not archived.");
        await removeDirectCause(tx, "vendor_type", input.vendorTypeId);
        await tx.vendorType.update({ where: { id: input.vendorTypeId }, data: { deleted_at: null } });
        await writeAudit(ports, tx, { action: "vendor-type.restored", entityType: "vendor_type", entityId: input.vendorTypeId, actor: input.actor });
        return { vendorTypeId: input.vendorTypeId };
      });
    },

    async requestVendorTypeDeletion(input: { grants: PermissionGrants; actor: AuditActor; vendorTypeId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vt = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        if (vt.deleted_at === null) throw new AppError("VALIDATION", "VENDOR_TYPE_NOT_ARCHIVED", "Only archived Supplier Types may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "vendor_type", targetId: input.vendorTypeId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "vendor-type.deletion-requested", entityType: "vendor_type", entityId: input.vendorTypeId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
