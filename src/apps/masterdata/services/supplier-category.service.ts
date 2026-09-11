import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, addDirectCause, removeDirectCause, createDeletionRequest, writeAudit } from "./shared";

export function createSupplierCategoryService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  return {
    async listSupplierCategories(input: { grants: PermissionGrants; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view Supplier Categories.");
      return db.supplierCategory.findMany({
        where: input.includeArchived ? {} : { deleted_at: null },
        orderBy: { sort_order: "asc" },
        select: { id: true, code: true, name: true, sort_order: true, deleted_at: true, _count: { select: { vendor_supplier_categories: true } } },
      });
    },

    async listSupplierCategoriesForAssignment(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      return db.supplierCategory.findMany({ where: { deleted_at: null }, orderBy: { sort_order: "asc" }, select: { id: true, code: true, name: true, sort_order: true } });
    },

    async getSupplierCategory(input: { grants: PermissionGrants; supplierCategoryId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view Supplier Categories.");
      return db.supplierCategory.findUniqueOrThrow({ where: { id: input.supplierCategoryId }, include: { _count: { select: { vendor_supplier_categories: true } } } });
    },

    async createSupplierCategory(input: { grants: PermissionGrants; actor: AuditActor; code: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "SUPPLIER_CATEGORY_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "SUPPLIER_CATEGORY_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        let category;
        try { category = await tx.supplierCategory.create({ data: { id: randomUUID(), code, name } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "supplier-category.created", entityType: "supplier_category", entityId: category!.id, actor: input.actor, metadata: { code } });
        return { supplierCategoryId: category!.id };
      });
    },

    async createSupplierCategoryQuick(input: { grants: PermissionGrants; actor: AuditActor; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "SUPPLIER_CATEGORY_NAME_REQUIRED");
      const baseCode = input.name.trim().toUpperCase();
      if (!baseCode) throw new AppError("VALIDATION", "SUPPLIER_CATEGORY_CODE_INVALID", "The name must produce a usable code.");
      return runTransaction(async (tx) => {
        const exactLive = await tx.supplierCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deleted_at: null }, select: { id: true, code: true } });
        if (exactLive) return { supplierCategoryId: exactLive.id, code: exactLive.code };
        const existingCodes = new Set((await tx.supplierCategory.findMany({ where: { code: { startsWith: baseCode } }, select: { code: true } })).map((entry) => entry.code));
        let code = baseCode;
        let suffix = 2;
        while (existingCodes.has(code)) { code = `${baseCode}-${suffix}`; suffix += 1; }
        let category;
        try { category = await tx.supplierCategory.create({ data: { id: randomUUID(), code, name } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "supplier-category.created", entityType: "supplier_category", entityId: category!.id, actor: input.actor, metadata: { code } });
        return { supplierCategoryId: category!.id, code };
      });
    },

    async updateSupplierCategory(input: { grants: PermissionGrants; actor: AuditActor; supplierCategoryId: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "SUPPLIER_CATEGORY_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        const existing = await tx.supplierCategory.findUniqueOrThrow({ where: { id: input.supplierCategoryId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) changes.name = { from: existing.name, to: name };
        if (Object.keys(changes).length === 0) return { supplierCategoryId: input.supplierCategoryId };
        try { await tx.supplierCategory.update({ where: { id: input.supplierCategoryId }, data: { name } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "supplier-category.updated", entityType: "supplier_category", entityId: input.supplierCategoryId, actor: input.actor, changes });
        return { supplierCategoryId: input.supplierCategoryId };
      });
    },

    async archiveSupplierCategory(input: { grants: PermissionGrants; actor: AuditActor; supplierCategoryId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.supplierCategory.findUniqueOrThrow({ where: { id: input.supplierCategoryId } });
        if (category.deleted_at !== null) throw new AppError("CONFLICT", "SUPPLIER_CATEGORY_ALREADY_ARCHIVED", "Supplier Category is already archived.");
        await addDirectCause(tx, "supplier_category", input.supplierCategoryId);
        await tx.supplierCategory.update({ where: { id: input.supplierCategoryId }, data: { deleted_at: new Date() } });
        await writeAudit(ports, tx, { action: "supplier-category.archived", entityType: "supplier_category", entityId: input.supplierCategoryId, actor: input.actor });
        return { supplierCategoryId: input.supplierCategoryId };
      });
    },

    async restoreSupplierCategory(input: { grants: PermissionGrants; actor: AuditActor; supplierCategoryId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.supplierCategory.findUniqueOrThrow({ where: { id: input.supplierCategoryId } });
        if (category.deleted_at === null) throw new AppError("CONFLICT", "SUPPLIER_CATEGORY_NOT_ARCHIVED", "Supplier Category is not archived.");
        await removeDirectCause(tx, "supplier_category", input.supplierCategoryId);
        await tx.supplierCategory.update({ where: { id: input.supplierCategoryId }, data: { deleted_at: null } });
        await writeAudit(ports, tx, { action: "supplier-category.restored", entityType: "supplier_category", entityId: input.supplierCategoryId, actor: input.actor });
        return { supplierCategoryId: input.supplierCategoryId };
      });
    },

    async requestSupplierCategoryDeletion(input: { grants: PermissionGrants; actor: AuditActor; supplierCategoryId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.supplierCategory.findUniqueOrThrow({ where: { id: input.supplierCategoryId } });
        if (category.deleted_at === null) throw new AppError("VALIDATION", "SUPPLIER_CATEGORY_NOT_ARCHIVED", "Only archived Supplier Categories may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "supplier_category", targetId: input.supplierCategoryId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "supplier-category.deletion-requested", entityType: "supplier_category", entityId: input.supplierCategoryId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
