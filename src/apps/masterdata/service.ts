import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const MASTERDATA_PERMISSIONS = {
  access: "masterdata.access",
  brandRead: "masterdata.brand.read",
  brandManage: "masterdata.brand.manage",
  vendorRead: "masterdata.vendor.read",
  vendorManage: "masterdata.vendor.manage",
  dictionaryRead: "masterdata.dictionary.read",
  dictionaryManage: "masterdata.dictionary.manage",
  skuRead: "masterdata.sku.read",
  skuManage: "masterdata.sku.manage",
  priceMaterialRead: "masterdata.price-material.read",
  priceMaterialManage: "masterdata.price-material.manage",
  priceWorkRead: "masterdata.price-work.read",
  priceWorkManage: "masterdata.price-work.manage",
  deletionApprove: "masterdata.deletion.approve",
} as const;

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

type TxClient = Prisma.TransactionClient;

function actorIsUsable(actor: AuditActor): void {
  if (actor.kind !== "USER" || !actor.userId) {
    throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  }
}

function mapWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) throw mapPrismaKnownError(error);
  throw error;
}

function requiredName(value: string, code: string): string {
  const name = normalizeText(value);
  if (!name) throw new AppError("VALIDATION", code, "A name is required.");
  return name;
}

function requiredSlug(name: string): string {
  const slug = toSlug(name);
  if (!slug) throw new AppError("VALIDATION", "SLUG_INVALID", "The name must contain a usable identifier.");
  return slug;
}

function requiredCurrency(value: string): string {
  const c = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new AppError("VALIDATION", "CURRENCY_INVALID", "Currency must be a 3-letter uppercase code.");
  return c;
}

const ZERO_AMOUNT = toDecimalString("0");

function requiredAmount(value: string): string {
  let amount;
  try {
    amount = toDecimalString(value);
  } catch {
    throw new AppError("VALIDATION", "PRICE_AMOUNT_INVALID", "Amount must be a valid decimal value.");
  }
  if (compareDecimals(amount, ZERO_AMOUNT) < 0) {
    throw new AppError("VALIDATION", "PRICE_AMOUNT_NEGATIVE", "Amount must be non-negative.");
  }
  return amount;
}

// ---------------------------------------------------------------------------
// Archive-cause provenance helpers (masterdata.md §4.1)
// ---------------------------------------------------------------------------

async function addDirectCause(tx: TxClient, entityType: string, entityId: string): Promise<void> {
  // PostgreSQL NULL != NULL so the DB unique index does NOT prevent duplicate DIRECT rows.
  // Callers must verify the entity is not already archived before calling this.
  await tx.archiveCause.create({
    data: { id: randomUUID(), entity_type: entityType, entity_id: entityId, kind: "DIRECT", parent_type: null, parent_id: null },
  });
}

async function addParentCauses(
  tx: TxClient,
  entityType: string,
  parentType: string,
  parentId: string,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length === 0) return;
  await tx.archiveCause.createMany({
    data: entityIds.map((entityId) => ({
      id: randomUUID(),
      entity_type: entityType,
      entity_id: entityId,
      kind: "PARENT" as const,
      parent_type: parentType,
      parent_id: parentId,
    })),
    skipDuplicates: true, // non-null parent fields make the unique index effective
  });
}

async function removeDirectCause(tx: TxClient, entityType: string, entityId: string): Promise<void> {
  await tx.archiveCause.deleteMany({
    where: { entity_type: entityType, entity_id: entityId, kind: "DIRECT", parent_type: null, parent_id: null },
  });
}

/** Removes all PARENT causes matching (parentType, parentId) for an entity type.
 *  Returns the IDs of entities that now have ZERO remaining causes (→ should be restored). */
async function removeParentCausesAndFindRestored(
  tx: TxClient,
  entityType: string,
  parentType: string,
  parentId: string,
): Promise<string[]> {
  const affected = await tx.archiveCause.findMany({
    where: { entity_type: entityType, kind: "PARENT", parent_type: parentType, parent_id: parentId },
    select: { entity_id: true },
  });
  const affectedIds = affected.map((c) => c.entity_id);
  if (affectedIds.length === 0) return [];

  await tx.archiveCause.deleteMany({
    where: { entity_type: entityType, kind: "PARENT", parent_type: parentType, parent_id: parentId },
  });

  // Which of those entities still have at least one remaining cause?
  const stillCaused = await tx.archiveCause.findMany({
    where: { entity_type: entityType, entity_id: { in: affectedIds } },
    select: { entity_id: true },
    distinct: ["entity_id"],
  });
  const stillCausedSet = new Set(stillCaused.map((c) => c.entity_id));
  return affectedIds.filter((id) => !stillCausedSet.has(id));
}

// ---------------------------------------------------------------------------
// Vendor capability guards
// ---------------------------------------------------------------------------

async function assertVendorMaterialCapable(tx: TxClient, vendorId: string): Promise<void> {
  const capable = await tx.vendorVendorType.findFirst({
    where: {
      vendor_id: vendorId,
      vendor: { deleted_at: null },
      vendor_type: { deleted_at: null, can_supply_material: true },
    },
  });
  if (!capable) {
    throw new AppError("VALIDATION", "VENDOR_NOT_MATERIAL_CAPABLE", "Vendor is not eligible as a material supplier.");
  }
}

async function assertVendorLaborCapable(tx: TxClient, vendorId: string): Promise<void> {
  const capable = await tx.vendorVendorType.findFirst({
    where: {
      vendor_id: vendorId,
      vendor: { deleted_at: null },
      vendor_type: { deleted_at: null, can_supply_labor: true },
    },
  });
  if (!capable) {
    throw new AppError("VALIDATION", "VENDOR_NOT_LABOR_CAPABLE", "Vendor is not eligible as a labor provider.");
  }
}

async function assertSkuRestorable(tx: TxClient, skuId: string): Promise<void> {
  const sku = await tx.sku.findUniqueOrThrow({ where: { id: skuId } });
  const [brand, baseUnit, purchaseUnit, categories, identityConflict] = await Promise.all([
    sku.brand_id ? tx.brand.findUniqueOrThrow({ where: { id: sku.brand_id } }) : null,
    tx.unit.findUniqueOrThrow({ where: { id: sku.base_unit_id } }),
    sku.purchase_unit_id ? tx.unit.findUniqueOrThrow({ where: { id: sku.purchase_unit_id } }) : null,
    tx.skuCategory.findMany({ where: { sku_id: skuId }, include: { category: true } }),
    tx.sku.findFirst({
      where: { id: { not: skuId }, brand_id: sku.brand_id, slug: sku.slug, deleted_at: null },
      select: { id: true },
    }),
  ]);
  if (brand?.deleted_at) throw new AppError("CONFLICT", "SKU_BRAND_ARCHIVED", "SKU cannot be restored while its Brand is archived.");
  if (baseUnit.status !== "ACTIVE" || purchaseUnit?.status === "ARCHIVED") {
    throw new AppError("CONFLICT", "SKU_UNIT_INACTIVE", "SKU cannot be restored while one of its Units is archived.");
  }
  if (categories.length === 0 || categories.some((row) => row.category.status !== "ACTIVE")) {
    throw new AppError("CONFLICT", "SKU_CATEGORY_INACTIVE", "SKU cannot be restored without active Categories.");
  }
  if (identityConflict) throw new AppError("CONFLICT", "SKU_IDENTITY_CONFLICT", "A live SKU already uses this identity.");
}

