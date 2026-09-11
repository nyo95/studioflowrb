import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, TxClient, actorIsUsable, requireAnyPermission, mapWriteError, requiredName, requiredSlug, addDirectCause, removeDirectCause, createDeletionRequest, writeAudit } from "./shared";

export function createCategoryService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  return {
    async listCategories(input: { grants: PermissionGrants; search?: string; kind?: "PRODUCT" | "WORK"; includeDeactivated?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view categories.");
      const search = input.search?.trim();
      return db.category.findMany({
        where: {
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.includeDeactivated ? {} : { status: "ACTIVE" }),
          ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] } : {}),
        },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        select: {
          id: true, name: true, slug: true, kind: true, status: true, merged_into_id: true,
          merged_into: { select: { id: true, name: true } },
          _count: { select: { sku_categories: true, brand_categories: true, material_labor_prices: true, labor_prices: true } },
        },
      });
    },

    async getCategory(input: { grants: PermissionGrants; categoryId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view categories.");
      return db.category.findUniqueOrThrow({
        where: { id: input.categoryId },
        include: { merged_into: { select: { id: true, name: true } }, _count: { select: { sku_categories: true, brand_categories: true, material_labor_prices: true, labor_prices: true } } },
      });
    },

    async createCategory(input: { grants: PermissionGrants; actor: AuditActor; name: string; kind: "PRODUCT" | "WORK" }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "CATEGORY_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const { kind } = input;
      return runTransaction(async (tx) => {
        let category;
        try { category = await tx.category.create({ data: { id: randomUUID(), name, slug, kind } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "category.created", entityType: "category", entityId: category!.id, actor: input.actor, metadata: { kind, slug } });
        return { categoryId: category!.id };
      });
    },

    async updateCategory(input: { grants: PermissionGrants; actor: AuditActor; categoryId: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "CATEGORY_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        const existing = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) { changes.name = { from: existing.name, to: name }; changes.slug = { from: existing.slug, to: slug }; }
        if (Object.keys(changes).length === 0) return { categoryId: input.categoryId };
        try { await tx.category.update({ where: { id: input.categoryId }, data: { name, slug } }); } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "category.updated", entityType: "category", entityId: input.categoryId, actor: input.actor, changes });
        return { categoryId: input.categoryId };
      });
    },

    async deactivateCategory(input: { grants: PermissionGrants; actor: AuditActor; categoryId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("CONFLICT", "CATEGORY_NOT_ACTIVE", "Category is not active.");
        const now = new Date();
        await tx.category.update({ where: { id: input.categoryId }, data: { status: "DEACTIVATED", deactivated_at: now } });
        await writeAudit(ports, tx, { action: "category.deactivated", entityType: "category", entityId: input.categoryId, actor: input.actor });
        return { categoryId: input.categoryId };
      });
    },

    async mergeCategory(input: { grants: PermissionGrants; actor: AuditActor; sourceCategoryId: string; targetCategoryId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      if (input.sourceCategoryId === input.targetCategoryId) throw new AppError("VALIDATION", "CATEGORY_MERGE_SELF", "A category cannot be merged into itself.");
      return runTransaction(async (tx) => {
        const [source, target] = await Promise.all([tx.category.findUniqueOrThrow({ where: { id: input.sourceCategoryId } }), tx.category.findUniqueOrThrow({ where: { id: input.targetCategoryId } })]);
        if (source.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_SOURCE_NOT_ACTIVE", "Source category must be active.");
        if (target.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_TARGET_NOT_ACTIVE", "Target category must be active.");
        if (source.kind !== target.kind) throw new AppError("VALIDATION", "CATEGORY_KIND_MISMATCH", "Categories must be of the same kind to merge.");
        const now = new Date();
        const existingSkuTargets = await tx.skuCategory.findMany({ where: { category_id: input.targetCategoryId }, select: { sku_id: true } });
        const alreadyLinkedSkus = new Set(existingSkuTargets.map((r) => r.sku_id));
        const sourceSkuLinks = await tx.skuCategory.findMany({ where: { category_id: input.sourceCategoryId }, select: { id: true, sku_id: true } });
        const skusToTransfer = sourceSkuLinks.filter((r) => !alreadyLinkedSkus.has(r.sku_id));
        if (skusToTransfer.length > 0) await tx.skuCategory.updateMany({ where: { id: { in: skusToTransfer.map((r) => r.id) } }, data: { category_id: input.targetCategoryId } });
        await tx.skuCategory.deleteMany({ where: { category_id: input.sourceCategoryId } });
        const existingBrandTargets = await tx.brandCategory.findMany({ where: { category_id: input.targetCategoryId }, select: { brand_id: true, id: true } });
        const brandTargetMap = new Map(existingBrandTargets.map((r) => [r.brand_id, r.id]));
        const sourceBrandLinks = await tx.brandCategory.findMany({ where: { category_id: input.sourceCategoryId }, select: { id: true, brand_id: true, origins: { select: { id: true } } } });
        for (const sourceLink of sourceBrandLinks) {
          const existingTargetId = brandTargetMap.get(sourceLink.brand_id);
          if (existingTargetId) { await tx.brandCategoryOrigin.updateMany({ where: { brand_category_id: sourceLink.id }, data: { brand_category_id: existingTargetId } }); await tx.brandCategory.delete({ where: { id: sourceLink.id } }); }
          else { await tx.brandCategory.update({ where: { id: sourceLink.id }, data: { category_id: input.targetCategoryId } }); }
        }
        if (source.kind === "WORK") { await tx.priceMaterialLabor.updateMany({ where: { category_id: input.sourceCategoryId }, data: { category_id: input.targetCategoryId } }); await tx.priceLabor.updateMany({ where: { category_id: input.sourceCategoryId }, data: { category_id: input.targetCategoryId } }); }
        await tx.category.update({ where: { id: input.sourceCategoryId }, data: { status: "DEACTIVATED", deactivated_at: now, merged_into_id: input.targetCategoryId } });
        await writeAudit(ports, tx, { action: "category.merged", entityType: "category", entityId: input.sourceCategoryId, actor: input.actor, metadata: { target_category_id: input.targetCategoryId, skus_transferred: skusToTransfer.length } });
        return { sourceCategoryId: input.sourceCategoryId, targetCategoryId: input.targetCategoryId };
      });
    },

    async requestCategoryDeletion(input: { grants: PermissionGrants; actor: AuditActor; categoryId: string; reason?: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status === "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_STILL_ACTIVE", "Only deactivated categories may be submitted for deletion.");
        const requestId = await createDeletionRequest(tx, { targetType: "category", targetId: input.categoryId, actor: input.actor, reason: input.reason, notes: input.notes });
        await writeAudit(ports, tx, { action: "category.deletion-requested", entityType: "category", entityId: input.categoryId, actor: input.actor });
        return { requestId };
      });
    },
  };
}
