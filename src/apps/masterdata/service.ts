import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";
import { hasPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";
import { calculateRectangleAreaSquareMeters } from "@platform/utilities/measurement";

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
  promotionApprove: "masterdata.promotion.approve",
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

function requireAnyPermission(grants: PermissionGrants, permissions: readonly string[], safeMessage: string): void {
  if (!permissions.some((permission) => hasPermission(grants, permission))) {
    throw new AppError("FORBIDDEN", "PERMISSION_DENIED", safeMessage);
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

function requiredSlug(value: string): string {
  const slug = toSlug(value);
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

function resolveSkuIdentity(nameValue?: string | null, codeValue?: string | null) {
  const name = normalizeText(nameValue ?? "") || null;
  const code = codeValue?.trim() || null;
  if (!name && !code) {
    throw new AppError("VALIDATION", "SKU_IDENTITY_REQUIRED", "SKU code or SKU name is required.");
  }
  return { name, code, slug: requiredSlug(name ?? code!) };
}

type SkuMeasurementInput = {
  dimensionLength?: string | null;
  dimensionWidth?: string | null;
  dimensionThickness?: string | null;
  dimensionUnitId?: string | null;
};

const LENGTH_TO_METRE: Readonly<Record<string, string>> = { MM: "0.001", CM: "0.01", M: "1" };

async function resolveSkuMeasurement(
  tx: TxClient,
  input: SkuMeasurementInput,
  baseUnit: { code: string },
  purchaseUnit: { code: string; status: string } | null,
) {
  const length = input.dimensionLength?.trim() || null;
  const width = input.dimensionWidth?.trim() || null;
  const thickness = input.dimensionThickness?.trim() || null;
  const dimensionUnitId = input.dimensionUnitId?.trim() || null;
  if (!length && !width && !thickness && !dimensionUnitId) {
    return {
      dimension_length: null,
      dimension_width: null,
      dimension_thickness: null,
      dimension_unit_id: null,
      purchase_to_base_factor: null,
    };
  }
  if (!length || !width || !dimensionUnitId) {
    throw new AppError("VALIDATION", "SKU_DIMENSION_INCOMPLETE", "Length, width, and dimension unit must be filled together.");
  }
  if (!purchaseUnit) {
    throw new AppError("VALIDATION", "SKU_DIMENSION_PURCHASE_UNIT_REQUIRED", "A purchase unit is required when dimensions define a conversion.");
  }
  if (baseUnit.code.toUpperCase() !== "M2") {
    throw new AppError("VALIDATION", "SKU_DIMENSION_BASE_UNIT_INVALID", "Rectangular dimensions require M2 as the base measurement unit.");
  }
  const dimensionUnit = await tx.unit.findUniqueOrThrow({ where: { id: dimensionUnitId } });
  if (dimensionUnit.status !== "ACTIVE") {
    throw new AppError("VALIDATION", "SKU_DIMENSION_UNIT_INACTIVE", "Dimension unit must be active.");
  }
  const lengthToMeterFactor = LENGTH_TO_METRE[dimensionUnit.code.toUpperCase()];
  if (!lengthToMeterFactor) {
    throw new AppError("VALIDATION", "SKU_DIMENSION_UNIT_INVALID", "Dimension unit must be MM, CM, or M.");
  }
  try {
    const purchaseToBaseFactor = calculateRectangleAreaSquareMeters({ length, width, lengthToMeterFactor });
    const normalizedThickness = thickness ? toDecimalString(thickness) : null;
    if (normalizedThickness?.startsWith("-") || normalizedThickness === "0") throw new Error("invalid thickness");
    return {
      dimension_length: toDecimalString(length),
      dimension_width: toDecimalString(width),
      dimension_thickness: normalizedThickness,
      dimension_unit_id: dimensionUnit.id,
      purchase_to_base_factor: purchaseToBaseFactor,
    };
  } catch {
    throw new AppError("VALIDATION", "SKU_DIMENSION_INVALID", "Dimensions must be positive decimal values.");
  }
}

function normalizeHashtags(hashtags: readonly string[]): Array<{ label: string; normalized: string }> {
  const seen = new Set<string>();
  const result: Array<{ label: string; normalized: string }> = [];
  for (const raw of hashtags) {
    const clean = raw.trim().replace(/^#+/, "");
    const normalized = normalizeText(clean).toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push({ label: clean, normalized });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Archive-cause provenance helpers (masterdata.md §4.1)
// ---------------------------------------------------------------------------

async function addDirectCause(tx: TxClient, entityType: string, entityId: string): Promise<void> {
  // masterdata.md §4.1 rule 7: overlapping causes are idempotent. A bare
  // `create` turned a repeated direct archive into a raw unique-constraint
  // failure instead of a no-op.
  await tx.archiveCause.createMany({
    data: [{ id: randomUUID(), entity_type: entityType, entity_id: entityId, kind: "DIRECT", parent_type: null, parent_id: null }],
    skipDuplicates: true,
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
    skipDuplicates: true,
  });
}

async function removeDirectCause(tx: TxClient, entityType: string, entityId: string): Promise<void> {
  await tx.archiveCause.deleteMany({
    where: { entity_type: entityType, entity_id: entityId, kind: "DIRECT", parent_type: null, parent_id: null },
  });
}

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
    throw new AppError("VALIDATION", "VENDOR_NOT_MATERIAL_CAPABLE", "Supplier is not eligible to supply material.");
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
    throw new AppError("VALIDATION", "VENDOR_NOT_LABOR_CAPABLE", "Supplier is not eligible to provide labor.");
  }
}

async function assertVendorTypeRemovalSafe(tx: TxClient, vendorId: string, remainingTypeIds: string[]): Promise<void> {
  const remainingTypes = await tx.vendorType.findMany({
    where: { id: { in: remainingTypeIds }, deleted_at: null },
  });
  const hasMaterial = remainingTypes.some((t) => t.can_supply_material);
  const hasLabor = remainingTypes.some((t) => t.can_supply_labor);

  if (!hasMaterial) {
    const [priceCount, supplierCount] = await Promise.all([
      tx.priceMaterial.count({ where: { supplier_vendor_id: vendorId, deleted_at: null } }),
      tx.brandSupplier.count({ where: { vendor_id: vendorId } }),
    ]);
    if (priceCount > 0 || supplierCount > 0) {
      throw new AppError(
        "CONFLICT",
        "VENDOR_MATERIAL_CAPABILITY_IN_USE",
        "Cannot remove material supply capability while live material prices or brand supplier relations exist.",
      );
    }
  }

  if (!hasLabor) {
    const [mlCount, laborCount] = await Promise.all([
      tx.priceMaterialLabor.count({ where: { vendor_id: vendorId, deleted_at: null } }),
      tx.priceLabor.count({ where: { vendor_id: vendorId, deleted_at: null } }),
    ]);
    if (mlCount > 0 || laborCount > 0) {
      throw new AppError(
        "CONFLICT",
        "VENDOR_LABOR_CAPABILITY_IN_USE",
        "Cannot remove labor provision capability while live work prices exist.",
      );
    }
  }
}

/**
 * brand-contract §2.1: "A Brand may have zero or many live PRODUCT Categories."
 * Neither createBrand nor updateBrand checked this, so a WORK or deactivated
 * Category could be attached to a Brand and then surface in Library filtering.
 */
async function assertLiveProductCategories(tx: TxClient, categoryIds: readonly string[]): Promise<void> {
  if (categoryIds.length === 0) return;
  const unique = [...new Set(categoryIds)];
  const categories = await tx.category.findMany({
    where: { id: { in: unique } },
    select: { id: true, kind: true, status: true },
  });
  if (categories.length !== unique.length) {
    throw new AppError("VALIDATION", "BRAND_CATEGORY_NOT_FOUND", "One or more categories not found.");
  }
  for (const category of categories) {
    if (category.status !== "ACTIVE") {
      throw new AppError("VALIDATION", "BRAND_CATEGORY_INACTIVE", "Brand categories must be active.");
    }
    if (category.kind !== "PRODUCT") {
      throw new AppError("VALIDATION", "BRAND_CATEGORY_KIND_INVALID", "Brand categories must be PRODUCT categories.");
    }
  }
}

/**
 * brand-contract §3: a Brand-Category relation survives only while at least one
 * manual or SKU origin remains. Removing the last origin must remove the
 * relation, or the Brand keeps a category nothing justifies.
 */
async function pruneOriginlessBrandCategories(tx: TxClient, brandCategoryIds: readonly string[]): Promise<void> {
  for (const brandCategoryId of new Set(brandCategoryIds)) {
    const remaining = await tx.brandCategoryOrigin.count({ where: { brand_category_id: brandCategoryId } });
    if (remaining === 0) {
      await tx.brandCategory.delete({ where: { id: brandCategoryId } });
    }
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
  if (vendor.deleted_at) throw new AppError("CONFLICT", "PRICE_VENDOR_ARCHIVED", "Price cannot be restored while its Supplier is archived.");
  if (unit.status !== "ACTIVE") throw new AppError("CONFLICT", "PRICE_UNIT_INACTIVE", "Price cannot be restored while its Unit is archived.");
  if (sourceLink?.brand.deleted_at) {
    throw new AppError("CONFLICT", "PRICE_SOURCE_BRAND_ARCHIVED", "Price cannot be restored while its source Brand is archived.");
  }
  await assertVendorMaterialCapable(tx, vendor.id);
  if (conflict) throw new AppError("CONFLICT", "PRICE_PAIR_CONFLICT", "A live price already exists for this SKU and Supplier.");
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
  if (vendor.deleted_at) throw new AppError("CONFLICT", "PRICE_VENDOR_ARCHIVED", "Price cannot be restored while its Supplier is archived.");
  if (unit.status !== "ACTIVE") throw new AppError("CONFLICT", "PRICE_UNIT_INACTIVE", "Price cannot be restored while its Unit is archived.");
  await assertVendorLaborCapable(tx, vendor.id);
  if (conflict) throw new AppError("CONFLICT", "PRICE_IDENTITY_CONFLICT", "A live work price already uses this Supplier identity.");
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

/**
 * brand-contract / vendor-contract: "Updated by" is sourced from AuditEvent,
 * not denormalized onto the Brand/Vendor row. This resolves the latest actor
 * label per entity id from the audit trail for a given entity type.
 */
async function latestAuditActorLabels(
  db: PrismaClient,
  entityType: string,
  entityIds: readonly string[],
): Promise<Map<string, string>> {
  if (entityIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ entity_id: string; actor_label: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (entity_id) entity_id, actor_label
    FROM "platform"."AuditEvent"
    WHERE app_id = 'masterdata'
      AND entity_type = ${entityType}
      AND entity_id IN (${Prisma.join(entityIds)})
    ORDER BY entity_id, occurred_at DESC
  `);
  return new Map(rows.map((row) => [row.entity_id, row.actor_label]));
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
      const [brands, vendors, skus, materialPrices, workPrices, units, categories, deletionRequests] = await Promise.all([
        db.brand.count({ where: { deleted_at: null } }),
        db.vendor.count({ where: { deleted_at: null } }),
        db.sku.count({ where: { deleted_at: null } }),
        db.priceMaterial.count({ where: { deleted_at: null } }),
        db.priceMaterialLabor
          .count({ where: { deleted_at: null } })
          .then((n) => db.priceLabor.count({ where: { deleted_at: null } }).then((m) => n + m)),
        db.unit.count({ where: { status: "ACTIVE" } }),
        db.category.count({ where: { status: "ACTIVE" } }),
        db.deletionRequest.count({ where: { status: "PENDING" } }),
      ]);
      return { brands, vendors, skus, materialPrices, workPrices, units, categories, deletionRequests };
    },

    // ── Unit Dictionary ─────────────────────────────────────────────────────

    async listUnits(input: { grants: PermissionGrants; search?: string; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view units.");
      const search = input.search?.trim();
      return db.unit.findMany({
        where: {
          ...(input.includeArchived ? {} : { status: "ACTIVE" }),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { code: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          archived_at: true,
          _count: {
            select: {
              base_skus: true,
              purchase_skus: true,
              dimension_skus: true,
              material_prices: true,
              material_labor_prices: true,
              labor_prices: true,
            },
          },
        },
      });
    },

    async getUnit(input: { grants: PermissionGrants; unitId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view units.");
      return db.unit.findUniqueOrThrow({
        where: { id: input.unitId },
        include: {
          _count: {
            select: {
              base_skus: true,
              purchase_skus: true,
              dimension_skus: true,
              material_prices: true,
              material_labor_prices: true,
              labor_prices: true,
            },
          },
        },
      });
    },

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

    async updateUnit(input: { grants: PermissionGrants; actor: AuditActor; unitId: string; code: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "UNIT_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "UNIT_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        const existing = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) changes.name = { from: existing.name, to: name };
        if (existing.code !== code) {
          throw new AppError("CONFLICT", "UNIT_CODE_IMMUTABLE", "Unit code is fixed after creation.");
        }

        if (Object.keys(changes).length === 0) return { unitId: input.unitId };

        try {
          await tx.unit.update({ where: { id: input.unitId }, data: { name } });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, { action: "unit.updated", entityType: "unit", entityId: input.unitId, actor: input.actor, changes });
        return { unitId: input.unitId };
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

        // Guard: reject if unit is actively used by prices or SKUs
        const [matPriceCount, matLaborCount, laborCount, skuCount] = await Promise.all([
          tx.priceMaterial.count({ where: { unit_id: input.unitId, deleted_at: null } }),
          tx.priceMaterialLabor.count({ where: { unit_id: input.unitId, deleted_at: null } }),
          tx.priceLabor.count({ where: { unit_id: input.unitId, deleted_at: null } }),
          tx.sku.count({ where: { OR: [{ base_unit_id: input.unitId }, { purchase_unit_id: input.unitId }, { dimension_unit_id: input.unitId }], deleted_at: null } }),
        ]);
        const inUseCount = matPriceCount + matLaborCount + laborCount + skuCount;
        if (inUseCount > 0) {
          throw new AppError("CONFLICT", "UNIT_IN_USE",
            `Unit is still referenced by ${inUseCount} active record(s) (prices or SKUs) and cannot be archived.`);
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

    // ── Category Dictionary ─────────────────────────────────────────────────

    async listCategories(input: {
      grants: PermissionGrants;
      search?: string;
      kind?: "PRODUCT" | "WORK";
      includeDeactivated?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view categories.");
      const search = input.search?.trim();
      return db.category.findMany({
        where: {
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.includeDeactivated ? {} : { status: "ACTIVE" }),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          kind: true,
          status: true,
          merged_into_id: true,
          merged_into: { select: { id: true, name: true } },
          _count: {
            select: {
              sku_categories: true,
              brand_categories: true,
              material_labor_prices: true,
              labor_prices: true,
            },
          },
        },
      });
    },

    async getCategory(input: { grants: PermissionGrants; categoryId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view categories.");
      return db.category.findUniqueOrThrow({
        where: { id: input.categoryId },
        include: {
          merged_into: { select: { id: true, name: true } },
          _count: {
            select: {
              sku_categories: true,
              brand_categories: true,
              material_labor_prices: true,
              labor_prices: true,
            },
          },
        },
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

    async updateCategory(input: { grants: PermissionGrants; actor: AuditActor; categoryId: string; name: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "CATEGORY_NAME_REQUIRED");
      const slug = requiredSlug(name);
      return runTransaction(async (tx) => {
        const existing = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) {
          changes.name = { from: existing.name, to: name };
          changes.slug = { from: existing.slug, to: slug };
        }
        if (Object.keys(changes).length === 0) return { categoryId: input.categoryId };

        try {
          await tx.category.update({ where: { id: input.categoryId }, data: { name, slug } });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, { action: "category.updated", entityType: "category", entityId: input.categoryId, actor: input.actor, changes });
        return { categoryId: input.categoryId };
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

        // Transfer SkuCategory rows
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
            await tx.brandCategoryOrigin.updateMany({
              where: { brand_category_id: sourceLink.id },
              data: { brand_category_id: existingTargetId },
            });
            await tx.brandCategory.delete({ where: { id: sourceLink.id } });
          } else {
            await tx.brandCategory.update({
              where: { id: sourceLink.id },
              data: { category_id: input.targetCategoryId },
            });
          }
        }

        // Transfer work prices if WORK category
        if (source.kind === "WORK") {
          await tx.priceMaterialLabor.updateMany({
            where: { category_id: input.sourceCategoryId },
            data: { category_id: input.targetCategoryId },
          });
          await tx.priceLabor.updateMany({
            where: { category_id: input.sourceCategoryId },
            data: { category_id: input.targetCategoryId },
          });
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

    // ── VendorType Dictionary ───────────────────────────────────────────────

    async listVendorTypes(input: { grants: PermissionGrants; includeArchived?: boolean }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view Supplier Types.");
      return db.vendorType.findMany({
        where: input.includeArchived ? {} : { deleted_at: null },
        orderBy: { sort_order: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          sort_order: true,
          can_supply_material: true,
          can_supply_labor: true,
          deleted_at: true,
          _count: { select: { vendor_types: true } },
        },
      });
    },

    async listVendorTypesForAssignment(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      return db.vendorType.findMany({
        where: { deleted_at: null },
        orderBy: { sort_order: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          sort_order: true,
          can_supply_material: true,
          can_supply_labor: true,
        },
      });
    },

    async getVendorType(input: { grants: PermissionGrants; vendorTypeId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.dictionaryRead, MASTERDATA_PERMISSIONS.dictionaryManage], "You do not have permission to view Supplier Types.");
      return db.vendorType.findUniqueOrThrow({
        where: { id: input.vendorTypeId },
        include: { _count: { select: { vendor_types: true } } },
      });
    },

    async createVendorType(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      code: string;
      name: string;
      canSupplyMaterial?: boolean;
      canSupplyLabor?: boolean;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const code = requiredName(input.code, "VENDOR_TYPE_CODE_REQUIRED").toUpperCase();
      const name = requiredName(input.name, "VENDOR_TYPE_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        let vt;
        try {
          vt = await tx.vendorType.create({
            data: {
              id: randomUUID(),
              code,
              name,
              can_supply_material: input.canSupplyMaterial ?? false,
              can_supply_labor: input.canSupplyLabor ?? false,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        await writeAudit(tx, {
          action: "vendor-type.created",
          entityType: "vendor_type",
          entityId: vt!.id,
          actor: input.actor,
          metadata: { code },
        });
        return { vendorTypeId: vt!.id };
      });
    },

    async updateVendorType(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      vendorTypeId: string;
      name: string;
      canSupplyMaterial: boolean;
      canSupplyLabor: boolean;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_TYPE_NAME_REQUIRED");
      return runTransaction(async (tx) => {
        const existing = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) changes.name = { from: existing.name, to: name };
        if (existing.can_supply_material !== input.canSupplyMaterial) {
          changes.can_supply_material = { from: existing.can_supply_material, to: input.canSupplyMaterial };
        }
        if (existing.can_supply_labor !== input.canSupplyLabor) {
          changes.can_supply_labor = { from: existing.can_supply_labor, to: input.canSupplyLabor };
        }
        if (Object.keys(changes).length === 0) return { vendorTypeId: input.vendorTypeId };

        // If turning off material capability, check affected live vendors
        if (existing.can_supply_material && !input.canSupplyMaterial) {
          const assignments = await tx.vendorVendorType.findMany({
            where: { vendor_type_id: input.vendorTypeId, vendor: { deleted_at: null } },
            select: { vendor_id: true },
          });
          for (const a of assignments) {
            const otherTypes = await tx.vendorVendorType.findMany({
              where: { vendor_id: a.vendor_id, vendor_type_id: { not: input.vendorTypeId }, vendor_type: { deleted_at: null } },
              include: { vendor_type: true },
            });
            if (!otherTypes.some((o) => o.vendor_type.can_supply_material)) {
              const priceCount = await tx.priceMaterial.count({ where: { supplier_vendor_id: a.vendor_id, deleted_at: null } });
              const supplierCount = await tx.brandSupplier.count({ where: { vendor_id: a.vendor_id } });
              if (priceCount > 0 || supplierCount > 0) {
                throw new AppError(
                  "CONFLICT",
                  "VENDOR_TYPE_MATERIAL_CAPABILITY_IN_USE",
                  "Cannot disable material capability while live Suppliers depend on this type for material pricing.",
                );
              }
            }
          }
        }

        // If turning off labor capability, check affected live vendors
        if (existing.can_supply_labor && !input.canSupplyLabor) {
          const assignments = await tx.vendorVendorType.findMany({
            where: { vendor_type_id: input.vendorTypeId, vendor: { deleted_at: null } },
            select: { vendor_id: true },
          });
          for (const a of assignments) {
            const otherTypes = await tx.vendorVendorType.findMany({
              where: { vendor_id: a.vendor_id, vendor_type_id: { not: input.vendorTypeId }, vendor_type: { deleted_at: null } },
              include: { vendor_type: true },
            });
            if (!otherTypes.some((o) => o.vendor_type.can_supply_labor)) {
              const mlCount = await tx.priceMaterialLabor.count({ where: { vendor_id: a.vendor_id, deleted_at: null } });
              const laborCount = await tx.priceLabor.count({ where: { vendor_id: a.vendor_id, deleted_at: null } });
              if (mlCount > 0 || laborCount > 0) {
                throw new AppError(
                  "CONFLICT",
                  "VENDOR_TYPE_LABOR_CAPABILITY_IN_USE",
                  "Cannot disable labor capability while live Suppliers depend on this type for labor pricing.",
                );
              }
            }
          }
        }

        try {
          await tx.vendorType.update({
            where: { id: input.vendorTypeId },
            data: {
              name,
              can_supply_material: input.canSupplyMaterial,
              can_supply_labor: input.canSupplyLabor,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }

        await writeAudit(tx, {
          action: "vendor-type.updated",
          entityType: "vendor_type",
          entityId: input.vendorTypeId,
          actor: input.actor,
          changes,
        });
        return { vendorTypeId: input.vendorTypeId };
      });
    },

    async archiveVendorType(input: { grants: PermissionGrants; actor: AuditActor; vendorTypeId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vt = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        if (vt.deleted_at !== null) {
          throw new AppError("CONFLICT", "VENDOR_TYPE_ALREADY_ARCHIVED", "Supplier Type is already archived.");
        }
        await addDirectCause(tx, "vendor_type", input.vendorTypeId);
        await tx.vendorType.update({ where: { id: input.vendorTypeId }, data: { deleted_at: new Date() } });
        await writeAudit(tx, { action: "vendor-type.archived", entityType: "vendor_type", entityId: input.vendorTypeId, actor: input.actor });
        return { vendorTypeId: input.vendorTypeId };
      });
    },

    async restoreVendorType(input: { grants: PermissionGrants; actor: AuditActor; vendorTypeId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vt = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        if (vt.deleted_at === null) {
          throw new AppError("CONFLICT", "VENDOR_TYPE_NOT_ARCHIVED", "Supplier Type is not archived.");
        }
        await removeDirectCause(tx, "vendor_type", input.vendorTypeId);
        await tx.vendorType.update({ where: { id: input.vendorTypeId }, data: { deleted_at: null } });
        await writeAudit(tx, { action: "vendor-type.restored", entityType: "vendor_type", entityId: input.vendorTypeId, actor: input.actor });
        return { vendorTypeId: input.vendorTypeId };
      });
    },

    async requestVendorTypeDeletion(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      vendorTypeId: string;
      reason?: string;
      notes?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.dictionaryManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vt = await tx.vendorType.findUniqueOrThrow({ where: { id: input.vendorTypeId } });
        if (vt.deleted_at === null) {
          throw new AppError("VALIDATION", "VENDOR_TYPE_NOT_ARCHIVED", "Only archived Supplier Types may be submitted for deletion.");
        }
        const requestId = await createDeletionRequest(tx, {
          targetType: "vendor_type",
          targetId: input.vendorTypeId,
          actor: input.actor,
          reason: input.reason,
          notes: input.notes,
        });
        await writeAudit(tx, {
          action: "vendor-type.deletion-requested",
          entityType: "vendor_type",
          entityId: input.vendorTypeId,
          actor: input.actor,
        });
        return { requestId };
      });
    },

    // ── Brand Management ────────────────────────────────────────────────────

    async listBrands(input: {
      grants: PermissionGrants;
      search?: string;
      categoryId?: string;
      hashtag?: string;
      ownerVendorId?: string;
      supplierVendorId?: string;
      includeArchived?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandRead, MASTERDATA_PERMISSIONS.brandManage], "You do not have permission to view brands.");
      const search = input.search?.trim();
      const hashtag = input.hashtag?.trim().toLowerCase().replace(/^#+/, "");

      const rows = await db.brand.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.ownerVendorId ? { owner_vendor_id: input.ownerVendorId } : {}),
          ...(input.supplierVendorId ? { suppliers: { some: { vendor_id: input.supplierVendorId } } } : {}),
          ...(input.categoryId ? { categories: { some: { category_id: input.categoryId } } } : {}),
          ...(hashtag ? { hashtags: { some: { normalized: hashtag } } } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                  { hashtags: { some: { label: { contains: search, mode: "insensitive" } } } },
                  { categories: { some: { category: { name: { contains: search, mode: "insensitive" } } } } },
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
          updated_at: true,
          deleted_at: true,
          owner_vendor: { select: { id: true, name: true } },
          categories: {
            select: {
              category: { select: { id: true, name: true, slug: true } },
              origins: { select: { kind: true } },
            },
          },
          hashtags: { select: { id: true, label: true, normalized: true } },
          links: { select: { id: true, kind: true, url: true, label: true } },
          suppliers: {
            select: {
              id: true,
              vendor: { select: { id: true, name: true } },
            },
          },
          _count: { select: { skus: true, suppliers: true, links: true, categories: true } },
        },
      });
      const actorLabels = await latestAuditActorLabels(db, "brand", rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, updated_by_label: actorLabels.get(row.id) ?? null }));
    },

    async listBrandsForVendorAssignment(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      return db.brand.findMany({
        where: { deleted_at: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
    },

    async listBrandDirectoryRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandRead, MASTERDATA_PERMISSIONS.brandManage], "You do not have permission to view brand references.");
      const [productCategories, ownerVendors, materialVendors] = await Promise.all([
        db.category.findMany({
          where: { status: "ACTIVE", kind: "PRODUCT" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.vendor.findMany({
          where: { deleted_at: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.vendor.findMany({
          where: {
            deleted_at: null,
            types: { some: { vendor_type: { can_supply_material: true, deleted_at: null } } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return { productCategories, ownerVendors, materialVendors };
    },

    async getBrand(input: { grants: PermissionGrants; brandId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.brandRead, MASTERDATA_PERMISSIONS.brandManage], "You do not have permission to view brands.");
      return db.brand.findUniqueOrThrow({
        where: { id: input.brandId },
        include: {
          owner_vendor: { select: { id: true, name: true, slug: true } },
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true, kind: true, status: true } },
              origins: true,
            },
          },
          hashtags: true,
          links: true,
          suppliers: {
            include: {
              vendor: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  deleted_at: true,
                  types: { select: { vendor_type: { select: { code: true, name: true } } } },
                },
              },
            },
          },
          contacts: {
            include: {
              vendor: { select: { id: true, name: true } },
            },
          },
          _count: { select: { skus: true } },
        },
      });
    },

    async createBrand(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      ownerVendorId?: string;
      notes?: string;
      categoryIds?: string[];
      hashtags?: string[];
      links?: Array<{ kind: string; url: string; label?: string }>;
      suppliers?: Array<{ vendorId: string; isAuthorized?: boolean; notes?: string | null }>;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);

      return runTransaction(async (tx) => {
        if (input.ownerVendorId) {
          const owner = await tx.vendor.findUniqueOrThrow({ where: { id: input.ownerVendorId } });
          if (owner.deleted_at !== null) throw new AppError("VALIDATION", "BRAND_OWNER_ARCHIVED", "Owner Supplier is archived.");
        }

        let brand;
        try {
          brand = await tx.brand.create({
            data: {
              id: randomUUID(),
              name,
              slug,
              owner_vendor_id: input.ownerVendorId || null,
              notes: input.notes?.trim() || null,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        const brandId = brand!.id;

        // Manual Categories
        if (input.categoryIds && input.categoryIds.length > 0) {
          await assertLiveProductCategories(tx, input.categoryIds);
          for (const categoryId of input.categoryIds) {
            const bc = await tx.brandCategory.create({
              data: { id: randomUUID(), brand_id: brandId, category_id: categoryId },
            });
            await tx.brandCategoryOrigin.create({
              data: {
                id: randomUUID(),
                brand_category_id: bc.id,
                kind: "MANUAL",
                actor_user_id: input.actor.userId,
                actor_label: input.actor.label,
              },
            });
          }
        }

        // Hashtags
        if (input.hashtags && input.hashtags.length > 0) {
          const normalizedTags = normalizeHashtags(input.hashtags);
          await tx.brandHashtag.createMany({
            data: normalizedTags.map((tag) => ({
              id: randomUUID(),
              brand_id: brandId,
              label: tag.label,
              normalized: tag.normalized,
            })),
          });
        }

        // Links
        if (input.links && input.links.length > 0) {
          await tx.brandLink.createMany({
            data: input.links.map((link) => ({
              id: randomUUID(),
              brand_id: brandId,
              kind: link.kind,
              url: link.url.trim(),
              label: link.label?.trim() || null,
            })),
          });
        }

        // Suppliers
        if (input.suppliers && input.suppliers.length > 0) {
          for (const s of input.suppliers) {
            await assertVendorMaterialCapable(tx, s.vendorId);
            await tx.brandSupplier.create({
              data: {
                id: randomUUID(),
                brand_id: brandId,
                vendor_id: s.vendorId,
                is_authorized: s.isAuthorized ?? false,
                notes: s.notes?.trim() || null,
              },
            });
          }
        }

        await writeAudit(tx, {
          action: "brand.created",
          entityType: "brand",
          entityId: brandId,
          actor: input.actor,
          metadata: { slug, owner_vendor_id: input.ownerVendorId ?? null },
        });
        return { brandId };
      });
    },

    async updateBrand(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      brandId: string;
      name: string;
      ownerVendorId?: string | null;
      notes?: string | null;
      categoryIds?: string[];
      hashtags?: string[];
      links?: Array<{ kind: string; url: string; label?: string }>;
      suppliers?: Array<{ vendorId: string; isAuthorized?: boolean; notes?: string | null }>;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.brandManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "BRAND_NAME_REQUIRED");
      const slug = requiredSlug(name);

      return runTransaction(async (tx) => {
        const existing = await tx.brand.findUniqueOrThrow({
          where: { id: input.brandId },
          include: {
            categories: { include: { origins: true } },
            hashtags: true,
            links: true,
            suppliers: true,
          },
        });

        if (input.ownerVendorId) {
          const owner = await tx.vendor.findUniqueOrThrow({ where: { id: input.ownerVendorId } });
          if (owner.deleted_at !== null) throw new AppError("VALIDATION", "BRAND_OWNER_ARCHIVED", "Owner Supplier is archived.");
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) {
          changes.name = { from: existing.name, to: name };
          changes.slug = { from: existing.slug, to: slug };
        }
        if ((existing.owner_vendor_id || null) !== (input.ownerVendorId || null)) {
          changes.owner_vendor_id = { from: existing.owner_vendor_id, to: input.ownerVendorId || null };
        }
        if ((existing.notes || null) !== (input.notes?.trim() || null)) {
          changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        }

        if (Object.keys(changes).length > 0) {
          try {
            await tx.brand.update({
              where: { id: input.brandId },
              data: {
                name,
                slug,
                owner_vendor_id: input.ownerVendorId || null,
                notes: input.notes?.trim() || null,
              },
            });
          } catch (error) {
            mapWriteError(error);
          }
        }

        // Update Categories with origin provenance
        if (input.categoryIds !== undefined) {
          await assertLiveProductCategories(tx, input.categoryIds);
          const requestedCategorySet = new Set(input.categoryIds);
          for (const categoryId of input.categoryIds) {
            const existingBc = existing.categories.find((bc) => bc.category_id === categoryId);
            if (!existingBc) {
              const createdBc = await tx.brandCategory.create({
                data: { id: randomUUID(), brand_id: input.brandId, category_id: categoryId },
              });
              await tx.brandCategoryOrigin.create({
                data: {
                  id: randomUUID(),
                  brand_category_id: createdBc.id,
                  kind: "MANUAL",
                  actor_user_id: input.actor.userId,
                  actor_label: input.actor.label,
                },
              });
            } else if (!existingBc.origins.some((o) => o.kind === "MANUAL")) {
              await tx.brandCategoryOrigin.create({
                data: {
                  id: randomUUID(),
                  brand_category_id: existingBc.id,
                  kind: "MANUAL",
                  actor_user_id: input.actor.userId,
                  actor_label: input.actor.label,
                },
              });
            }
          }
          for (const existingBc of existing.categories) {
            if (!requestedCategorySet.has(existingBc.category_id)) {
              await tx.brandCategoryOrigin.deleteMany({
                where: { brand_category_id: existingBc.id, kind: "MANUAL" },
              });
              const remainingOrigins = await tx.brandCategoryOrigin.count({
                where: { brand_category_id: existingBc.id },
              });
              if (remainingOrigins === 0) {
                await tx.brandCategory.delete({ where: { id: existingBc.id } });
              }
            }
          }
          const before = existing.categories
            .filter((bc) => bc.origins.some((origin) => origin.kind === "MANUAL"))
            .map((bc) => bc.category_id)
            .sort();
          const after = [...requestedCategorySet].sort();
          if (before.join("\u0000") !== after.join("\u0000")) {
            changes.categories = { from: before, to: after };
          }
        }

        // Update Hashtags — diffed on the normalized form so an unchanged tag
        // keeps its row instead of being recreated on every save.
        if (input.hashtags !== undefined) {
          const normalizedList = normalizeHashtags(input.hashtags);
          const desiredTags = new Map(normalizedList.map((tag) => [tag.normalized, tag] as const));
          const removedTags = existing.hashtags.filter((tag) => !desiredTags.has(tag.normalized));
          if (removedTags.length > 0) {
            await tx.brandHashtag.deleteMany({ where: { id: { in: removedTags.map((tag) => tag.id) } } });
          }
          for (const existingTag of existing.hashtags) {
            const wanted = desiredTags.get(existingTag.normalized);
            if (!wanted) continue;
            desiredTags.delete(existingTag.normalized);
            if (existingTag.label !== wanted.label) {
              await tx.brandHashtag.update({ where: { id: existingTag.id }, data: { label: wanted.label } });
            }
          }
          if (desiredTags.size > 0) {
            await tx.brandHashtag.createMany({
              data: [...desiredTags.values()].map((tag) => ({
                id: randomUUID(),
                brand_id: input.brandId,
                label: tag.label,
                normalized: tag.normalized,
              })),
            });
          }
          const before = existing.hashtags.map((tag) => tag.normalized).sort();
          const after = normalizedList.map((tag) => tag.normalized).sort();
          if (before.join("\u0000") !== after.join("\u0000")) {
            changes.hashtags = { from: before, to: after };
          }
        }

        // Update Links.
        // A BrandLink ID is referenced by PriceMaterial.source_link_id with
        // onDelete SetNull, so delete-and-recreate silently erased the price
        // provenance of every material price on any unrelated Brand edit.
        // Links are matched on their URL — their natural identity here — so an
        // unchanged link keeps its row and its ID.
        if (input.links !== undefined) {
          const desired = new Map(
            input.links
              .map((link) => ({ ...link, url: link.url.trim() }))
              .filter((link) => link.url.length > 0)
              .map((link) => [link.url, link] as const),
          );
          for (const existingLink of existing.links) {
            const wanted = desired.get(existingLink.url);
            if (!wanted) {
              await tx.brandLink.delete({ where: { id: existingLink.id } });
              continue;
            }
            desired.delete(existingLink.url);
            const nextLabel = wanted.label?.trim() || null;
            if (existingLink.kind !== wanted.kind || existingLink.label !== nextLabel) {
              await tx.brandLink.update({
                where: { id: existingLink.id },
                data: { kind: wanted.kind, label: nextLabel },
              });
            }
          }
          if (desired.size > 0) {
            await tx.brandLink.createMany({
              data: [...desired.values()].map((link) => ({
                id: randomUUID(),
                brand_id: input.brandId,
                kind: link.kind,
                url: link.url,
                label: link.label?.trim() || null,
              })),
            });
          }
          const before = existing.links.map((link) => link.url).sort();
          const after = input.links.map((link) => link.url.trim()).filter(Boolean).sort();
          if (before.join("\u0000") !== after.join("\u0000")) {
            changes.links = { from: before, to: after };
          }
        }

        // Update Suppliers — diffed on vendor ID so an unchanged relation keeps
        // its row, its created_at, and its place in the archive-cause graph.
        if (input.suppliers !== undefined) {
          const desiredSuppliers = new Map(input.suppliers.map((s) => [s.vendorId, s] as const));
          const removedSuppliers = existing.suppliers.filter((s) => !desiredSuppliers.has(s.vendor_id));
          if (removedSuppliers.length > 0) {
            await tx.brandSupplier.deleteMany({ where: { id: { in: removedSuppliers.map((s) => s.id) } } });
          }
          for (const existingSupplier of existing.suppliers) {
            const wanted = desiredSuppliers.get(existingSupplier.vendor_id);
            if (!wanted) continue;
            desiredSuppliers.delete(existingSupplier.vendor_id);
            const isAuthorized = wanted.isAuthorized ?? false;
            const supplierNotes = wanted.notes?.trim() || null;
            if (existingSupplier.is_authorized !== isAuthorized || existingSupplier.notes !== supplierNotes) {
              await tx.brandSupplier.update({
                where: { id: existingSupplier.id },
                data: { is_authorized: isAuthorized, notes: supplierNotes },
              });
            }
          }
          for (const s of desiredSuppliers.values()) {
            await assertVendorMaterialCapable(tx, s.vendorId);
            await tx.brandSupplier.create({
              data: {
                id: randomUUID(),
                brand_id: input.brandId,
                vendor_id: s.vendorId,
                is_authorized: s.isAuthorized ?? false,
                notes: s.notes?.trim() || null,
              },
            });
          }
          const before = existing.suppliers.map((s) => s.vendor_id).sort();
          const after = input.suppliers.map((s) => s.vendorId).sort();
          if (before.join("\u0000") !== after.join("\u0000")) {
            changes.suppliers = { from: before, to: after };
          }
        }

        // CORE.md §5 / brand-contract: one real operation, one audit event.
        // A save that changed nothing is not a real operation.
        if (Object.keys(changes).length > 0) {
          await writeAudit(tx, {
            action: "brand.updated",
            entityType: "brand",
            entityId: input.brandId,
            actor: input.actor,
            changes,
          });
        }
        return { brandId: input.brandId };
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

        await addDirectCause(tx, "brand", input.brandId);
        await tx.brand.update({ where: { id: input.brandId }, data: { deleted_at: now } });
        const skuIds = await tx.sku.findMany({ where: { brand_id: input.brandId }, select: { id: true } }).then((rows) => rows.map((row) => row.id));
        await addParentCauses(tx, "sku", "brand", input.brandId, skuIds);
        if (skuIds.length > 0) {
          await tx.sku.updateMany({ where: { id: { in: skuIds } }, data: { deleted_at: now } });
          const prices = await tx.priceMaterial.findMany({ where: { sku_id: { in: skuIds } }, select: { id: true, sku_id: true } });
          for (const skuId of skuIds) await addParentCauses(tx, "price_material", "sku", skuId, prices.filter((price) => price.sku_id === skuId).map((price) => price.id));
          if (prices.length > 0) await tx.priceMaterial.updateMany({ where: { id: { in: prices.map((price) => price.id) } }, data: { deleted_at: now } });
        }
        await writeAudit(tx, {
          action: "brand.archived",
          entityType: "brand",
          entityId: input.brandId,
          actor: input.actor,
          metadata: { skus_archived: skuIds.length },
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
        if (ownerVendor?.deleted_at) throw new AppError("CONFLICT", "BRAND_OWNER_ARCHIVED", "Brand owner Supplier is archived.");
        if (categoryRelations.some((row) => row.category.status !== "ACTIVE" || row.category.kind !== "PRODUCT")) {
          throw new AppError("CONFLICT", "BRAND_CATEGORY_INACTIVE", "Brand has an invalid or inactive Category relation.");
        }
        for (const relation of supplierRelations) await assertVendorMaterialCapable(tx, relation.vendor_id);

        await removeDirectCause(tx, "brand", input.brandId);
        await tx.brand.update({ where: { id: input.brandId }, data: { deleted_at: null } });

        const restoredSkuIds = await removeParentCausesAndFindRestored(tx, "sku", "brand", input.brandId);
        let priceCount = 0;
        if (restoredSkuIds.length > 0) {
          for (const skuId of restoredSkuIds) await assertSkuRestorable(tx, skuId);
          await tx.sku.updateMany({ where: { id: { in: restoredSkuIds } }, data: { deleted_at: null } });

        }
        for (const skuId of restoredSkuIds) {
          const restoredPriceIds = await removeParentCausesAndFindRestored(tx, "price_material", "sku", skuId);
          if (restoredPriceIds.length > 0) {
            for (const priceId of restoredPriceIds) await assertPriceMaterialRestorable(tx, priceId);
            await tx.priceMaterial.updateMany({ where: { id: { in: restoredPriceIds } }, data: { deleted_at: null } });
            priceCount += restoredPriceIds.length;
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

    // ── Vendor Management ───────────────────────────────────────────────────

    async listVendors(input: {
      grants: PermissionGrants;
      search?: string;
      vendorTypeId?: string;
      canSupplyMaterial?: boolean;
      canSupplyLabor?: boolean;
      brandId?: string;
      includeArchived?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.vendorRead, MASTERDATA_PERMISSIONS.vendorManage], "You do not have permission to view Suppliers.");
      const search = input.search?.trim();

      const rows = await db.vendor.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.brandId ? { brand_suppliers: { some: { brand_id: input.brandId } } } : {}),
          ...(input.vendorTypeId ? { types: { some: { vendor_type_id: input.vendorTypeId } } } : {}),
          ...(input.canSupplyMaterial !== undefined
            ? { types: { some: { vendor_type: { can_supply_material: input.canSupplyMaterial, deleted_at: null } } } }
            : {}),
          ...(input.canSupplyLabor !== undefined
            ? { types: { some: { vendor_type: { can_supply_labor: input.canSupplyLabor, deleted_at: null } } } }
            : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { legal_name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                  { contacts: { some: { person_name: { contains: search, mode: "insensitive" } } } },
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
          address: true,
          notes: true,
          info_links: true,
          link_review_snapshot: true,
          updated_at: true,
          deleted_at: true,
          types: {
            select: {
              vendor_type: {
                select: { id: true, code: true, name: true, can_supply_material: true, can_supply_labor: true },
              },
            },
          },
          contacts: {
            select: {
              id: true,
              person_name: true,
              job_title: true,
              email: true,
              phone: true,
              is_primary: true,
              brand_id: true,
              notes: true,
            },
          },
          brand_suppliers: {
            select: {
              id: true,
              is_authorized: true,
              notes: true,
              brand: { select: { id: true, name: true } },
            },
            orderBy: { brand: { name: "asc" } },
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
      const actorLabels = await latestAuditActorLabels(db, "vendor", rows.map((row) => row.id));
      return rows.map((row) => ({ ...row, updated_by_label: actorLabels.get(row.id) ?? null }));
    },

    async listSkuDirectoryRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.skuRead, MASTERDATA_PERMISSIONS.skuManage], "You do not have permission to view SKU references.");
      const [brands, units, productCategories, materialVendors] = await Promise.all([
        db.brand.findMany({
          where: { deleted_at: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.unit.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ name: "asc" }, { code: "asc" }],
          select: { id: true, code: true, name: true },
        }),
        db.category.findMany({
          where: { status: "ACTIVE", kind: "PRODUCT" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.vendor.findMany({
          where: {
            deleted_at: null,
            types: { some: { vendor_type: { can_supply_material: true, deleted_at: null } } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return { brands, units, productCategories, materialVendors };
    },

    async listPricingMaterialRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material price references.");
      const [skus, brands, units, productCategories, vendors] = await Promise.all([
        db.sku.findMany({
          where: { deleted_at: null },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
            brand: { select: { id: true, name: true } },
            base_unit: { select: { id: true, code: true, name: true } },
            purchase_unit: { select: { id: true, code: true, name: true } },
            dimension_length: true,
            dimension_width: true,
            dimension_thickness: true,
            dimension_unit: { select: { id: true, code: true, name: true } },
            purchase_to_base_factor: true,
          },
        }),
        db.brand.findMany({
          where: { deleted_at: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.unit.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ name: "asc" }, { code: "asc" }],
          select: { id: true, code: true, name: true },
        }),
        db.category.findMany({
          where: { status: "ACTIVE", kind: "PRODUCT" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.vendor.findMany({
          where: {
            deleted_at: null,
            types: { some: { vendor_type: { can_supply_material: true, deleted_at: null } } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);
      return { skus, brands, units, productCategories, vendors };
    },

    async listPricingWorkRefs(input: { grants: PermissionGrants }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view work price references.");
      const [workCategories, vendors, units] = await Promise.all([
        db.category.findMany({
          where: { status: "ACTIVE", kind: "WORK" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.vendor.findMany({
          where: {
            deleted_at: null,
            types: { some: { vendor_type: { can_supply_labor: true, deleted_at: null } } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        db.unit.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ name: "asc" }, { code: "asc" }],
          select: { id: true, code: true, name: true },
        }),
      ]);
      return { workCategories, vendors, units };
    },

    async getVendor(input: { grants: PermissionGrants; vendorId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.vendorRead, MASTERDATA_PERMISSIONS.vendorManage], "You do not have permission to view Suppliers.");
      return db.vendor.findUniqueOrThrow({
        where: { id: input.vendorId },
        include: {
          types: {
            include: {
              vendor_type: true,
            },
          },
          contacts: {
            include: {
              brand: { select: { id: true, name: true, slug: true } },
            },
          },
          owned_brands: { select: { id: true, name: true, slug: true } },
          brand_suppliers: {
            include: {
              brand: { select: { id: true, name: true, slug: true, deleted_at: true } },
            },
          },
          _count: {
            select: {
              material_prices: true,
              material_labor_prices: true,
              labor_prices: true,
            },
          },
        },
      });
    },

    async createVendor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      legalName?: string;
      address?: string;
      notes?: string;
      vendorTypeIds?: string[];
      contacts?: Array<{ personName: string; jobTitle?: string; email?: string; phone?: string; isPrimary?: boolean; notes?: string; brandId?: string }>;
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
              address: input.address?.trim() || null,
              notes: input.notes?.trim() || null,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        const vendorId = vendor!.id;

        // VendorTypes
        if (input.vendorTypeIds && input.vendorTypeIds.length > 0) {
          const vendorTypes = await tx.vendorType.findMany({
            where: { id: { in: input.vendorTypeIds }, deleted_at: null },
            select: { id: true },
          });
          if (vendorTypes.length !== new Set(input.vendorTypeIds).size) {
            throw new AppError("VALIDATION", "VENDOR_TYPE_INVALID", "Every selected Supplier Type must be active.");
          }
          await tx.vendorVendorType.createMany({
            data: input.vendorTypeIds.map((vendorTypeId) => ({
              id: randomUUID(),
              vendor_id: vendorId,
              vendor_type_id: vendorTypeId,
            })),
          });
        }

        // Contacts
        if (input.contacts && input.contacts.length > 0) {
          for (const c of input.contacts) {
            if (c.brandId) {
              const brand = await tx.brand.findUniqueOrThrow({ where: { id: c.brandId } });
              if (brand.deleted_at !== null) throw new AppError("VALIDATION", "CONTACT_BRAND_ARCHIVED", "Brand is archived.");
              // vendor-contract §4: vendor must own or supply the brand
              const ownsViaBrand = brand.owner_vendor_id === vendorId;
              if (!ownsViaBrand) {
                const existingSupplier = await tx.brandSupplier.findFirst({ where: { brand_id: c.brandId, vendor_id: vendorId } });
                if (!existingSupplier) throw new AppError("VALIDATION", "CONTACT_BRAND_NOT_RELATED", "Supplier must own or supply this Brand to assign a Brand-scoped contact.");
              }
            }
            await tx.vendorContact.create({
              data: {
                id: randomUUID(),
                vendor_id: vendorId,
                person_name: requiredName(c.personName, "CONTACT_NAME_REQUIRED"),
                job_title: c.jobTitle?.trim() || null,
                email: c.email?.trim() || null,
                phone: c.phone?.trim() || null,
                is_primary: c.isPrimary ?? false,
                notes: c.notes?.trim() || null,
                brand_id: c.brandId || null,
              },
            });
          }
        }


        await writeAudit(tx, {
          action: "vendor.created",
          entityType: "vendor",
          entityId: vendorId,
          actor: input.actor,
          metadata: { slug },
        });
        return { vendorId };
      });
    },

    async createPricingVendorQuick(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name: string;
      vendorTypeId: string;
      capability: "MATERIAL" | "LABOR";
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);

      return runTransaction(async (tx) => {
        const vendorType = await tx.vendorType.findUnique({ where: { id: input.vendorTypeId } });
        if (!vendorType || vendorType.deleted_at !== null) {
          throw new AppError("VALIDATION", "VENDOR_TYPE_INVALID", "Choose an active Supplier Type.");
        }
        const capable = input.capability === "MATERIAL"
          ? vendorType.can_supply_material
          : vendorType.can_supply_labor;
        if (!capable) {
          throw new AppError(
            "VALIDATION",
            "VENDOR_TYPE_CAPABILITY_REQUIRED",
            input.capability === "MATERIAL"
              ? "Choose a Supplier Type that can supply material."
              : "Choose a Supplier Type that can provide labor.",
          );
        }

        let vendor;
        try {
          vendor = await tx.vendor.create({
            data: { id: randomUUID(), name, slug, legal_name: null, address: null, notes: null },
          });
          await tx.vendorVendorType.create({
            data: { id: randomUUID(), vendor_id: vendor.id, vendor_type_id: vendorType.id },
          });
        } catch (error) {
          mapWriteError(error);
        }

        await writeAudit(tx, {
          action: "vendor.created",
          entityType: "vendor",
          entityId: vendor!.id,
          actor: input.actor,
          metadata: { slug, quick_entry: "pricing", vendor_type_id: vendorType.id, capability: input.capability },
        });
        return { vendorId: vendor!.id };
      });
    },

    async updateVendor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      vendorId: string;
      name: string;
      legalName?: string | null;
      address?: string | null;
      notes?: string | null;
      vendorTypeIds?: string[];
      contacts?: Array<{ id?: string; personName: string; jobTitle?: string; email?: string; phone?: string; isPrimary?: boolean; notes?: string; brandId?: string }>;
      /** vendor-contract §5: atomic info_links update; omit = preserve existing */
      infoLinks?: Array<{ kind: string; url: string; label?: string | null }>;
      /** Remaining snapshot after local review resolution; omit = preserve existing */
      linkReviewSnapshot?: unknown[];
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "VENDOR_NAME_REQUIRED");
      const slug = requiredSlug(name);

      return runTransaction(async (tx) => {
        const existing = await tx.vendor.findUniqueOrThrow({
          where: { id: input.vendorId },
          include: {
            types: true,
            contacts: true,
          },
        });

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) {
          changes.name = { from: existing.name, to: name };
          changes.slug = { from: existing.slug, to: slug };
        }
        if ((existing.legal_name || null) !== (input.legalName?.trim() || null)) {
          changes.legal_name = { from: existing.legal_name, to: input.legalName?.trim() || null };
        }
        if ((existing.address || null) !== (input.address?.trim() || null)) {
          changes.address = { from: existing.address, to: input.address?.trim() || null };
        }
        if ((existing.notes || null) !== (input.notes?.trim() || null)) {
          changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        }

        if (Object.keys(changes).length > 0) {
          try {
            await tx.vendor.update({
              where: { id: input.vendorId },
              data: {
                name,
                slug,
                legal_name: input.legalName?.trim() || null,
                address: input.address?.trim() || null,
                notes: input.notes?.trim() || null,
              },
            });
          } catch (error) {
            mapWriteError(error);
          }
        }

        // Update VendorTypes with capability-integrity guard.
        // createVendor rejects an archived VendorType; the update path did not,
        // so an archived type could be assigned here.
        if (input.vendorTypeIds !== undefined) {
          const requestedTypeIds = [...new Set(input.vendorTypeIds)];
          if (requestedTypeIds.length > 0) {
            const liveTypes = await tx.vendorType.findMany({
              where: { id: { in: requestedTypeIds }, deleted_at: null },
              select: { id: true },
            });
            if (liveTypes.length !== requestedTypeIds.length) {
              throw new AppError("VALIDATION", "VENDOR_TYPE_INVALID", "Every selected Supplier Type must be active.");
            }
          }
          await assertVendorTypeRemovalSafe(tx, input.vendorId, requestedTypeIds);

          const existingTypeIds = new Set(existing.types.map((t) => t.vendor_type_id));
          const removedTypes = existing.types.filter((t) => !requestedTypeIds.includes(t.vendor_type_id));
          if (removedTypes.length > 0) {
            await tx.vendorVendorType.deleteMany({ where: { id: { in: removedTypes.map((t) => t.id) } } });
          }
          const addedTypeIds = requestedTypeIds.filter((id) => !existingTypeIds.has(id));
          if (addedTypeIds.length > 0) {
            await tx.vendorVendorType.createMany({
              data: addedTypeIds.map((vendorTypeId) => ({
                id: randomUUID(),
                vendor_id: input.vendorId,
                vendor_type_id: vendorTypeId,
              })),
            });
          }
          if (removedTypes.length > 0 || addedTypeIds.length > 0) {
            changes.vendor_types = {
              from: [...existingTypeIds].sort(),
              to: [...requestedTypeIds].sort(),
            };
          }
        }

        // Update Contacts — an incoming contact that carries an ID updates that
        // row; the rest are created. Contacts the caller no longer lists are
        // removed. The previous delete-and-recreate discarded every row's
        // created_at even when nothing about the contact changed.
        if (input.contacts !== undefined) {
          const keptContactIds = new Set(
            input.contacts.map((c) => c.id).filter((id): id is string => Boolean(id)),
          );
          const removedContacts = existing.contacts.filter((c) => !keptContactIds.has(c.id));
          if (removedContacts.length > 0) {
            await tx.vendorContact.deleteMany({ where: { id: { in: removedContacts.map((c) => c.id) } } });
          }
          const existingContactById = new Map(existing.contacts.map((c) => [c.id, c] as const));
          let contactFieldChanged = false;
          for (const c of input.contacts) {
            if (c.brandId) {
              const brand = await tx.brand.findUniqueOrThrow({ where: { id: c.brandId } });
              if (brand.deleted_at !== null) throw new AppError("VALIDATION", "CONTACT_BRAND_ARCHIVED", "Brand is archived.");
              // vendor-contract §4: vendor must own or supply the brand
              const ownsViaBrand = brand.owner_vendor_id === input.vendorId;
              if (!ownsViaBrand) {
                const existingSupplier = await tx.brandSupplier.findFirst({ where: { brand_id: c.brandId, vendor_id: input.vendorId } });
                if (!existingSupplier) throw new AppError("VALIDATION", "CONTACT_BRAND_NOT_RELATED", "Supplier must own or supply this Brand to assign a Brand-scoped contact.");
              }
            }
            const contactData = {
              person_name: requiredName(c.personName, "CONTACT_NAME_REQUIRED"),
              job_title: c.jobTitle?.trim() || null,
              email: c.email?.trim() || null,
              phone: c.phone?.trim() || null,
              is_primary: c.isPrimary ?? false,
              notes: c.notes?.trim() || null,
              brand_id: c.brandId || null,
            };
            if (c.id && existingContactById.has(c.id)) {
              const ex = existingContactById.get(c.id)!;
              const contactChanged =
                ex.person_name !== contactData.person_name ||
                (ex.job_title || null) !== contactData.job_title ||
                (ex.email || null) !== contactData.email ||
                (ex.phone || null) !== contactData.phone ||
                ex.is_primary !== contactData.is_primary ||
                (ex.notes || null) !== contactData.notes ||
                (ex.brand_id || null) !== contactData.brand_id;
              if (contactChanged) {
                await tx.vendorContact.update({ where: { id: c.id }, data: contactData });
                contactFieldChanged = true;
              }
            } else {
              await tx.vendorContact.create({
                data: { id: c.id || randomUUID(), vendor_id: input.vendorId, ...contactData },
              });
            }
          }
          const beforeContactIds = existing.contacts.map((c) => c.id).sort();
          const afterContactIds = input.contacts.map((c, index) => c.id ?? `new:${index}`).sort();
          const contactIdsChanged = beforeContactIds.join("\u0000") !== afterContactIds.join("\u0000");
          if (contactIdsChanged || contactFieldChanged) {
            changes.contacts = { from: existing.contacts.length, to: input.contacts.length };
          }
        }

        // vendor-contract §5: info_links + link_review_snapshot — atomic with vendor update.
        if (input.infoLinks !== undefined) {
          const ALLOWED_INFO_LINK_KINDS = new Set([
            "WEBSITE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "WHATSAPP",
          ]);
          const INFO_LINKS_MAX_COUNT = 20;
          const INFO_LINK_URL_MAX_LEN = 2048;
          const INFO_LINK_LABEL_MAX_LEN = 200;
          if (input.infoLinks.length > INFO_LINKS_MAX_COUNT) {
            throw new AppError("VALIDATION", "INFO_LINKS_TOO_MANY", `Maximum ${INFO_LINKS_MAX_COUNT} links allowed.`);
          }
          const normalizedLinks: Array<{ kind: string; url: string; label: string | null }> = [];
          const seenUrls = new Set<string>();
          for (const l of input.infoLinks) {
            const kind = l.kind.trim().toUpperCase();
            const url = l.url.trim();
            const label = l.label?.trim() || null;
            if (!ALLOWED_INFO_LINK_KINDS.has(kind)) {
              throw new AppError("VALIDATION", "INFO_LINK_KIND_INVALID", `Link kind "${kind}" is not allowed.`);
            }
            if (!/^https?:\/\//i.test(url)) {
              throw new AppError("VALIDATION", "INFO_LINK_URL_NOT_HTTP", "Links must use HTTP or HTTPS.");
            }
            try { new URL(url); } catch {
              throw new AppError("VALIDATION", "INFO_LINK_URL_INVALID", "Each link must have a valid URL.");
            }
            if (url.length > INFO_LINK_URL_MAX_LEN) {
              throw new AppError("VALIDATION", "INFO_LINK_URL_TOO_LONG", `URL exceeds ${INFO_LINK_URL_MAX_LEN} characters.`);
            }
            if (label && label.length > INFO_LINK_LABEL_MAX_LEN) {
              throw new AppError("VALIDATION", "INFO_LINK_LABEL_TOO_LONG", `Label exceeds ${INFO_LINK_LABEL_MAX_LEN} characters.`);
            }
            if (seenUrls.has(url)) continue;
            seenUrls.add(url);
            normalizedLinks.push({ kind, url, label });
          }
          // No-op detection: only write + audit when content actually changed.
          const existingLinks = Array.isArray(existing.info_links)
            ? (existing.info_links as Array<Record<string, unknown>>).map((l) => ({
                kind: String(l["kind"] ?? ""),
                url: String(l["url"] ?? ""),
                label: l["label"] != null ? String(l["label"]) : null,
              }))
            : [];
          const linksChanged = JSON.stringify(existingLinks) !== JSON.stringify(normalizedLinks);

          let snapshotChanged = false;
          if (input.linkReviewSnapshot !== undefined) {
            const existingSnapshot = Array.isArray(existing.link_review_snapshot)
              ? existing.link_review_snapshot
              : [];
            snapshotChanged = JSON.stringify(existingSnapshot) !== JSON.stringify(input.linkReviewSnapshot);
          }

          if (linksChanged || snapshotChanged) {
            await tx.vendor.update({
              where: { id: input.vendorId },
              data: {
                ...(linksChanged ? { info_links: normalizedLinks as Prisma.InputJsonValue } : {}),
                ...(snapshotChanged ? { link_review_snapshot: input.linkReviewSnapshot as Prisma.InputJsonValue } : {}),
              },
            });
            if (linksChanged) {
              changes.info_links = { from: `${existingLinks.length} links`, to: `${normalizedLinks.length} links` };
            }
            if (snapshotChanged) {
              const prevLen = Array.isArray(existing.link_review_snapshot)
                ? (existing.link_review_snapshot as unknown[]).length
                : 0;
              const nextLen = (input.linkReviewSnapshot as unknown[]).length;
              changes.link_review_snapshot = {
                from: prevLen > 0 ? `${prevLen} pending` : "none",
                to: nextLen === 0 ? "cleared" : `${nextLen} pending`,
              };
            }
          }
        }

        // CORE.md §5 / vendor-contract §8: one real operation, one audit event.
        if (Object.keys(changes).length > 0) {
          await writeAudit(tx, {
            action: "vendor.updated",
            entityType: "vendor",
            entityId: input.vendorId,
            actor: input.actor,
            changes,
          });
        }
        return { vendorId: input.vendorId };
      });
    },

    async archiveVendor(input: { grants: PermissionGrants; actor: AuditActor; vendorId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.vendorManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) {
          throw new AppError("CONFLICT", "VENDOR_ALREADY_ARCHIVED", "Supplier is already archived.");
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
          throw new AppError("CONFLICT", "VENDOR_NOT_ARCHIVED", "Supplier is not archived.");
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
        if (identityConflict) throw new AppError("CONFLICT", "VENDOR_IDENTITY_CONFLICT", "A live Supplier already uses this identity.");
        if (typeRelations.some((row) => row.vendor_type.deleted_at !== null)) {
          throw new AppError("CONFLICT", "VENDOR_TYPE_ARCHIVED", "Supplier has an archived Supplier Type assignment.");
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
          throw new AppError("VALIDATION", "VENDOR_NOT_ARCHIVED", "Only archived Suppliers may be submitted for deletion.");
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

    // ── SKU Management ──────────────────────────────────────────────────────

    async listSkus(input: {
      grants: PermissionGrants;
      search?: string;
      brandId?: string;
      categoryId?: string;
      includeArchived?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.skuRead, MASTERDATA_PERMISSIONS.skuManage], "You do not have permission to view SKUs.");
      const search = input.search?.trim();

      return db.sku.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.brandId ? { brand_id: input.brandId } : {}),
          ...(input.categoryId ? { categories: { some: { category_id: input.categoryId } } } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                  { code: { contains: search, mode: "insensitive" } },
                  { brand: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          code: true,
          notes: true,
          deleted_at: true,
          brand: { select: { id: true, name: true, slug: true } },
          base_unit: { select: { id: true, code: true, name: true } },
          purchase_unit: { select: { id: true, code: true, name: true } },
          dimension_length: true,
          dimension_width: true,
          dimension_thickness: true,
          dimension_unit: { select: { id: true, code: true, name: true } },
          purchase_to_base_factor: true,
          categories: {
            select: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          material_prices: {
            where: { deleted_at: null },
            select: {
              id: true,
              amount: true,
              currency: true,
              supplier_vendor: { select: { id: true, name: true } },
              unit: { select: { id: true, code: true, name: true } },
            },
          },
          _count: { select: { material_prices: true } },
        },
      });
    },

    async getSku(input: { grants: PermissionGrants; skuId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.skuRead, MASTERDATA_PERMISSIONS.skuManage], "You do not have permission to view SKUs.");
      return db.sku.findUniqueOrThrow({
        where: { id: input.skuId },
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          base_unit: { select: { id: true, code: true, name: true } },
          purchase_unit: { select: { id: true, code: true, name: true } },
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true, kind: true } },
            },
          },
          material_prices: {
            include: {
              supplier_vendor: { select: { id: true, name: true, slug: true } },
              unit: { select: { id: true, code: true, name: true } },
              source_link: true,
            },
          },
        },
      });
    },

    async createSku(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      name?: string | null;
      code?: string | null;
      notes?: string;
      brandId?: string | null;
      baseUnitId: string;
      purchaseUnitId?: string;
      dimensionLength?: string;
      dimensionWidth?: string;
      dimensionThickness?: string;
      dimensionUnitId?: string;
      categoryId: string;
      priceMaterials: Array<{
        supplierVendorId: string;
        amount: string;
        currency: string;
        notes?: string;
      }>;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      const identity = resolveSkuIdentity(input.name, input.code);
      if (!input.categoryId) {
        throw new AppError("VALIDATION", "SKU_CATEGORY_REQUIRED", "At least one category is required.");
      }
      if (!input.priceMaterials || input.priceMaterials.length === 0) {
        throw new AppError("VALIDATION", "SKU_PRICE_REQUIRED", "At least one material price is required.");
      }
      const categoryIds = [input.categoryId];
      const supplierIds = input.priceMaterials.map((price) => price.supplierVendorId);
      if (new Set(supplierIds).size !== supplierIds.length) {
        throw new AppError("VALIDATION", "SKU_PRICE_VENDOR_DUPLICATE", "Only one initial price is allowed per Supplier.");
      }

      return runTransaction(async (tx) => {
        const baseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } });
        if (baseUnit.status !== "ACTIVE") {
          throw new AppError("VALIDATION", "SKU_BASE_UNIT_INACTIVE", "Base unit must be active.");
        }
        let purchaseUnit = null;
        if (input.purchaseUnitId) {
          purchaseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.purchaseUnitId } });
          if (purchaseUnit.status !== "ACTIVE") {
            throw new AppError("VALIDATION", "SKU_PURCHASE_UNIT_INACTIVE", "Purchase unit must be active.");
          }
        }
        const measurement = await resolveSkuMeasurement(tx, input, baseUnit, purchaseUnit);

        const categories = await tx.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, kind: true, status: true },
        });
        if (categories.length !== categoryIds.length) {
          throw new AppError("VALIDATION", "SKU_CATEGORY_NOT_FOUND", "One or more categories not found.");
        }
        for (const cat of categories) {
          if (cat.status !== "ACTIVE") {
            throw new AppError("VALIDATION", "SKU_CATEGORY_INACTIVE", `Category ${cat.id} is not active.`);
          }
          if (cat.kind !== "PRODUCT") {
            throw new AppError("VALIDATION", "SKU_CATEGORY_KIND_INVALID", "SKU categories must be PRODUCT categories.");
          }
        }

        const brand = input.brandId ? await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } }) : null;
        if (brand?.deleted_at) {
          throw new AppError("VALIDATION", "SKU_BRAND_ARCHIVED", "Brand is archived.");
        }

        const priceUnitId = input.purchaseUnitId ?? input.baseUnitId;
        for (const pm of input.priceMaterials) {
          requiredCurrency(pm.currency);
          requiredAmount(pm.amount);
          const supplier = await tx.vendor.findUniqueOrThrow({ where: { id: pm.supplierVendorId } });
          if (supplier.deleted_at !== null) {
            throw new AppError("VALIDATION", "PRICE_VENDOR_ARCHIVED", "Supplier is archived.");
          }
          await assertVendorMaterialCapable(tx, pm.supplierVendorId);
        }

        let sku;
        try {
          sku = await tx.sku.create({
            data: {
              id: randomUUID(),
              name: identity.name,
              slug: identity.slug,
              code: identity.code,
              notes: input.notes?.trim() || null,
              brand_id: input.brandId || null,
              base_unit_id: input.baseUnitId,
              purchase_unit_id: input.purchaseUnitId ?? null,
              ...measurement,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }
        const skuId = sku!.id;

        await tx.skuCategory.createMany({
          data: categoryIds.map((categoryId) => ({ id: randomUUID(), sku_id: skuId, category_id: categoryId })),
        });

        // Brand Category SKU enrichment
        const productCategoryIds = categories.filter((c) => c.kind === "PRODUCT").map((c) => c.id);
        for (const catId of input.brandId ? productCategoryIds : []) {
          let bc = await tx.brandCategory.findUnique({
            where: { brand_id_category_id: { brand_id: input.brandId!, category_id: catId } },
          });
          if (!bc) {
            bc = await tx.brandCategory.create({
              data: { id: randomUUID(), brand_id: input.brandId!, category_id: catId },
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
            slug: identity.slug,
            brand_id: input.brandId,
            categories: categoryIds.length,
            prices: input.priceMaterials.length,
            purchase_to_base_factor: measurement.purchase_to_base_factor,
          },
        });
        return { skuId };
      });
    },

    async updateSku(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      skuId: string;
      name?: string | null;
      code?: string | null;
      notes?: string | null;
      brandId?: string | null;
      baseUnitId: string;
      purchaseUnitId?: string | null;
      dimensionLength?: string | null;
      dimensionWidth?: string | null;
      dimensionThickness?: string | null;
      dimensionUnitId?: string | null;
      categoryId: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      const identity = resolveSkuIdentity(input.name, input.code);
      if (!input.categoryId) {
        throw new AppError("VALIDATION", "SKU_CATEGORY_REQUIRED", "At least one category is required.");
      }
      const categoryIds = [input.categoryId];

      return runTransaction(async (tx) => {
        const existing = await tx.sku.findUniqueOrThrow({
          where: { id: input.skuId },
          include: { categories: true },
        });

        const baseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.baseUnitId } });
        if (baseUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_BASE_UNIT_INACTIVE", "Base unit must be active.");
        let purchaseUnit = null;
        if (input.purchaseUnitId) {
          purchaseUnit = await tx.unit.findUniqueOrThrow({ where: { id: input.purchaseUnitId } });
          if (purchaseUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_PURCHASE_UNIT_INACTIVE", "Purchase unit must be active.");
        }
        const measurementWasProvided = [
          input.dimensionLength,
          input.dimensionWidth,
          input.dimensionThickness,
          input.dimensionUnitId,
        ].some((value) => value !== undefined);
        const measurementInput = measurementWasProvided
          ? input
          : {
              dimensionLength: existing.dimension_length?.toString() ?? null,
              dimensionWidth: existing.dimension_width?.toString() ?? null,
              dimensionThickness: existing.dimension_thickness?.toString() ?? null,
              dimensionUnitId: existing.dimension_unit_id,
            };
        const measurement = await resolveSkuMeasurement(tx, measurementInput, baseUnit, purchaseUnit);

        const brand = input.brandId ? await tx.brand.findUniqueOrThrow({ where: { id: input.brandId } }) : null;
        if (brand?.deleted_at) throw new AppError("VALIDATION", "SKU_BRAND_ARCHIVED", "Brand is archived.");

        const categories = await tx.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, kind: true, status: true },
        });
        if (categories.length !== categoryIds.length) {
          throw new AppError("VALIDATION", "SKU_CATEGORY_NOT_FOUND", "One or more categories not found.");
        }
        for (const cat of categories) {
          if (cat.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_CATEGORY_INACTIVE", `Category ${cat.id} is not active.`);
          if (cat.kind !== "PRODUCT") {
            throw new AppError("VALIDATION", "SKU_CATEGORY_KIND_INVALID", "SKU categories must be PRODUCT categories.");
          }
        }

        const liveMaterialPriceCount = await tx.priceMaterial.count({ where: { sku_id: input.skuId, deleted_at: null } });
        const nextMeasurement = {
          dimension_length: measurement.dimension_length,
          dimension_width: measurement.dimension_width,
          dimension_thickness: measurement.dimension_thickness,
          dimension_unit_id: measurement.dimension_unit_id,
          purchase_to_base_factor: measurement.purchase_to_base_factor,
        };
        const measurementChanged =
          existing.base_unit_id !== input.baseUnitId ||
          (existing.purchase_unit_id || null) !== (input.purchaseUnitId || null) ||
          (existing.dimension_length?.toString() ?? null) !== nextMeasurement.dimension_length ||
          (existing.dimension_width?.toString() ?? null) !== nextMeasurement.dimension_width ||
          (existing.dimension_thickness?.toString() ?? null) !== nextMeasurement.dimension_thickness ||
          (existing.dimension_unit_id || null) !== (nextMeasurement.dimension_unit_id || null) ||
          (existing.purchase_to_base_factor?.toString() ?? null) !== nextMeasurement.purchase_to_base_factor;
        if (measurementChanged && liveMaterialPriceCount > 0) {
          throw new AppError(
            "CONFLICT",
            "SKU_MEASUREMENT_LOCKED_BY_PRICES",
            "SKU measurement and unit layout cannot change while live material prices exist.",
          );
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== identity.name) {
          changes.name = { from: existing.name, to: identity.name };
          changes.slug = { from: existing.slug, to: identity.slug };
        }
        if ((existing.code || null) !== (input.code?.trim() || null)) {
          changes.code = { from: existing.code, to: input.code?.trim() || null };
        }
        if ((existing.notes || null) !== (input.notes?.trim() || null)) {
          changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        }
        if (existing.brand_id !== (input.brandId || null)) {
          changes.brand_id = { from: existing.brand_id, to: input.brandId || null };
        }
        const previousCategoryIds = existing.categories.map((row) => row.category_id).sort();
        const nextCategoryIds = [...categoryIds].sort();
        if (previousCategoryIds.join("\u0000") !== nextCategoryIds.join("\u0000")) {
          changes.categories = { from: previousCategoryIds, to: nextCategoryIds };
        }
        if (existing.base_unit_id !== input.baseUnitId) {
          changes.base_unit_id = { from: existing.base_unit_id, to: input.baseUnitId };
        }
        if ((existing.purchase_unit_id || null) !== (input.purchaseUnitId || null)) {
          changes.purchase_unit_id = { from: existing.purchase_unit_id, to: input.purchaseUnitId || null };
        }
        for (const [field, next] of Object.entries(measurement)) {
          const previousValue = existing[field as keyof typeof existing];
          const previous = previousValue && typeof previousValue === "object" && "toString" in previousValue
            ? previousValue.toString()
            : previousValue ?? null;
          if (previous !== next) changes[field] = { from: previous, to: next };
        }

        // Enforce live identity uniqueness: (brand_id, slug) must be unique
        // among non-archived SKUs. assertSkuRestorable uses the same rule.
        if (
          changes.name !== undefined ||
          changes.brand_id !== undefined ||
          Object.keys(changes).some((k) => k === "slug")
        ) {
          const skuIdentityConflict = await tx.sku.findFirst({
            where: {
              id: { not: input.skuId },
              brand_id: input.brandId || null,
              slug: identity.slug,
              deleted_at: null,
            },
            select: { id: true },
          });
          if (skuIdentityConflict) throw new AppError("CONFLICT", "SKU_IDENTITY_CONFLICT", "A live SKU already uses this identity.");
        }

        if (Object.keys(changes).length > 0) {
          try {
            await tx.sku.update({
              where: { id: input.skuId },
              data: {
                name: identity.name,
                slug: identity.slug,
                code: identity.code,
                notes: input.notes?.trim() || null,
                brand_id: input.brandId || null,
                base_unit_id: input.baseUnitId,
                purchase_unit_id: input.purchaseUnitId || null,
                ...measurement,
              },
            });
          } catch (error) {
            mapWriteError(error);
          }
        }

        // Update SkuCategories
        if (changes.categories) {
          await tx.skuCategory.deleteMany({ where: { sku_id: input.skuId } });
          await tx.skuCategory.createMany({
            data: categoryIds.map((categoryId) => ({ id: randomUUID(), sku_id: input.skuId, category_id: categoryId })),
          });
        }

        // Clean and update Brand Category SKU enrichment.
        // brand-contract §3: the relation survives only while an origin remains,
        // so the relations this SKU used to justify must be pruned when its last
        // origin is withdrawn.
        const touchedBrandCategoryIds = await tx.brandCategoryOrigin
          .findMany({ where: { source_sku_id: input.skuId }, select: { brand_category_id: true } })
          .then((rows) => rows.map((row) => row.brand_category_id));
        await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: input.skuId } });
        const productCategoryIds = categories.filter((c) => c.kind === "PRODUCT").map((c) => c.id);
        for (const catId of input.brandId ? productCategoryIds : []) {
          let bc = await tx.brandCategory.findUnique({
            where: { brand_id_category_id: { brand_id: input.brandId!, category_id: catId } },
          });
          if (!bc) {
            bc = await tx.brandCategory.create({
              data: { id: randomUUID(), brand_id: input.brandId!, category_id: catId },
            });
          }
          await tx.brandCategoryOrigin.create({
            data: {
              id: randomUUID(),
              brand_category_id: bc.id,
              kind: "SKU_ENRICHMENT",
              source_sku_id: input.skuId,
              actor_user_id: input.actor.userId ?? null,
              actor_label: input.actor.label,
            },
          });
        }

        await pruneOriginlessBrandCategories(tx, touchedBrandCategoryIds);

        // CORE.md §5: no-op updates produce no audit event.
        if (Object.keys(changes).length > 0) {
          await writeAudit(tx, {
            action: "sku.updated",
            entityType: "sku",
            entityId: input.skuId,
            actor: input.actor,
            changes,
          });
        }
        return { skuId: input.skuId };
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

    // ── PriceMaterial Management ────────────────────────────────────────────

    async listPriceMaterials(input: {
      grants: PermissionGrants;
      search?: string;
      skuId?: string;
      supplierVendorId?: string;
      brandId?: string;
      includeArchived?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material prices.");
      const search = input.search?.trim();

      return db.priceMaterial.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.skuId ? { sku_id: input.skuId } : {}),
          ...(input.supplierVendorId ? { supplier_vendor_id: input.supplierVendorId } : {}),
          ...(input.brandId ? { sku: { brand_id: input.brandId } } : {}),
          ...(search
            ? {
                OR: [
                  { sku: { name: { contains: search, mode: "insensitive" } } },
                  { supplier_vendor: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: [{ sku: { name: "asc" } }, { supplier_vendor: { name: "asc" } }],
        select: {
          id: true,
          amount: true,
          currency: true,
          notes: true,
          updated_at: true,
          updated_by_label: true,
          deleted_at: true,
          sku: {
            select: {
              id: true,
              name: true,
              slug: true,
              code: true,
              brand: { select: { id: true, name: true, slug: true } },
            },
          },
          supplier_vendor: {
            select: { id: true, name: true, slug: true },
          },
          unit: {
            select: { id: true, code: true, name: true },
          },
          source_link: {
            select: { id: true, kind: true, url: true, label: true },
          },
        },
      });
    },

    async getPriceMaterial(input: { grants: PermissionGrants; priceMaterialId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceMaterialRead, MASTERDATA_PERMISSIONS.priceMaterialManage], "You do not have permission to view material prices.");
      return db.priceMaterial.findUniqueOrThrow({
        where: { id: input.priceMaterialId },
        include: {
          sku: {
            include: {
              brand: { select: { id: true, name: true, slug: true, links: true } },
              base_unit: true,
              purchase_unit: true,
            },
          },
          supplier_vendor: true,
          unit: true,
          source_link: true,
        },
      });
    },

    async createPriceMaterial(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      skuId: string;
      supplierVendorId: string;
      amount: string;
      currency: string;
      sourceLinkId?: string;
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
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorMaterialCapable(tx, input.supplierVendorId);

        if (input.sourceLinkId) {
          // pricing-contract §2.5: a source link must belong to the SKU's own
          // Brand, and a Brand-less SKU may not carry one at all. Skipping the
          // check for Brand-less SKUs let an unrelated Brand's link attach.
          const link = await tx.brandLink.findUniqueOrThrow({ where: { id: input.sourceLinkId } });
          if (!sku.brand_id) {
            throw new AppError("VALIDATION", "LINK_BRAND_REQUIRED", "Source link requires a SKU Brand.");
          }
          if (link.brand_id !== sku.brand_id) {
            throw new AppError("VALIDATION", "LINK_BRAND_MISMATCH", "Source link must belong to the SKU's Brand.");
          }
        }

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
              source_link_id: input.sourceLinkId || null,
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

    async updatePriceMaterial(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      priceMaterialId: string;
      amount: string;
      currency: string;
      unitId?: string;
      sourceLinkId?: string | null;
      notes?: string | null;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);

      return runTransaction(async (tx) => {
        const existing = await tx.priceMaterial.findUniqueOrThrow({
          where: { id: input.priceMaterialId },
          include: { sku: true },
        });

        if (input.sourceLinkId) {
          const link = await tx.brandLink.findUniqueOrThrow({ where: { id: input.sourceLinkId } });
          if (!existing.sku.brand_id) {
            throw new AppError("VALIDATION", "LINK_BRAND_REQUIRED", "Source link requires a SKU Brand.");
          }
          if (link.brand_id !== existing.sku.brand_id) {
            throw new AppError("VALIDATION", "LINK_BRAND_MISMATCH", "Source link must belong to the SKU's Brand.");
          }
        }

        const unitId = input.unitId ?? existing.unit_id;
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "PRICE_UNIT_INACTIVE", "Unit must be active.");
        // pricing-contract §5: unit must match SKU purchase_unit or base_unit
        const allowedUnitId = existing.sku.purchase_unit_id ?? existing.sku.base_unit_id;
        if (unitId !== allowedUnitId) {
          throw new AppError("VALIDATION", "PRICE_UNIT_SKU_MISMATCH", "Unit must match the SKU's purchase unit or base unit.");
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.unit_id !== unitId) changes.unit_id = { from: existing.unit_id, to: unitId };
        // Only treat source_link_id as changed when the caller explicitly provided it
        // (undefined = "not touched"; null = "explicitly cleared").
        if (input.sourceLinkId !== undefined && (existing.source_link_id || null) !== (input.sourceLinkId || null)) {
          changes.source_link_id = { from: existing.source_link_id, to: input.sourceLinkId || null };
        }
        if ((existing.notes || null) !== (input.notes?.trim() || null)) {
          changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        }

        // CORE.md §5 / pricing-contract §8: no-op updates produce no audit event.
        if (Object.keys(changes).length === 0) return { priceMaterialId: input.priceMaterialId };

        try {
          await tx.priceMaterial.update({
            where: { id: input.priceMaterialId },
            data: {
              amount,
              currency,
              unit_id: unitId,
              source_link_id: input.sourceLinkId !== undefined ? (input.sourceLinkId || null) : existing.source_link_id,
              notes: input.notes?.trim() || null,
              updated_by_user_id: input.actor.userId ?? null,
              updated_by_label: input.actor.label,
            },
          });
        } catch (error) {
          mapWriteError(error);
        }

        await writeAudit(tx, {
          action: "price-material.updated",
          entityType: "price_material",
          entityId: input.priceMaterialId,
          actor: input.actor,
          changes: Object.keys(changes).length > 0 ? changes : undefined,
        });
        return { priceMaterialId: input.priceMaterialId };
      });
    },

    async archivePriceMaterial(input: { grants: PermissionGrants; actor: AuditActor; priceMaterialId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: input.priceMaterialId } });
        if (price.deleted_at !== null) throw new AppError("CONFLICT", "PRICE_ALREADY_ARCHIVED", "Price is already archived.");
        const sku = await tx.sku.findUniqueOrThrow({ where: { id: price.sku_id }, select: { deleted_at: true } });
        if (sku.deleted_at === null) {
          const livePriceCount = await tx.priceMaterial.count({ where: { sku_id: price.sku_id, deleted_at: null } });
          if (livePriceCount <= 1) {
            throw new AppError("CONFLICT", "SKU_PRICE_REQUIRED", "A live SKU must retain at least one active material price.");
          }
        }
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

    // ── PriceMaterialLabor Management ───────────────────────────────────────

    async listPriceMaterialLabors(input: {
      grants: PermissionGrants;
      search?: string;
      categoryId?: string;
      vendorId?: string;
      includeArchived?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view material + labor prices.");
      const search = input.search?.trim();

      return db.priceMaterialLabor.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.categoryId ? { category_id: input.categoryId } : {}),
          ...(input.vendorId ? { vendor_id: input.vendorId } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { vendor: { name: { contains: search, mode: "insensitive" } } },
                  { category: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: [{ name: "asc" }, { vendor: { name: "asc" } }],
        select: {
          id: true,
          name: true,
          slug: true,
          amount: true,
          currency: true,
          scope_note: true,
          spec: true,
          dim_display: true,
          notes: true,
          updated_at: true,
          updated_by_label: true,
          deleted_at: true,
          category: { select: { id: true, name: true, slug: true } },
          vendor: { select: { id: true, name: true, slug: true } },
          unit: { select: { id: true, code: true, name: true } },
        },
      });
    },

    async getPriceMaterialLabor(input: { grants: PermissionGrants; priceMaterialLaborId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view material + labor prices.");
      return db.priceMaterialLabor.findUniqueOrThrow({
        where: { id: input.priceMaterialLaborId },
        include: {
          category: true,
          vendor: true,
          unit: true,
        },
      });
    },

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
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
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

    async updatePriceMaterialLabor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      priceMaterialLaborId: string;
      name: string;
      categoryId: string;
      vendorId: string;
      unitId: string;
      amount: string;
      currency: string;
      scopeNote?: string | null;
      notes?: string | null;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);

      return runTransaction(async (tx) => {
        const existing = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: input.priceMaterialLaborId } });

        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) {
          changes.name = { from: existing.name, to: name };
          changes.slug = { from: existing.slug, to: slug };
        }
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.category_id !== input.categoryId) changes.category_id = { from: existing.category_id, to: input.categoryId };
        if (existing.vendor_id !== input.vendorId) changes.vendor_id = { from: existing.vendor_id, to: input.vendorId };
        if (existing.unit_id !== input.unitId) changes.unit_id = { from: existing.unit_id, to: input.unitId };
        if ((existing.scope_note || null) !== (input.scopeNote?.trim() || null)) {
          changes.scope_note = { from: existing.scope_note, to: input.scopeNote?.trim() || null };
        }
        if ((existing.notes || null) !== (input.notes?.trim() || null)) {
          changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        }

        // CORE.md §5 / pricing-contract §8: no-op updates produce no audit event.
        if (Object.keys(changes).length === 0) return { priceMaterialLaborId: input.priceMaterialLaborId };

        try {
          await tx.priceMaterialLabor.update({
            where: { id: input.priceMaterialLaborId },
            data: {
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
          action: "price-material-labor.updated",
          entityType: "price_material_labor",
          entityId: input.priceMaterialLaborId,
          actor: input.actor,
          changes: Object.keys(changes).length > 0 ? changes : undefined,
        });
        return { priceMaterialLaborId: input.priceMaterialLaborId };
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
          throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent Supplier is still archived.");
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

    // ── PriceLabor Management ───────────────────────────────────────────────

    async listPriceLabors(input: {
      grants: PermissionGrants;
      search?: string;
      categoryId?: string;
      vendorId?: string;
      includeArchived?: boolean;
    }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view labor prices.");
      const search = input.search?.trim();

      return db.priceLabor.findMany({
        where: {
          ...(input.includeArchived ? {} : { deleted_at: null }),
          ...(input.categoryId ? { category_id: input.categoryId } : {}),
          ...(input.vendorId ? { vendor_id: input.vendorId } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { vendor: { name: { contains: search, mode: "insensitive" } } },
                  { category: { name: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: [{ name: "asc" }, { vendor: { name: "asc" } }],
        select: {
          id: true,
          name: true,
          slug: true,
          amount: true,
          currency: true,
          spec: true,
          dim_display: true,
          notes: true,
          updated_at: true,
          updated_by_label: true,
          deleted_at: true,
          category: { select: { id: true, name: true, slug: true } },
          vendor: { select: { id: true, name: true, slug: true } },
          unit: { select: { id: true, code: true, name: true } },
        },
      });
    },

    async getPriceLabor(input: { grants: PermissionGrants; priceLaborId: string }) {
      requireAnyPermission(input.grants, [MASTERDATA_PERMISSIONS.priceWorkRead, MASTERDATA_PERMISSIONS.priceWorkManage], "You do not have permission to view labor prices.");
      return db.priceLabor.findUniqueOrThrow({
        where: { id: input.priceLaborId },
        include: {
          category: true,
          vendor: true,
          unit: true,
        },
      });
    },

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
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
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

    async updatePriceLabor(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      priceLaborId: string;
      name: string;
      categoryId: string;
      vendorId: string;
      unitId: string;
      amount: string;
      currency: string;
      notes?: string | null;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkManage);
      actorIsUsable(input.actor);
      const name = requiredName(input.name, "PRICE_NAME_REQUIRED");
      const slug = requiredSlug(name);
      const currency = requiredCurrency(input.currency);
      const amount = requiredAmount(input.amount);

      return runTransaction(async (tx) => {
        const existing = await tx.priceLabor.findUniqueOrThrow({ where: { id: input.priceLaborId } });

        const category = await tx.category.findUniqueOrThrow({ where: { id: input.categoryId } });
        if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "CATEGORY_INACTIVE", "Category is not active.");
        if (category.kind !== "WORK") throw new AppError("VALIDATION", "CATEGORY_NOT_WORK", "Category must be of kind WORK.");
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: input.unitId } });
        if (unit.status !== "ACTIVE") throw new AppError("VALIDATION", "UNIT_INACTIVE", "Unit is not active.");
        const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: input.vendorId } });
        if (vendor.deleted_at !== null) throw new AppError("VALIDATION", "VENDOR_ARCHIVED", "Supplier is archived.");
        await assertVendorLaborCapable(tx, input.vendorId);

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) {
          changes.name = { from: existing.name, to: name };
          changes.slug = { from: existing.slug, to: slug };
        }
        if (existing.amount.toString() !== amount) changes.amount = { from: existing.amount.toString(), to: amount };
        if (existing.currency !== currency) changes.currency = { from: existing.currency, to: currency };
        if (existing.category_id !== input.categoryId) changes.category_id = { from: existing.category_id, to: input.categoryId };
        if (existing.vendor_id !== input.vendorId) changes.vendor_id = { from: existing.vendor_id, to: input.vendorId };
        if (existing.unit_id !== input.unitId) changes.unit_id = { from: existing.unit_id, to: input.unitId };
        if ((existing.notes || null) !== (input.notes?.trim() || null)) {
          changes.notes = { from: existing.notes, to: input.notes?.trim() || null };
        }

        // CORE.md §5 / pricing-contract §8: no-op updates produce no audit event.
        if (Object.keys(changes).length === 0) return { priceLaborId: input.priceLaborId };

        try {
          await tx.priceLabor.update({
            where: { id: input.priceLaborId },
            data: {
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
          action: "price-labor.updated",
          entityType: "price_labor",
          entityId: input.priceLaborId,
          actor: input.actor,
          changes: Object.keys(changes).length > 0 ? changes : undefined,
        });
        return { priceLaborId: input.priceLaborId };
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
          throw new AppError("CONFLICT", "PRICE_HAS_PARENT_CAUSES", "Price cannot be restored while its parent Supplier is still archived.");
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

    async listPromotionReferences(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);
      const [materials, labor, combined] = await Promise.all([
        db.priceMaterial.findMany({ where: { deleted_at: null }, include: { sku: true, supplier_vendor: true, unit: true }, orderBy: { created_at: "desc" } }),
        db.priceLabor.findMany({ where: { deleted_at: null }, include: { vendor: true, unit: true }, orderBy: { name: "asc" } }),
        db.priceMaterialLabor.findMany({ where: { deleted_at: null }, include: { vendor: true, unit: true }, orderBy: { name: "asc" } }),
      ]);
      return [
        ...materials.map(p => ({ id: p.id, type: "material" as const, label: `${p.sku.name ?? p.sku.code ?? "SKU"} · ${p.supplier_vendor.name} · ${p.amount} ${p.currency}/${p.unit.code}` })),
        ...labor.map(p => ({ id: p.id, type: "labor" as const, label: `${p.name} · ${p.vendor.name} · ${p.amount} ${p.currency}/${p.unit.code}` })),
        ...combined.map(p => ({ id: p.id, type: "material_labor" as const, label: `${p.name} · ${p.vendor.name} · ${p.amount} ${p.currency}/${p.unit.code}` })),
      ];
    },

    async validatePromotionReference(input: {
      grants: PermissionGrants;
      type: "material" | "labor" | "material_labor";
      referenceId: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.promotionApprove);
      const referenceId = input.referenceId.trim();
      if (!referenceId) throw new AppError("VALIDATION", "PROMOTION_REFERENCE_REQUIRED", "A Master Data reference is required.");
      const exists = input.type === "material"
        ? await db.priceMaterial.findFirst({ where: { id: referenceId, deleted_at: null }, select: { id: true } })
        : input.type === "labor"
          ? await db.priceLabor.findFirst({ where: { id: referenceId, deleted_at: null }, select: { id: true } })
          : await db.priceMaterialLabor.findFirst({ where: { id: referenceId, deleted_at: null }, select: { id: true } });
      if (!exists) throw new AppError("NOT_FOUND", "PROMOTION_REFERENCE_NOT_FOUND", "The selected Master Data price entry does not exist or is archived.");
      return { referenceId: exists.id };
    },

    // ── Deletion approval workflow ────────────────────────────────────────────

    async listDeletionRequests(input: {
      grants: PermissionGrants;
      status?: "PENDING" | "APPROVED" | "REJECTED";
      targetType?: string;
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.access);
      return db.deletionRequest.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.targetType ? { target_type: input.targetType } : {}),
        },
        orderBy: { requested_at: "desc" },
      });
    },

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
        // masterdata.md §4.2: `reason` is the requester's stated reason. It is
        // part of the persisted request record and must survive the decision;
        // the approver's rejection reason belongs to the decision event.
        const rejectionReason = input.reason?.trim() || null;
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: {
            status: "REJECTED",
            approver_user_id: input.actor.userId!,
            approver_label: input.actor.label,
            decided_at: new Date(),
          },
        });
        const entityType = request.target_type.replace(/_/g, "-");
        await writeAudit(tx, {
          action: `${entityType}.deletion-rejected`,
          entityType: request.target_type,
          entityId: request.target_id,
          actor: input.actor,
          metadata: {
            request_id: request.id,
            requester_user_id: request.requester_user_id,
            requester_label: request.requester_label,
            ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
          },
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

        const { target_type: targetType, target_id: targetId } = request;

        if (targetType === "brand") {
          const brand = await tx.brand.findUniqueOrThrow({ where: { id: targetId } });
          if (brand.deleted_at === null) {
            throw new AppError("CONFLICT", "BRAND_NOT_ARCHIVED", "Brand was restored and can no longer be permanently deleted.");
          }
          const supplierCount = await tx.brandSupplier.count({ where: { brand_id: targetId } });
          if (supplierCount > 0) {
            throw new AppError("CONFLICT", "BRAND_HAS_SUPPLIERS", "Brand still has supplier relations. Remove them first.");
          }
          const contactCount = await tx.vendorContact.count({ where: { brand_id: targetId } });
          if (contactCount > 0) {
            throw new AppError("CONFLICT", "BRAND_HAS_CONTACTS", "Brand still has scoped contacts. Remove them first.");
          }

          const skuIds = await tx.sku.findMany({ where: { brand_id: targetId }, select: { id: true } }).then((rows) => rows.map((row) => row.id));
          const priceIds = skuIds.length === 0 ? [] : await tx.priceMaterial.findMany({ where: { sku_id: { in: skuIds } }, select: { id: true } }).then((rows) => rows.map((row) => row.id));
          if (priceIds.length > 0) {
            await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: { in: priceIds } } });
            await tx.priceMaterial.deleteMany({ where: { id: { in: priceIds } } });
          }
          if (skuIds.length > 0) {
            await tx.archiveCause.deleteMany({ where: { entity_type: "sku", entity_id: { in: skuIds } } });
            await tx.skuCategory.deleteMany({ where: { sku_id: { in: skuIds } } });
            await tx.brandCategoryOrigin.deleteMany({ where: { source_sku_id: { in: skuIds } } });
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
          const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: targetId } });
          if (vendor.deleted_at === null) {
            throw new AppError("CONFLICT", "VENDOR_NOT_ARCHIVED", "Supplier was restored and can no longer be permanently deleted.");
          }
          const ownedBrandCount = await tx.brand.count({ where: { owner_vendor_id: targetId } });
          if (ownedBrandCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_HAS_OWNED_BRANDS", "Supplier still owns Brands. Clear ownership first.");
          }
          const supplierCount = await tx.brandSupplier.count({ where: { vendor_id: targetId } });
          if (supplierCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_HAS_SUPPLIER_RELATIONS", "Supplier still has BrandSupplier relations.");
          }
          const priceCount =
            (await tx.priceMaterial.count({ where: { supplier_vendor_id: targetId } })) +
            (await tx.priceMaterialLabor.count({ where: { vendor_id: targetId } })) +
            (await tx.priceLabor.count({ where: { vendor_id: targetId } }));
          if (priceCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_HAS_PRICES", "Supplier still has price rows. Delete them first.");
          }
          await tx.vendorContact.deleteMany({ where: { vendor_id: targetId } });
          await tx.vendorVendorType.deleteMany({ where: { vendor_id: targetId } });
          await tx.archiveCause.deleteMany({ where: { entity_type: "vendor", entity_id: targetId } });
          await tx.vendor.delete({ where: { id: targetId } });

        } else if (targetType === "sku") {
          const sku = await tx.sku.findUniqueOrThrow({ where: { id: targetId } });
          if (sku.deleted_at === null) {
            throw new AppError("CONFLICT", "SKU_NOT_ARCHIVED", "SKU was restored and can no longer be permanently deleted.");
          }
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
          const unit = await tx.unit.findUniqueOrThrow({ where: { id: targetId } });
          if (unit.status !== "ARCHIVED") {
            throw new AppError("CONFLICT", "UNIT_NOT_ARCHIVED", "Unit was restored and can no longer be permanently deleted.");
          }
          // A hard deletion must preserve every existing unit reference, including archived rows.
          const [uMatPrice, uMatLabor, uLabor, uSku] = await Promise.all([
            tx.priceMaterial.count({ where: { unit_id: targetId } }),
            tx.priceMaterialLabor.count({ where: { unit_id: targetId } }),
            tx.priceLabor.count({ where: { unit_id: targetId } }),
            tx.sku.count({ where: { OR: [{ base_unit_id: targetId }, { purchase_unit_id: targetId }, { dimension_unit_id: targetId }] } }),
          ]);
          const unitInUse = uMatPrice + uMatLabor + uLabor + uSku;
          if (unitInUse > 0) {
            throw new AppError("CONFLICT", "UNIT_IN_USE",
              `Unit is still referenced by ${unitInUse} record(s) (prices or SKUs) and cannot be permanently deleted.`);
          }
          await tx.archiveCause.deleteMany({ where: { entity_type: "unit", entity_id: targetId } });
          try {
            await tx.unit.delete({ where: { id: targetId } });
          } catch (error) {
            mapWriteError(error);
          }

        } else if (targetType === "category") {
          const category = await tx.category.findUniqueOrThrow({ where: { id: targetId } });
          if (category.status !== "DEACTIVATED") {
            throw new AppError("CONFLICT", "CATEGORY_STILL_ACTIVE", "Category was reactivated and can no longer be permanently deleted.");
          }
          const [brandCatCount, skuCatCount, laborCount, workPriceCount] = await Promise.all([
            tx.brandCategory.count({ where: { category_id: targetId } }),
            tx.skuCategory.count({ where: { category_id: targetId } }),
            tx.priceMaterialLabor.count({ where: { category_id: targetId } }),
            tx.priceLabor.count({ where: { category_id: targetId } }),
          ]);
          const dependencyCount = brandCatCount + skuCatCount + laborCount + workPriceCount;
          if (dependencyCount > 0) {
            throw new AppError("CONFLICT", "CATEGORY_HAS_DEPENDENCIES",
              `Category is still referenced by ${dependencyCount} record(s) and cannot be permanently deleted.`);
          }
          try {
            await tx.category.delete({ where: { id: targetId } });
          } catch (error) {
            mapWriteError(error);
          }

        } else if (targetType === "vendor_type") {
          const vendorType = await tx.vendorType.findUniqueOrThrow({ where: { id: targetId } });
          if (vendorType.deleted_at === null) {
            throw new AppError("CONFLICT", "VENDOR_TYPE_NOT_ARCHIVED", "Supplier Type was restored and can no longer be permanently deleted.");
          }
          const vendorAssignmentCount = await tx.vendorVendorType.count({ where: { vendor_type_id: targetId } });
          if (vendorAssignmentCount > 0) {
            throw new AppError("CONFLICT", "VENDOR_TYPE_HAS_ASSIGNMENTS",
              `Supplier Type is assigned to ${vendorAssignmentCount} Supplier(s) and cannot be permanently deleted.`);
          }
          await tx.archiveCause.deleteMany({ where: { entity_type: "vendor_type", entity_id: targetId } });
          try {
            await tx.vendorType.delete({ where: { id: targetId } });
          } catch (error) {
            mapWriteError(error);
          }

        } else if (targetType === "price_material") {
          const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: targetId } });
          if (price.deleted_at === null) {
            throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price was restored and can no longer be permanently deleted.");
          }
          await tx.archiveCause.deleteMany({ where: { entity_type: "price_material", entity_id: targetId } });
          await tx.priceMaterial.delete({ where: { id: targetId } });

        } else if (targetType === "price_material_labor") {
          const price = await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: targetId } });
          if (price.deleted_at === null) {
            throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price was restored and can no longer be permanently deleted.");
          }
          await tx.archiveCause.deleteMany({ where: { entity_type: "price_material_labor", entity_id: targetId } });
          await tx.priceMaterialLabor.delete({ where: { id: targetId } });

        } else if (targetType === "price_labor") {
          const price = await tx.priceLabor.findUniqueOrThrow({ where: { id: targetId } });
          if (price.deleted_at === null) {
            throw new AppError("CONFLICT", "PRICE_NOT_ARCHIVED", "Price was restored and can no longer be permanently deleted.");
          }
          await tx.archiveCause.deleteMany({ where: { entity_type: "price_labor", entity_id: targetId } });
          await tx.priceLabor.delete({ where: { id: targetId } });

        } else {
          throw new AppError("VALIDATION", "UNKNOWN_TARGET_TYPE", `Unknown deletion target type: ${targetType}`);
        }

        const auditEntityType = targetType;
        const auditAction = `${targetType.replace(/_/g, "-")}.deleted`;
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            approver_user_id: input.actor.userId!,
            approver_label: input.actor.label,
            decided_at: new Date(),
          },
        });
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