async function assertPriceMaterialRestorable(tx: TxClient, priceId: string): Promise<void> {
  const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: priceId } });
  const [sku, vendor, unit, conflict, sourceLink] = await Promise.all([
    tx.sku.findUniqueOrThrow({ where: { id: price.sku_id } }),
    tx.vendor.findUniqueOrThrow({ where: { id: price.supplier_vendor_id } }),
    tx.unit.findUniqueOrThrow({ where: { id: price.unit_id } }),
    tx.priceMaterial.findFirst({
      where: {
        id: { not: priceId },
        sku_id: price.sku_id,
        supplier_vendor_id: price.supplier_vendor_id,
        deleted_at: null,
      },
      select: { id: true },
    }),
    price.source_link_id
      ? tx.brandLink.findUniqueOrThrow({ where: { id: price.source_link_id }, include: { brand: true } })
      : null,
  ]);
  if (sku.deleted_at) throw new AppError("CONFLICT", "PRICE_SKU_ARCHIVED", "Price cannot be restored while its SKU is archived.");
  if (vendor.deleted_at) throw new AppError("CONFLICT", "PRICE_VENDOR_ARCHIVED", "Price cannot be restored while its Vendor is archived.");
  if (unit.status !== "ACTIVE") throw new AppError("CONFLICT", "PRICE_UNIT_INACTIVE", "Price cannot be restored while its Unit is archived.");
  if (sourceLink?.brand.deleted_at) {
    throw new AppError("CONFLICT", "PRICE_SOURCE_BRAND_ARCHIVED", "Price cannot be restored while its source Brand is archived.");
  }
  await assertVendorMaterialCapable(tx, vendor.id);
  if (conflict) throw new AppError("CONFLICT", "PRICE_PAIR_CONFLICT", "A live price already exists for this SKU and Vendor.");
}

async function assertWorkPriceRestorable(
  tx: TxClient,
  table: "material-labor" | "labor",
  priceId: string,
): Promise<void> {
  const price = table === "material-labor"
    ? await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: priceId } })
    : await tx.priceLabor.findUniqueOrThrow({ where: { id: priceId } });
  const [category, vendor, unit, conflict] = await Promise.all([
    tx.category.findUniqueOrThrow({ where: { id: price.category_id } }),
    tx.vendor.findUniqueOrThrow({ where: { id: price.vendor_id } }),
    tx.unit.findUniqueOrThrow({ where: { id: price.unit_id } }),
    table === "material-labor"
      ? tx.priceMaterialLabor.findFirst({
          where: {
            id: { not: priceId },
            vendor_id: price.vendor_id,
            deleted_at: null,
            OR: [{ slug: price.slug }, { name: { equals: price.name, mode: "insensitive" } }],
          },
          select: { id: true },
        })
      : tx.priceLabor.findFirst({
          where: {
            id: { not: priceId },
            vendor_id: price.vendor_id,
            deleted_at: null,
            OR: [{ slug: price.slug }, { name: { equals: price.name, mode: "insensitive" } }],
          },
          select: { id: true },
        }),
  ]);
  if (category.status !== "ACTIVE" || category.kind !== "WORK") {
    throw new AppError("CONFLICT", "PRICE_CATEGORY_INACTIVE", "Work price requires an active WORK Category.");
  }
  if (vendor.deleted_at) throw new AppError("CONFLICT", "PRICE_VENDOR_ARCHIVED", "Price cannot be restored while its Vendor is archived.");
  if (unit.status !== "ACTIVE") throw new AppError("CONFLICT", "PRICE_UNIT_INACTIVE", "Price cannot be restored while its Unit is archived.");
  await assertVendorLaborCapable(tx, vendor.id);
  if (conflict) throw new AppError("CONFLICT", "PRICE_IDENTITY_CONFLICT", "A live work price already uses this Vendor identity.");
}

// ---------------------------------------------------------------------------
// DeletionRequest helper
// ---------------------------------------------------------------------------

