import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { hasPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, TxClient, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredSlug, requiredAmount, addDirectCause, removeDirectCause, createDeletionRequest, writeAudit } from "./shared";

type MasterDataServiceFactory = (db: PrismaClient, ports: MasterDataServicePorts) => object;

export function createUnitService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  return {
    async listUnits(input: { grants: PermissionGrants; search?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view units.");
      const search = input.search?.trim();
      return db.unit.findMany({
        where: {
          ...(input.includeArchived ? {} : { status: "ACTIVE" }),
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: {
          id: true, code: true, name: true, status: true, archived_at: true,
          _count: { select: { base_skus: true, purchase_skus: true, dimension_skus: true, material_prices: true, material_labor_prices: true, labor_prices: true } },
        },
      });
    },

    async getUnit(input: { grants: PermissionGrants; unitId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view units.");
      return db.unit.findUniqueOrThrow({
        where: { id: input.unitId },
        include: { _count: { select: { base_skus: true, purchase_skus: true, dimension_skus: true, material_prices: true, material_labor_prices: true, labor_prices: true } } },
      });
    },

    async createUnit(input: { grants: PermissionGrants; actor: AuditActor; code: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "UNIT_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "UNIT_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        let unit;
        try { unit = await tx.unit.create({ data: { id: randomUUID(), code, name } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "unit.created", entityType: "unit", entityId: unit!.id, actor: input.actor, metadata: { code } });
        return { unitId: unit!.id };
      });
    },

    async updateUnit(input: { grants: PermissionGrants; actor: AuditActor; unitId: string; code: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "UNIT_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "UNIT_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        const existing = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) changes.name = { from: existing.name, to: name };
        if (existing.code !== code) throw new AppError("CONFLICT", "UNIT_CODE_IMMUTABLE", "Unit code is fixed after creation.");
        if (Object.keys(changes).length === 0) return { unitId: input.unitId };
        try { await tx.unit.update({ where: { id: input.unitId }, data: { name } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "unit.updated", entityType: "unit", entityId: input.unitId, actor: input.actor, changes });
        return { unitId: input.unitId };
      });
    },

    async archiveUnit(input: { grants: PermissionGrants; actor: AuditActor; unitId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status === "ARCHIVED") throw new AppError("CONFLICT", "UNIT_ALREADY_ARCHIVED", "Unit is already archived.");
        const [matPriceCount, matLaborCount, laborCount, skuCount] = await Promise.all([
          tx.priceMaterial.count({ where: { unit_id: input.unitId, deleted_at: null } }),
          tx.priceMaterialLabor.count({ where: { unit_id: input.unitId, deleted_at: null } }),
          tx.priceLabor.count({ where: { unit_id: input.unitId, deleted_at: null } }),
          tx.sku.count({ where: { OR: [{ base_unit_id: input.unitId }, { purchase_unit_id: input.unitId }, { dimension_unit_id: input.unitId }], deleted_at: null } }),
        ]);
        const inUseCount = matPriceCount + matLaborCount + laborCount + skuCount;
        if (inUseCount > 0) throw new AppError("CONFLICT", "UNIT_IN_USE", `Unit is still referenced by ${inUseCount} active record(s) (prices or SKUs) and cannot be archived.`);
        const now = new Date();
        await addDirectCause(tx, "unit", input.unitId);
        await tx.unit.update({ where: { id: input.unitId }, data: { status: "ARCHIVED", archived_at: now } });
        await writeAudit(ports, tx, { action: "unit.archived", entityType: "unit", entityId: input.unitId, actor: input.actor });
        return { unitId: input.unitId };
      });
    },

    async restoreUnit(input: { grants: PermissionGrants; actor: AuditActor; unitId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ARCHIVED") throw new AppError("CONFLICT", "UNIT_NOT_ARCHIVED", "Unit is not archived.");
        await removeDirectCause(tx, "unit", input.unitId);
        await tx.unit.update({ where: { id: input.unitId }, data: { status: "ACTIVE", archived_at: null } });
        await writeAudit(ports, tx, { action: "unit.restored", entityType: "unit", entityId: input.unitId, actor: input.actor });
        return { unitId: input.unitId };
      });
    },

    async requestUnitDeletion(input: { grants: PermissionGrants; actor: AuditActor; unitId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ARCHIVED") throw new AppError("VALIDATION", "UNIT_NOT_ARCHIVED", "Only archived units may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "unit", targetId: input.unitId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "unit.deletion-requested", entityType: "unit", entityId: input.unitId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