async function createDeletionRequest(
  tx: TxClient,
  input: { targetType: string; targetId: string; actor: AuditActor; reason?: string; notes?: string },
): Promise<string> {
  let req;
  try {
    req = await tx.deletionRequest.create({
      data: {
        id: randomUUID(),
        target_type: input.targetType,
        target_id: input.targetId,
        status: "PENDING",
        requester_user_id: input.actor.userId!,
        requester_label: input.actor.label,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
      },
    });
  } catch (error) {
    mapWriteError(error);
  }
  return req!.id;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

type MasterDataServicePorts = {
  runTransaction: <T>(work: (tx: TxClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
};

export function createMasterDataService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;
  const writeAudit = async (
    tx: TxClient,
    input: {
      action: string;
      entityType: string;
      entityId: string;
      actor: AuditActor;
      changes?: Record<string, { from: unknown; to: unknown }>;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> => {
    await ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", ...input }), tx);
  };

  return {
    // ── Summary ─────────────────────────────────────────────────────────────

    async summary(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.access);
      const [brands, vendors, skus, materialPrices, workPrices, units, categories] = await Promise.all([
        db.brand.count({ where: { deleted_at: null } }),
        db.vendor.count({ where: { deleted_at: null } }),
        db.sku.count({ where: { deleted_at: null } }),
        db.priceMaterial.count({ where: { deleted_at: null } }),
        db.priceMaterialLabor
          .count({ where: { deleted_at: null } })
          .then((n) => db.priceLabor.count({ where: { deleted_at: null } }).then((m) => n + m)),
        db.unit.count({ where: { status: "ACTIVE" } }),
        db.category.count({ where: { status: "ACTIVE" } }),
      ]);
      return { brands, vendors, skus, materialPrices, workPrices, units, categories };
    },

    // ── Dictionary reads ────────────────────────────────────────────────────

    async listUnits(input: { grants: PermissionGrants; includeArchived?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryRead);
      return db.unit.findMany({
        where: input.includeArchived ? {} : { status: "ACTIVE" },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: { id: true, code: true, name: true, status: true, archived_at: true },
      });
    },

    async listCategories(input: {
      grants: PermissionGrants;
      kind?: "PRODUCT" | "WORK";
      includeDeactivated?: boolean;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryRead);
      return db.category.findMany({
        where: {
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.includeDeactivated ? {} : { status: "ACTIVE" }),
        },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true, kind: true, status: true, merged_into_id: true },
      });
    },

    // ── Brand / Vendor reads ─────────────────────────────────────────────────

    async listBrands(input: { grants: PermissionGrants; search?: string; includeArchived?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandRead);
      const search = input.search?.trim();
      return db.brand.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          notes: true,
          deleted_at: true,
          owner_vendor: { select: { id: true, name: true } },
          _count: { select: { skus: true, suppliers: true, links: true, categories: true } },
        },
      });
    },

    async listVendors(input: { grants: PermissionGrants; search?: string; includeArchived?: boolean }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorRead);
      const search = input.search?.trim();
      return db.vendor.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { legal_name: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          legal_name: true,
          deleted_at: true,
          types: {
            select: {
              vendor_type: {
                select: { code: true, name: true, can_supply_material: true, can_supply_labor: true },
              },
            },
          },
          _count: {
            select: {
              owned_brands: true,
              brand_suppliers: true,
              material_prices: true,
              material_labor_prices: true,
              labor_prices: true,
            },
          },
        },
      });
    },

    // ── Unit CRUD + lifecycle ─────────────────────────────────────────────────

    async createUnit(input: { grants: PermissionGrants; actor: AuditActor; code: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "UNIT_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "UNIT_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        let unit;
        try {
          unit = await tx.unit.create({ data: { id: randomUUID(), code, name } });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, { action: "unit.created", entityType: "unit", entityId: unit!.id, actor: input.actor, metadata: { code } });
        return { unitId: unit!.id };
      });
    },

    async archiveUnit(input: { grants: PermissionGrants; actor: AuditActor; unitId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status === "ARCHIVED") {
          throw new AppError("CONFLICT", "UNIT_ALREADY_ARCHIVED", "Unit is already archived.");
        }
        const now = new Date();
        await addDirectCause(tx, "unit", input.unitId);
        await tx.unit.update({ where: { id: input.unitId }, data: { status: "ARCHIVED", archived_at: now } });
        await writeAudit(tx, { action: "unit.archived", entityType: "unit", entityId: input.unitId, actor: input.actor });
        return { unitId: input.unitId };
      });
    },

    async restoreUnit(input: { grants: PermissionGrants; actor: AuditActor; unitId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ARCHIVED") {
          throw new AppError("CONFLICT", "UNIT_NOT_ARCHIVED", "Unit is not archived.");
        }
        await removeDirectCause(tx, "unit", input.unitId);
        await tx.unit.update({ where: { id: input.unitId }, data: { status: "ACTIVE", archived_at: null } });
        await writeAudit(tx, { action: "unit.restored", entityType: "unit", entityId: input.unitId, actor: input.actor });
        return { unitId: input.unitId };
      });
    },

    async requestUnitDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      unitId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ARCHIVED") {
          throw new AppError("VALIDATION", "UNIT_NOT_ARCHIVED", "Only archived units may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "unit",
          targetId: input.unitId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, { action: "unit.deletion-requested", entityType: "unit", entityId: input.unitId, actor: input.actor });
        return { requestId };
      });
    },

    // ── Category CRUD + lifecycle ─────────────────────────────────────────────

    async createCategory(input: { grants: PermissionGrants; actor: AuditActor; name: string; kind: "PRODUCT" | "WORK" }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "CATEGORY_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const { kind } = input;
      return runTransaction(async (tx) => {
        let category;
        try {
          category = await tx.category.create({ data: { id: randomUUID(), name, slug, kind } });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, {
          action: "category.created",
          entityType: "category",
          entityId: category!.id,
          actor: input.actor,
          metadata: { kind, slug },
        });
        return { categoryId: category!.id };
      });
    },

    async deactivateCategory(input: { grants: PermissionGrants; actor: AuditActor; categoryId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") {
          throw new AppError("CONFLICT", "CATEGORY_NOT_ACTIVE", "Category is not active.");
        }
        const now = new Date();
        await tx.category.update({
          where: { id: input.categoryId },
          data: { status: "DEACTIVATED", deactivated_at: now },
        });
        await writeAudit(tx, {
          action: "category.deactivated",
          entityType: "category",
          entityId: input.categoryId,
          actor: input.actor,
        });
        return { categoryId: input.categoryId };
      });
    },

    async mergeCategory(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      sourceCategoryId: string;
      targetCategoryId: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      if (input.sourceCategoryId === input.targetCategoryId) {
        throw new AppError("VALIDATION", "CATEGORY_MERGE_SELF", "A category cannot be merged into itself.");
      }
      return runTransaction(async (tx) => {
        const [source, target] = await Promise.all([
          tx.category.findUniqueOrThrow({ where: { id: input.sourceCategoryId } }),
          tx.category.findUniqueOrThrow({ where: { id: input.targetCategoryId } }),
        ]);
        if (source.status !== "ACTIVE") {
          throw new AppError("VALIDATION", "CATEGORY_SOURCE_NOT_ACTIVE", "Source category must be active.");
        }
        if (target.status !== "ACTIVE") {
          throw new AppError("VALIDATION", "CATEGORY_TARGET_NOT_ACTIVE", "Target category must be active.");
        }
        if (source.kind !== target.kind) {
          throw new AppError("VALIDATION", "CATEGORY_KIND_MISMATCH", "Categories must be of the same kind to merge.");
        }

        const now = new Date();

        // Transfer SkuCategory rows — skip any SKU already linked to target
        const existingSkuTargets = await tx.skuCategory.findMany({
          where: { category_id: input.targetCategoryId },
          select: { sku_id: true },
        });
        const alreadyLinkedSkus = new Set(existingSkuTargets.map((r) => r.sku_id));

        const sourceSkuLinks = await tx.skuCategory.findMany({
          where: { category_id: input.sourceCategoryId },
          select: { id: true, sku_id: true },
        });
        const skusToTransfer = sourceSkuLinks.filter((r) => !alreadyLinkedSkus.has(r.sku_id));
        if (skusToTransfer.length > 0) {
          await tx.skuCategory.updateMany({
            where: { id: { in: skusToTransfer.map((r) => r.id) } },
            data: { category_id: input.targetCategoryId },
          });
        }
        // Delete remaining source SkuCategory rows (duplicates that couldn't transfer)
        await tx.skuCategory.deleteMany({ where: { category_id: input.sourceCategoryId } });

        // Transfer BrandCategory rows (with origins)
        const existingBrandTargets = await tx.brandCategory.findMany({
          where: { category_id: input.targetCategoryId },
          select: { brand_id: true, id: true },
        });
        const brandTargetMap = new Map(existingBrandTargets.map((r) => [r.brand_id, r.id]));

        const sourceBrandLinks = await tx.brandCategory.findMany({
          where: { category_id: input.sourceCategoryId },
          select: { id: true, brand_id: true, origins: { select: { id: true } } },
        });

        for (const sourceLink of sourceBrandLinks) {
          const existingTargetId = brandTargetMap.get(sourceLink.brand_id);
          if (existingTargetId) {
            // Re-parent origins to the existing target BrandCategory
            await tx.brandCategoryOrigin.updateMany({
              where: { brand_category_id: sourceLink.id },
              data: { brand_category_id: existingTargetId },
            });
            await tx.brandCategory.delete({ where: { id: sourceLink.id } });
          } else {
            // Transfer source BrandCategory to target category
            await tx.brandCategory.update({
              where: { id: sourceLink.id },
              data: { category_id: input.targetCategoryId },
            });
          }
        }

        // Deactivate source
        await tx.category.update({
          where: { id: input.sourceCategoryId },
          data: { status: "DEACTIVATED", deactivated_at: now, merged_into_id: input.targetCategoryId },
        });

        await writeAudit(tx, {
          action: "category.merged",
          entityType: "category",
          entityId: input.sourceCategoryId,
          actor: input.actor,
          metadata: { target_category_id: input.targetCategoryId, skus_transferred: skusToTransfer.length },
        });
        return { sourceCategoryId: input.sourceCategoryId, targetCategoryId: input.targetCategoryId };
      });
    },

    async requestCategoryDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      categoryId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status === "ACTIVE") {
          throw new AppError("VALIDATION", "CATEGORY_STILL_ACTIVE", "Only deactivated categories may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "category",
          targetId: input.categoryId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "category.deletion-requested",
          entityType: "category",
          entityId: input.categoryId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── Brand CRUD + lifecycle ────────────────────────────────────────────────

    async createBrand(input: { grants: PermissionGrants; actor: AuditActor; name: string; notes?: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        let brand;
        try {
          brand = await tx.brand.create({ data: { id: randomUUID(), name, slug, notes: input.notes?.trim() || null } });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, { action: "brand.created", entityType: "brand", entityId: brand!.id, actor: input.actor, metadata: { slug } });
        return { brandId: brand!.id };
      });
    },

    async archiveBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at !== null) {
          throw new AppError("CONFLICT", "BRAND_ALREADY_ARCHIVED", "Brand is already archived.");
        }
        const now = new Date();

        // 1. Archive brand
        await addDirectCause(tx, "brand", input.brandId);
        await tx.brand.update({ where: { id: input.brandId }, data: { deleted_at: now } });

        // Every dependent receives the parent cause, including rows that were
        // already archived directly. Otherwise they could be restored while
        // this Brand remains archived.
        const skus = await tx.sku.findMany({
          where: { brand_id: input.brandId },
          select: { id: true, deleted_at: true },
        });
        const skuIds = skus.map((sku) => sku.id);
        const newlyArchivedSkuCount = skus.filter((sku) => sku.deleted_at === null).length;

        let priceCount = 0;
        if (skuIds.length > 0) {
          await addParentCauses(tx, "sku", "brand", input.brandId, skuIds);
          await tx.sku.updateMany({ where: { id: { in: skuIds }, deleted_at: null }, data: { deleted_at: now } });

          // Cascade through each SKU to every PriceMaterial for the same reason.
          for (const skuId of skuIds) {
            const prices = await tx.priceMaterial.findMany({
              where: { sku_id: skuId },
              select: { id: true, deleted_at: true },
            });
            const priceIds = prices.map((price) => price.id);
            if (priceIds.length > 0) {
              await addParentCauses(tx, "price_material", "sku", skuId, priceIds);
              await tx.priceMaterial.updateMany({ where: { id: { in: priceIds }, deleted_at: null }, data: { deleted_at: now } });
              priceCount += prices.filter((price) => price.deleted_at === null).length;
            }
          }
        }

        await writeAudit(tx, {
          action: "brand.archived",
          entityType: "brand",
          entityId: input.brandId,
          actor: input.actor,
          metadata: { skus_archived: newlyArchivedSkuCount, prices_archived: priceCount },
        });
        return { brandId: input.brandId };
      });
    },

    async restoreBrand(input: { grants: PermissionGrants; actor: AuditActor; brandId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at === null) {
          throw new AppError("CONFLICT", "BRAND_NOT_ARCHIVED", "Brand is not archived.");
        }

        const [identityConflict, ownerVendor, supplierRelations, categoryRelations] = await Promise.all([
          tx.brand.findFirst({
            where: {
              id: { not: input.brandId },
              deleted_at: null,
              OR: [{ slug: brand.slug }, { name: { equals: brand.name, mode: "insensitive" } }],
            },
            select: { id: true },
          }),
          brand.owner_vendor_id ? tx.vendor.findUniqueOrThrow({ where: { id: brand.owner_vendor_id } }) : null,
          tx.brandSupplier.findMany({ where: { brand_id: input.brandId }, select: { vendor_id: true } }),
          tx.brandCategory.findMany({ where: { brand_id: input.brandId }, include: { category: true } }),
        ]);
        if (identityConflict) throw new AppError("CONFLICT", "BRAND_IDENTITY_CONFLICT", "A live Brand already uses this identity.");
        if (ownerVendor?.deleted_at) throw new AppError("CONFLICT", "BRAND_OWNER_ARCHIVED", "Brand owner Vendor is archived.");
        if (categoryRelations.some((row) => row.category.status !== "ACTIVE" || row.category.kind !== "PRODUCT")) {
          throw new AppError("CONFLICT", "BRAND_CATEGORY_INACTIVE", "Brand has an invalid or inactive Category relation.");
        }
        for (const relation of supplierRelations) await assertVendorMaterialCapable(tx, relation.vendor_id);

        // Remove DIRECT cause and restore brand
        await removeDirectCause(tx, "brand", input.brandId);
        await tx.brand.update({ where: { id: input.brandId }, data: { deleted_at: null } });

        // Remove PARENT causes from SKUs and restore those with zero remaining causes
        const restoredSkuIds = await removeParentCausesAndFindRestored(tx, "sku", "brand", input.brandId);
        let priceCount = 0;
        if (restoredSkuIds.length > 0) {
          for (const skuId of restoredSkuIds) await assertSkuRestorable(tx, skuId);
          await tx.sku.updateMany({ where: { id: { in: restoredSkuIds } }, data: { deleted_at: null } });

          // For each restored SKU, remove PARENT causes from PriceMaterials
          for (const skuId of restoredSkuIds) {
            const restoredPriceIds = await removeParentCausesAndFindRestored(tx, "price_material", "sku", skuId);
            if (restoredPriceIds.length > 0) {
              for (const priceId of restoredPriceIds) await assertPriceMaterialRestorable(tx, priceId);
              await tx.priceMaterial.updateMany({ where: { id: { in: restoredPriceIds } }, data: { deleted_at: null } });
              priceCount += restoredPriceIds.length;
            }
          }
        }

        await writeAudit(tx, {
          action: "brand.restored",
          entityType: "brand",
          entityId: input.brandId,
          actor: input.actor,
          metadata: { skus_restored: restoredSkuIds.length, prices_restored: priceCount },
        });
        return { brandId: input.brandId };
      });
    },

    async requestBrandDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      brandId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
        if (brand.deleted_at === null) {
          throw new AppError("VALIDATION", "BRAND_NOT_ARCHIVED", "Only archived brands may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "brand",
          targetId: input.brandId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "brand.deletion-requested",
          entityType: "brand",
          entityId: input.brandId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── Vendor CRUD + lifecycle ────────────────────────────────────────────────

    async createVendor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      legalName?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        let vendor;
        try {
          vendor = await tx.vendor.create({
            data: {
              id: randomUUID(),
              name,
              slug,
              legal_name: input.legalName?.trim() || null,
              notes: input.notes?.trim() || null,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, {
          action: "vendor.created",
          entityType: "vendor",
          entityId: vendor!.id,
          actor: input.actor,
          metadata: { slug },
        });
        return { vendorId: vendor!.id };
      });
    },

    async archiveVendor(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) {
          throw new AppError("CONFLICT", "VENDOR_ALREADY_ARCHIVED", "Vendor is already archived.");
        }
        const now = new Date();

        await addDirectCause(tx, "vendor", input.vendorId);
        await tx.vendor.update({ where: { id: input.vendorId }, data: { deleted_at: now } });

        const materialPrices = await tx.priceMaterial.findMany({
          where: { supplier_vendor_id: input.vendorId },
          select: { id: true, deleted_at: true },
        });
        const materialIds = materialPrices.map((price) => price.id);
        if (materialIds.length > 0) {
          await addParentCauses(tx, "price_material", "vendor", input.vendorId, materialIds);
          await tx.priceMaterial.updateMany({ where: { id: { in: materialIds }, deleted_at: null }, data: { deleted_at: now } });
        }

        const mlPrices = await tx.priceMaterialLabor.findMany({
          where: { vendor_id: input.vendorId },
          select: { id: true, deleted_at: true },
        });
        const mlIds = mlPrices.map((price) => price.id);
        if (mlIds.length > 0) {
          await addParentCauses(tx, "price_material_labor", "vendor", input.vendorId, mlIds);
          await tx.priceMaterialLabor.updateMany({ where: { id: { in: mlIds }, deleted_at: null }, data: { deleted_at: now } });
        }

        const laborPrices = await tx.priceLabor.findMany({
          where: { vendor_id: input.vendorId },
          select: { id: true, deleted_at: true },
        });
        const laborIds = laborPrices.map((price) => price.id);
        if (laborIds.length > 0) {
          await addParentCauses(tx, "price_labor", "vendor", input.vendorId, laborIds);
          await tx.priceLabor.updateMany({ where: { id: { in: laborIds }, deleted_at: null }, data: { deleted_at: now } });
        }

        await writeAudit(tx, {
          action: "vendor.archived",
          entityType: "vendor",
          entityId: input.vendorId,
          actor: input.actor,
          metadata: {
            material_prices_archived: materialPrices.filter((price) => price.deleted_at === null).length,
            ml_prices_archived: mlPrices.filter((price) => price.deleted_at === null).length,
            labor_prices_archived: laborPrices.filter((price) => price.deleted_at === null).length,
          },
        });
        return { vendorId: input.vendorId };
      });
    },

    async restoreVendor(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at === null) {
          throw new AppError("CONFLICT", "VENDOR_NOT_ARCHIVED", "Vendor is not archived.");
        }

        const [identityConflict, typeRelations, supplierRelationCount] = await Promise.all([
          tx.vendor.findFirst({
            where: {
              id: { not: input.vendorId },
              deleted_at: null,
              OR: [{ slug: vendor.slug }, { name: { equals: vendor.name, mode: "insensitive" } }],
            },
            select: { id: true },
          }),
          tx.vendorVendorType.findMany({ where: { vendor_id: input.vendorId }, include: { vendor_type: true } }),
          tx.brandSupplier.count({ where: { vendor_id: input.vendorId } }),
        ]);
        if (identityConflict) throw new AppError("CONFLICT", "VENDOR_IDENTITY_CONFLICT", "A live Vendor already uses this identity.");
        if (typeRelations.some((row) => row.vendor_type.deleted_at !== null)) {
          throw new AppError("CONFLICT", "VENDOR_TYPE_ARCHIVED", "Vendor has an archived VendorType assignment.");
        }

        await removeDirectCause(tx, "vendor", input.vendorId);
        await tx.vendor.update({ where: { id: input.vendorId }, data: { deleted_at: null } });
        if (supplierRelationCount > 0) await assertVendorMaterialCapable(tx, input.vendorId);

        const restoredMaterialIds = await removeParentCausesAndFindRestored(tx, "price_material", "vendor", input.vendorId);
        if (restoredMaterialIds.length > 0) {
          for (const priceId of restoredMaterialIds) await assertPriceMaterialRestorable(tx, priceId);
          await tx.priceMaterial.updateMany({ where: { id: { in: restoredMaterialIds } }, data: { deleted_at: null } });
        }
        const restoredMlIds = await removeParentCausesAndFindRestored(tx, "price_material_labor", "vendor", input.vendorId);
        if (restoredMlIds.length > 0) {
          for (const priceId of restoredMlIds) await assertWorkPriceRestorable(tx, "material-labor", priceId);
          await tx.priceMaterialLabor.updateMany({ where: { id: { in: restoredMlIds } }, data: { deleted_at: null } });
        }
        const restoredLaborIds = await removeParentCausesAndFindRestored(tx, "price_labor", "vendor", input.vendorId);
        if (restoredLaborIds.length > 0) {
          for (const priceId of restoredLaborIds) await assertWorkPriceRestorable(tx, "labor", priceId);
          await tx.priceLabor.updateMany({ where: { id: { in: restoredLaborIds } }, data: { deleted_at: null } });
        }

        await writeAudit(tx, {
          action: "vendor.restored",
          entityType: "vendor",
          entityId: input.vendorId,
          actor: input.actor,
          metadata: {
            material_prices_restored: restoredMaterialIds.length,
            ml_prices_restored: restoredMlIds.length,
            labor_prices_restored: restoredLaborIds.length,
          },
        });
        return { vendorId: input.vendorId };
      });
    },

    async requestVendorDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      vendorId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at === null) {
          throw new AppError("VALIDATION", "VENDOR_NOT_ARCHIVED", "Only archived vendors may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "vendor",
          targetId: input.vendorId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "vendor.deletion-requested",
          entityType: "vendor",
          entityId: input.vendorId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── SKU CRUD + lifecycle ──────────────────────────────────────────────────

    async createSku(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      code?: string;
      notes?: string;
      brandId?: string;
      baseUnitId: string;
      purchaseUnitId?: string;
      categoryIds: string[];
      priceMaterials: Array<{
        supplierVendorId: string;
        amount: string;
        currency: string;
        notes?: string;
      }>;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "SKU_NAME_REQUIRED");
      const slug = requiredSlug(name);
      if (!input.categoryIds || input.categoryIds.length === 0) {
        throw new AppError("VALIDATION", "SKU_CATEGORY_REQUIRED", "At least one category is required.");
      }
      if (!input.priceMaterials || input.priceMaterials.length === 0) {
        throw new AppError("VALIDATION", "SKU_PRICE_REQUIRED", "At least one material price is required.");
      }
      if (new Set(input.categoryIds).size !== input.categoryIds.length) {
        throw new AppError("VALIDATION", "SKU_CATEGORY_DUPLICATE", "Categories must not contain duplicates.");
      }
      const supplierIds = input.priceMaterials.map((price) => price.supplierVendorId);
      if (new Set(supplierIds).size !== supplierIds.length) {
        throw new AppError("VALIDATION", "SKU_PRICE_VENDOR_DUPLICATE", "Only one initial price is allowed per Vendor.");
      }

      return runTransaction(async (tx) => {
        // Validate base unit is active
        const baseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } });
        if (baseUnit.status !== "ACTIVE") {
          throw new AppError("VALIDATION", "SKU_BASE_UNIT_INACTIVE", "Base unit must be active.");
        }
        if (input.purchaseUnitId) {
          const purchaseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.purchaseUnitId } });
          if (purchaseUnit.status !== "ACTIVE") {
            throw new AppError("VALIDATION", "SKU_PURCHASE_UNIT_INACTIVE", "Purchase unit must be active.");
          }
        }

        // Validate all categories are active
        const categories = await tx.category.findMany({
          where: { id: { in: input.categoryIds } },
          select: { id: true, kind: true, status: true },
        });
        if (categories.length !== input.categoryIds.length) {
          throw new AppError("VALIDATION", "SKU_CATEGORY_NOT_FOUND", "One or more categories not found.");
        }
        for (const cat of categories) {
          if (cat.status !== "ACTIVE") {
            throw new AppError("VALIDATION", "SKU_CATEGORY_INACTIVE", `Category ${cat.id} is not active.`);
          }
        }

        // Validate brand if provided
        if (input.brandId) {
          const brand = await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } });
          if (brand.deleted_at !== null) {
            throw new AppError("VALIDATION", "SKU_BRAND_ARCHIVED", "Brand is archived.");
          }
        }

        // Validate price materials
        const priceUnitId = input.purchaseUnitId ?? input.baseUnitId;
        for (const pm of input.priceMaterials) {
          requiredCurrency(pm.currency);
          requiredAmount(pm.amount);
          const supplier = await tx.vendor.findUniqueOrThrow({ where: { id: pm.supplierVendorId } });
          if (supplier.deleted_at !== null) {
            throw new AppError("VALIDATION", "PRICE_VENDOR_ARCHIVED", "Supplier vendor is archived.");
          }
          await assertVendorMaterialCapable(tx, pm.supplierVendorId);
        }

        // Create SKU
        let sku;
        try {
          sku = await tx.sku.create({
            data: {
              id: randomUUID(),
              name,
              slug,
              code: input.code?.trim() || null,
              notes: input.notes?.trim() || null,
              brand_id: input.brandId ?? null,
              base_unit_id: input.baseUnitId,
              purchase_unit_id: input.purchaseUnitId ?? null,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        const skuId = sku!.id;

        // Create SkuCategory links
        await tx.skuCategory.createMany({
          data: input.categoryIds.map((categoryId) => ({ id: randomUUID(), sku_id: skuId, category_id: categoryId })),
        });

        // Brand Category enrichment: if brand + PRODUCT category, upsert BrandCategory with SKU_ENRICHMENT origin
        if (input.brandId) {
          const productCategoryIds = categories.filter((c) => c.kind === "PRODUCT").map((c) => c.id);
          for (const catId of productCategoryIds) {
            let bc = await tx.brandCategory.findUnique({
              where: { brand_id_category_id: { brand_id: input.brandId, category_id: catId } },
            });
            if (!bc) {
              bc = await tx.brandCategory.create({
                data: { id: randomUUID(), brand_id: input.brandId, category_id: catId },
              });
            }
            await tx.brandCategoryOrigin.create({
              data: {
                id: randomUUID(),
                brand_category_id: bc.id,
                kind: "SKU_ENRICHMENT",
                source_sku_id: skuId,
                actor_user_id: input.actor.userId ?? null,
                actor_label: input.actor.label,
              },
            });
          }
        }

        // Create PriceMaterial rows
        await tx.priceMaterial.createMany({
          data: input.priceMaterials.map((pm) => ({
            id: randomUUID(),
            sku_id: skuId,
            supplier_vendor_id: pm.supplierVendorId,
            amount: requiredAmount(pm.amount),
            currency: requiredCurrency(pm.currency),
            unit_id: priceUnitId,
            notes: pm.notes?.trim() || null,
            updated_by_user_id: input.actor.userId ?? null,
            updated_by_label: input.actor.label,
          })),
        });

        await writeAudit(tx, {
          action: "sku.created",
          entityType: "sku",
          entityId: skuId,
          actor: input.actor,
          metadata: {
            slug,
            brand_id: input.brandId ?? null,
            categories: input.categoryIds.length,
            prices: input.priceMaterials.length,
          },
        });
        return { skuId };
      });
    },

    async archiveSku(input: { grants: PermissionGrants; actor: AuditActor; skuId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at !== null) {
          throw new AppError("CONFLICT", "SKU_ALREADY_ARCHIVED", "SKU is already archived.");
        }
        const now = new Date();

        await addDirectCause(tx, "sku", input.skuId);
        await tx.sku.update({ where: { id: input.skuId }, data: { deleted_at: now } });

        const prices = await tx.priceMaterial.findMany({
          where: { sku_id: input.skuId },
          select: { id: true, deleted_at: true },
        });
        const priceIds = prices.map((price) => price.id);
        if (priceIds.length > 0) {
          await addParentCauses(tx, "price_material", "sku", input.skuId, priceIds);
          await tx.priceMaterial.updateMany({ where: { id: { in: priceIds }, deleted_at: null }, data: { deleted_at: now } });
        }

        await writeAudit(tx, {
          action: "sku.archived",
          entityType: "sku",
          entityId: input.skuId,
          actor: input.actor,
          metadata: { prices_archived: prices.filter((price) => price.deleted_at === null).length },
        });
        return { skuId: input.skuId };
      });
    },

    async restoreSku(input: { grants: PermissionGrants; actor: AuditActor; skuId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at === null) {
          throw new AppError("CONFLICT", "SKU_NOT_ARCHIVED", "SKU is not archived.");
        }

        await removeDirectCause(tx, "sku", input.skuId);
        // Check remaining causes
        const remaining = await tx.archiveCause.count({ where: { entity_type: "sku", entity_id: input.skuId } });
        if (remaining > 0) {
          throw new AppError("CONFLICT", "SKU_HAS_PARENT_CAUSES", "SKU cannot be restored while its parent (Brand) is still archived.");
        }
        await assertSkuRestorable(tx, input.skuId);
        await tx.sku.update({ where: { id: input.skuId }, data: { deleted_at: null } });

        const restoredPriceIds = await removeParentCausesAndFindRestored(tx, "price_material", "sku", input.skuId);
        if (restoredPriceIds.length > 0) {
          for (const priceId of restoredPriceIds) await assertPriceMaterialRestorable(tx, priceId);
          await tx.priceMaterial.updateMany({ where: { id: { in: restoredPriceIds } }, data: { deleted_at: null } });
        }

        await writeAudit(tx, {
          action: "sku.restored",
          entityType: "sku",
          entityId: input.skuId,
          actor: input.actor,
          metadata: { prices_restored: restoredPriceIds.length },
        });
        return { skuId: input.skuId };
      });
    },

    async requestSkuDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      skuId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at === null) {
          throw new AppError("VALIDATION", "SKU_NOT_ARCHIVED", "Only archived SKUs may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "sku",
          targetId: input.skuId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "sku.deletion-requested",
          entityType: "sku",
          entityId: input.skuId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── PriceMaterial CRUD + lifecycle ────────────────────────────────────────

    async createPriceMaterial(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      skuId: string;
      supplierVendorId: string;
      amount: string;
      currency: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx) => {
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: input.skuId } });
        if (sku.deleted_at !== null) throw new AppError("VALIDATION", "SKU_ARCHIVED", "SKU is archived.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.supplierVendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier vendor is archived.");
        await assertVendorMaterialCapable(tx, input.supplierVendorId);

        const unitId = sku.purchase_unit_id ?? sku.base_unit_id;
        let price;
        try {
          price = await tx.priceMaterial.create({
            data: {
              id: randomUUID(),
              sku_id: input.skuId,
              supplier_vendor_id: input.supplierVendorId,
              amount,
              currency,
              unit_id: unitId,
              notes: input.notes?.trim() || null,
              updated_by_user_id: input.actor.userId ?? null,
              updated_by_label: input.actor.label,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, {
          action: "price-material.created",
          entityType: "price_material",
          entityId: price!.id,
          actor: input.actor,
          metadata: { sku_id: input.skuId, vendor_id: input.supplierVendorId },
        });
        return { priceMaterialId: price!.id };
      });
    },

    async archivePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        await addDirectCause(tx, "price_material", input.priceMaterialId);
        await tx.priceMaterial.update({ where: { id: input.priceMaterialId }, data: { deleted_at: new Date() } });
        await writeAudit(tx, {
          action: "price-material.archived",
          entityType: "price_material",
          entityId: input.priceMaterialId,
          actor: input.actor,
        });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async restorePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price is not archived.");
        await removeDirectCause(tx, "price_material", input.priceMaterialId);
        const remaining = await tx.archiveCause.count({
          where: { entity_type: "price_material", entity_id: input.priceMaterialId },
        });
        if (remaining > 0) {
          throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent is still archived.");
        }
        await assertPriceMaterialRestorable(tx, input.priceMaterialId);
        await tx.priceMaterial.update({ where: { id: input.priceMaterialId }, data: { deleted_at: null } });
        await writeAudit(tx, {
          action: "price-material.restored",
          entityType: "price_material",
          entityId: input.priceMaterialId,
          actor: input.actor,
        });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async requestPriceMaterialDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      priceMaterialId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at === null) {
          throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "price_material",
          targetId: input.priceMaterialId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "price-material.deletion-requested",
          entityType: "price_material",
          entityId: input.priceMaterialId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── PriceMaterialLabor CRUD + lifecycle ───────────────────────────────────

    async createPriceMaterialLabor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      categoryId: string;
      vendorId: string;
      unitId: string;
      amount: string;
      currency: string;
      scopeNote?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Vendor is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);

        let price;
        try {
          price = await tx.priceMaterialLabor.create({
            data: {
              id: randomUUID(),
              name,
              slug,
              category_id: input.categoryId,
              vendor_id: input.vendorId,
              unit_id: input.unitId,
              amount,
              currency,
              scope_note: input.scopeNote?.trim() || null,
              notes: input.notes?.trim() || null,
              updated_by_user_id: input.actor.userId ?? null,
              updated_by_label: input.actor.label,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, {
          action: "price-material-labor.created",
          entityType: "price_material_labor",
          entityId: price!.id,
          actor: input.actor,
          metadata: { vendor_id: input.vendorId, category_id: input.categoryId },
        });
        return { priceMaterialLaborId: price!.id };
      });
    },

    async archivePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        await addDirectCause(tx, "price_material_labor", input.priceMaterialLaborId);
        await tx.priceMaterialLabor.update({ where: { id: input.priceMaterialLaborId }, data: { deleted_at: new Date() } });
        await writeAudit(tx, {
          action: "price-material-labor.archived",
          entityType: "price_material_labor",
          entityId: input.priceMaterialLaborId,
          actor: input.actor,
        });
        return { priceMaterialLaborId: input.priceMaterialLaborId };
      });
    },

    async restorePriceMaterialLabor(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price is not archived.");
        await removeDirectCause(tx, "price_material_labor", input.priceMaterialLaborId);
        const remaining = await tx.archiveCause.count({
          where: { entity_type: "price_material_labor", entity_id: input.priceMaterialLaborId },
        });
        if (remaining > 0) {
          throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent vendor is still archived.");
        }
        await assertWorkPriceRestorable(tx, "material-labor", input.priceMaterialLaborId);
        await tx.priceMaterialLabor.update({ where: { id: input.priceMaterialLaborId }, data: { deleted_at: null } });
        await writeAudit(tx, {
          action: "price-material-labor.restored",
          entityType: "price_material_labor",
          entityId: input.priceMaterialLaborId,
          actor: input.actor,
        });
        return { priceMaterialLaborId: input.priceMaterialLaborId };
      });
    },

    async requestPriceMaterialLaborDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      priceMaterialLaborId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });
        if (price.deleted_at === null) {
          throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "price_material_labor",
          targetId: input.priceMaterialLaborId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "price-material-labor.deletion-requested",
          entityType: "price_material_labor",
          entityId: input.priceMaterialLaborId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── PriceLabor CRUD + lifecycle ───────────────────────────────────────────

    async createPriceLabor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      categoryId: string;
      vendorId: string;
      unitId: string;
      amount: string;
      currency: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);
      return runTransaction(async (tx) => {
        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Vendor is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);

        let price;
        try {
          price = await tx.priceLabor.create({
            data: {
              id: randomUUID(),
              name,
              slug,
              category_id: input.categoryId,
              vendor_id: input.vendorId,
              unit_id: input.unitId,
              amount,
              currency,
              notes: input.notes?.trim() || null,
              updated_by_user_id: input.actor.userId ?? null,
              updated_by_label: input.actor.label,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, {
          action: "price-labor.created",
          entityType: "price_labor",
          entityId: price!.id,
          actor: input.actor,
          metadata: { vendor_id: input.vendorId, category_id: input.categoryId },
        });
        return { priceLaborId: price!.id };
      });
    },

    async archivePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        await addDirectCause(tx, "price_labor", input.priceLaborId);
        await tx.priceLabor.update({ where: { id: input.priceLaborId }, data: { deleted_at: new Date() } });
        await writeAudit(tx, {
          action: "price-labor.archived",
          entityType: "price_labor",
          entityId: input.priceLaborId,
          actor: input.actor,
        });
        return { priceLaborId: input.priceLaborId };
      });
    },

    async restorePriceLabor(input: { grants: PermissionGrants; actor: AuditActor; priceLaborId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at === null) throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price is not archived.");
        await removeDirectCause(tx, "price_labor", input.priceLaborId);
        const remaining = await tx.archiveCause.count({
          where: { entity_type: "price_labor", entity_id: input.priceLaborId },
        });
        if (remaining > 0) {
          throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent vendor is still archived.");
        }
        await assertWorkPriceRestorable(tx, "labor", input.priceLaborId);
        await tx.priceLabor.update({ where: { id: input.priceLaborId }, data: { deleted_at: null } });
        await writeAudit(tx, {
          action: "price-labor.restored",
          entityType: "price_labor",
          entityId: input.priceLaborId,
          actor: input.actor,
        });
        return { priceLaborId: input.priceLaborId };
      });
    },

    async requestPriceLaborDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      priceLaborId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });
        if (price.deleted_at === null) {
          throw new AppError("VALIDATION", "PRICE_NOT_ARCHIVED", "Only archived prices may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "price_labor",
          targetId: input.priceLaborId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "price-labor.deletion-requested",
          entityType: "price_labor",
          entityId: input.priceLaborId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── Deletion approval workflow ────────────────────────────────────────────

    async rejectDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      requestId: string;
      reason?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.deletionApprove);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const request = await tx.deletionRequest.findFirst({ where: { id: input.requestId, status: "PENDING" } });
        if (!request) {
          throw new AppError("NOT_FOUND", "DELETION_REQUEST_NOT_FOUND", "Pending deletion request not found.");
        }
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            approver_user_id: input.actor.userId!,
            approver_label: input.actor.label,
            decided_at: new Date(),
            reason: input.reason ?? null,
          },
        });
        const entityType = request.target_type.replace(/_/g, "-");
        await writeAudit(tx, {
          action: `${entityType}.deletion-rejected`,
          entityType: request.target_type,
          entityId: request.target_id,
          actor: input.actor,
          metadata: { request_id: request.id },
        });
        return { requestId: request.id };
      });
    },

    async approveDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      requestId: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.deletionApprove);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const request = await tx.deletionRequest.findFirst({ where: { id: input.requestId, status: "PENDING" } });
        if (!request) {
          throw new AppError("NOT_FOUND", "DELETION_REQUEST_NOT_FOUND", "Pending deletion request not found.");
        }

        await tx.deletionRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            approver_user_id: input.actor.userId!,
            approver_label: input.actor.label,
            decided_at: new Date(),
          },
        });

        const { target_type: targetType, target_id: targetId } = request;

        // Execute hard delete based on target type
        if (targetType === "brand") {
          // Block if BrandSupplier rows exist
          const supplierCount = await tx.brandSupplier.count({ where: { brand_id: targetId } });
          if (supplierCount > 0) {
            throw new AppError("CONFLICT", "BRAND_HAS_SUPPLIERS", "Brand still has supplier relations. Remove them first.");
          }
          const contactCount = await tx.vendorContact.count({ where: { brand_id: targetId } });
          if (contactCount > 0) {
            throw new AppError("CONFLICT", "BRAND_HAS_CONTACTS", "Brand still has scoped contacts. Remove them first.");
          }

          const skuIds = await tx.sku
            .findMany({ where: { brand_id: targetId }, select: { id: true } })
            .then((rows) => rows.map((r) => r.id));

          if (skuIds.length > 0) {
            const priceIds = await tx.priceMaterial
              .findMany({ where: { sku_id: { in: skuIds } }, select: { id: true } })
              .then((rows) => rows.map((r) => r.id));
            if (priceIds.length > 0) {
              await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: { in: priceIds } } });
              await tx.priceMaterial.deleteMany({ where: { id: { in: priceIds } } });
            }
            await tx.skuCategory.deleteMany({ where: { sku_id: { in: skuIds } } });
            await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: { in: skuIds } } });
            await tx.archiveCause.deleteMany({ where: { entity_type: "sku", entity_id: { in: skuIds } } });
            await tx.sku.deleteMany({ where: { id: { in: skuIds } } });
          }

          const bcIds = await tx.brandCategory
            .findMany({ where: { brand_id: targetId }, select: { id: true } })
            .then((rows) => rows.map((r) => r.id));
          if (bcIds.length > 0) {
            await tx.brandCategoryOrigin.deleteMany({ where: { brand_category_id: { in: bcIds } } });
            await tx.brandCategory.deleteMany({ where: { id: { in: bcIds } } });
          }
          await tx.brandHashtag.deleteMany({ where: { brand_id: targetId } });
          await tx.brandLink.deleteMany({ where: { brand_id: targetId } });
          await tx.brandSupplier.deleteMany({ where: { brand_id: targetId } });
          await tx.archiveCause.deleteMany({ where: { entity_type: "brand", entity_id: targetId } });
          await tx.brand.delete({ where: { id: targetId } });

        } else if (targetType === "vendor") {
          const ownedBrandCount = await tx.brand.count({ where: { owner_vendor_id: targetId } });
          if (ownedBrandCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_HAS_OWNED_BRANDS", "Vendor still owns brands. Clear ownership first.");
          }
          const supplierCount = await tx.brandSupplier.count({ where: { vendor_id: targetId } });
          if (supplierCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_HAS_SUPPLIER_RELATIONS", "Vendor still has BrandSupplier relations.");
          }
          const priceCount =
            (await tx.priceMaterial.count({ where: { supplier_vendor_id: targetId } })) +
            (await tx.priceMaterialLabor.count({ where: { vendor_id: targetId } })) +
            (await tx.priceLabor.count({ where: { vendor_id: targetId } }));
          if (priceCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_HAS_PRICES", "Vendor still has price rows. Delete them first.");
          }
          await tx.vendorContact.deleteMany({ where: { vendor_id: targetId } });
          await tx.vendorLink.deleteMany({ where: { vendor_id: targetId } });
          await tx.vendorVendorType.deleteMany({ where: { vendor_id: targetId } });
          await tx.archiveCause.deleteMany({ where: { entity_type: "vendor", entity_id: targetId } });
          await tx.vendor.delete({ where: { id: targetId } });

        } else if (targetType === "sku") {
          const priceIds = await tx.priceMaterial
            .findMany({ where: { sku_id: targetId }, select: { id: true } })
            .then((rows) => rows.map((r) => r.id));
          if (priceIds.length > 0) {
            await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: { in: priceIds } } });
            await tx.priceMaterial.deleteMany({ where: { id: { in: priceIds } } });
          }
          await tx.skuCategory.deleteMany({ where: { sku_id: targetId } });
          await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: targetId } });
          await tx.archiveCause.deleteMany({ where: { entity_type: "sku", entity_id: targetId } });
          await tx.sku.delete({ where: { id: targetId } });

        } else if (targetType === "unit") {
          await tx.archiveCause.deleteMany({ where: { entity_type: "unit", entity_id: targetId } });
          try {
            await tx.unit.delete({ where: { id: targetId } });
          } catch (error) {
            mapWriteError(error);
          }

        } else if (targetType === "category") {
          try {
            await tx.category.delete({ where: { id: targetId } });
          } catch (error) {
            mapWriteError(error);
          }

        } else if (targetType === "price_material") {
          await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: targetId } });
          await tx.priceMaterial.delete({ where: { id: targetId } });

        } else if (targetType === "price_material_labor") {
          await tx.archiveCause.deleteMany({ where: { entity_type: "price_material_labor", entity_id: targetId } });
          await tx.priceMaterialLabor.delete({ where: { id: targetId } });

        } else if (targetType === "price_labor") {
          await tx.archiveCause.deleteMany({ where: { entity_type: "price_labor", entity_id: targetId } });
          await tx.priceLabor.delete({ where: { id: targetId } });

        } else {
          throw new AppError("VALIDATION", "UNKNOWN_TARGET_TYPE", `Unknown deletion target type: ${targetType}`);
        }

        const auditEntityType = targetType;
        const auditAction = `${targetType.replace(/_/g, "-")}.deleted`;
        await writeAudit(tx, {
          action: auditAction,
          entityType: auditEntityType,
          entityId: targetId,
          actor: input.actor,
          metadata: {
            request_id: request.id,
            requester_user_id: request.requester_user_id,
            requester_label: request.requester_label,
          },
        });

        return { requestId: request.id, targetType, targetId };
      });
    },
  };
}
