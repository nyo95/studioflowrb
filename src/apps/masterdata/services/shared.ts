import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";
import { hasPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";
import { calculateRectangleAreaSquareMeters } from "@platform/utilities/measurement";

export { hasPermission };
export type TxClient = Prisma.TransactionClient;

export function actorIsUsable(actor: AuditActor): void {
  if (actor.kind !== "USER" || !actor.userId) {
    throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  }
}

export function requireAnyPermission(grants: PermissionGrants, permissions: readonly string[], safeMessage: string): void {
  if (!permissions.some((permission) => hasPermission(grants, permission))) {
    throw new AppError("FORBIDDEN", "PERMISSION_DENIED", safeMessage);
  }
}

export function mapWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) throw mapPrismaKnownError(error);
  throw error;
}

export function requiredName(value: string, code: string): string {
  const name = normalizeText(value);
  if (!name) throw new AppError("VALIDATION", code, "A name is required.");
  return name;
}

export function requiredSlug(value: string): string {
  const slug = toSlug(value);
  if (!slug) throw new AppError("VALIDATION", "SLUG_INVALID", "The name must contain a usable identifier.");
  return slug;
}

export function requiredCurrency(value: string): string {
  const c = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new AppError("VALIDATION", "CURRENCY_INVALID", "Currency must be a 3-letter uppercase code.");
  return c;
}

export const ZERO_AMOUNT = toDecimalString("0");

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

export function requiredAmount(value: string): string {
  let amount;
  try { amount = toDecimalString(value); } catch { throw new AppError("VALIDATION", "PRICE_AMOUNT_INVALID", "Amount must be a valid decimal value."); }
  if (compareDecimals(amount, ZERO_AMOUNT) < 0) throw new AppError("VALIDATION", "PRICE_AMOUNT_NEGATIVE", "Amount must be non-negative.");
  return amount;
}

export function resolveSkuIdentity(nameValue?: string | null, codeValue?: string | null) {
  const name = normalizeText(nameValue ?? "") || null;
  const code = codeValue?.trim() || null;
  if (!name && !code) throw new AppError("VALIDATION", "SKU_IDENTITY_REQUIRED", "SKU code or SKU name is required.");
  return { name, code, slug: requiredSlug(name ?? code!) };
}

type SkuMeasurementInput = { dimensionLength?: string | null; dimensionWidth?: string | null; dimensionThickness?: string | null; dimensionUnitId?: string | null; };
const LENGTH_TO_METRE: Readonly<Record<string, string>> = { MM: "0.001", CM: "0.01", M: "1" };

export async function resolveSkuMeasurement(tx: TxClient, input: SkuMeasurementInput, baseUnit: { code: string }, purchaseUnit: { code: string; status: string } | null) {
  const length = input.dimensionLength?.trim() || null; const width = input.dimensionWidth?.trim() || null; const thickness = input.dimensionThickness?.trim() || null; const dimensionUnitId = input.dimensionUnitId?.trim() || null;
  if (!length && !width && !thickness && !dimensionUnitId) return { dimension_length: null, dimension_width: null, dimension_thickness: null, dimension_unit_id: null, purchase_to_base_factor: null };
  if (!length || !width || !dimensionUnitId) throw new AppError("VALIDATION", "SKU_DIMENSION_INCOMPLETE", "Length, width, and dimension unit must be filled together.");
  if (!purchaseUnit) throw new AppError("VALIDATION", "SKU_DIMENSION_PURCHASE_UNIT_REQUIRED", "A purchase unit is required when dimensions define a conversion.");
  if (baseUnit.code.toUpperCase() !== "M2") throw new AppError("VALIDATION", "SKU_DIMENSION_BASE_UNIT_INVALID", "Rectangular dimensions require M2 as the base measurement unit.");
  const dimensionUnit = await tx.unit.findUniqueOrThrow({ where: { id: dimensionUnitId } });
  if (dimensionUnit.status !== "ACTIVE") throw new AppError("VALIDATION", "SKU_DIMENSION_UNIT_INACTIVE", "Dimension unit must be active.");
  const lengthToMeterFactor = LENGTH_TO_METRE[dimensionUnit.code.toUpperCase()];
  if (!lengthToMeterFactor) throw new AppError("VALIDATION", "SKU_DIMENSION_UNIT_INVALID", "Dimension unit must be MM, CM, or M.");
  try { const purchaseToBaseFactor = calculateRectangleAreaSquareMeters({ length, width, lengthToMeterFactor }); const normalizedThickness = thickness ? toDecimalString(thickness) : null; if (normalizedThickness?.startsWith("-") || normalizedThickness === "0") throw new Error("invalid thickness"); return { dimension_length: toDecimalString(length), dimension_width: toDecimalString(width), dimension_thickness: normalizedThickness, dimension_unit_id: dimensionUnit.id, purchase_to_base_factor: purchaseToBaseFactor }; } catch { throw new AppError("VALIDATION", "SKU_DIMENSION_INVALID", "Dimensions must be positive decimal values."); }
}

export function normalizeHashtags(hashtags: readonly string[]): Array<{ label: string; normalized: string }> {
  const seen = new Set<string>(); const result: Array<{ label: string; normalized: string }> = [];
  for (const raw of hashtags) { const clean = raw.trim().replace(/^#+/, ""); const normalized = normalizeText(clean).toLowerCase(); if (normalized && !seen.has(normalized)) { seen.add(normalized); result.push({ label: clean, normalized }); } }
  return result;
}

export async function addDirectCause(tx: TxClient, entityType: string, entityId: string): Promise<void> {
  await tx.archiveCause.createMany({ data: [{ id: randomUUID(), entity_type: entityType, entity_id: entityId, kind: "DIRECT", parent_type: null, parent_id: null }], skipDuplicates: true });
}

export async function addParentCauses(tx: TxClient, entityType: string, parentType: string, parentId: string, entityIds: string[]): Promise<void> {
  if (entityIds.length === 0) return;
  await tx.archiveCause.createMany({ data: entityIds.map((entityId) => ({ id: randomUUID(), entity_type: entityType, entity_id: entityId, kind: "PARENT" as const, parent_type: parentType, parent_id: parentId })), skipDuplicates: true });
}

export async function removeDirectCause(tx: TxClient, entityType: string, entityId: string): Promise<void> {
  await tx.archiveCause.deleteMany({ where: { entity_type: entityType, entity_id: entityId, kind: "DIRECT", parent_type: null, parent_id: null } });
}

export async function removeParentCausesAndFindRestored(tx: TxClient, entityType: string, parentType: string, parentId: string): Promise<string[]> {
  const affected = await tx.archiveCause.findMany({ where: { entity_type: entityType, kind: "PARENT", parent_type: parentType, parent_id: parentId }, select: { entity_id: true } });
  const affectedIds = affected.map((c) => c.entity_id); if (affectedIds.length === 0) return [];
  await tx.archiveCause.deleteMany({ where: { entity_type: entityType, kind: "PARENT", parent_type: parentType, parent_id: parentId } });
  const stillCaused = await tx.archiveCause.findMany({ where: { entity_type: entityType, entity_id: { in: affectedIds } }, select: { entity_id: true }, distinct: ["entity_id"] });
  const stillCausedSet = new Set(stillCaused.map((c) => c.entity_id)); return affectedIds.filter((id) => !stillCausedSet.has(id));
}

export async function pruneOriginlessBrandCategories(tx: TxClient, brandCategoryIds: readonly string[]): Promise<void> {
  for (const brandCategoryId of new Set(brandCategoryIds)) { const remaining = await tx.brandCategoryOrigin.count({ where: { brand_category_id: brandCategoryId } }); if (remaining === 0) await tx.brandCategory.delete({ where: { id: brandCategoryId } }); }
}

export async function assertVendorMaterialCapable(tx: TxClient, vendorId: string): Promise<void> {
  const capable = await tx.vendorVendorType.findFirst({ where: { vendor_id: vendorId, vendor: { deleted_at: null }, vendor_type: { deleted_at: null, can_supply_material: true } } });
  if (!capable) throw new AppError("VALIDATION", "VENDOR_NOT_MATERIAL_CAPABLE", "Supplier is not eligible to supply material.");
}

export async function assertVendorLaborCapable(tx: TxClient, vendorId: string): Promise<void> {
  const capable = await tx.vendorVendorType.findFirst({ where: { vendor_id: vendorId, vendor: { deleted_at: null }, vendor_type: { deleted_at: null, can_supply_labor: true } } });
  if (!capable) throw new AppError("VALIDATION", "VENDOR_NOT_LABOR_CAPABLE", "Supplier is not eligible to provide labor.");
}

export async function assertVendorTypeRemovalSafe(tx: TxClient, vendorId: string, remainingTypeIds: string[]): Promise<void> {
  const remainingTypes = await tx.vendorType.findMany({ where: { id: { in: remainingTypeIds }, deleted_at: null } });
  const hasMaterial = remainingTypes.some((t) => t.can_supply_material); const hasLabor = remainingTypes.some((t) => t.can_supply_labor);
  if (!hasMaterial) { const [priceCount, supplierCount] = await Promise.all([tx.priceMaterial.count({ where: { supplier_vendor_id: vendorId, deleted_at: null } }), tx.brandSupplier.count({ where: { vendor_id: vendorId } })]); if (priceCount > 0 || supplierCount > 0) throw new AppError("CONFLICT", "VENDOR_MATERIAL_CAPABILITY_IN_USE", "Cannot remove material supply capability while live material prices or brand supplier relations exist."); }
  if (!hasLabor) { const [mlCount, laborCount] = await Promise.all([tx.priceMaterialLabor.count({ where: { vendor_id: vendorId, deleted_at: null } }), tx.priceLabor.count({ where: { vendor_id: vendorId, deleted_at: null } })]); if (mlCount > 0 || laborCount > 0) throw new AppError("CONFLICT", "VENDOR_LABOR_CAPABILITY_IN_USE", "Cannot remove labor provision capability while live work prices exist."); }
}

export async function assertLiveProductCategories(tx: TxClient, categoryIds: readonly string[]): Promise<void> {
  if (categoryIds.length === 0) return;
  const unique = [...new Set(categoryIds)]; const categories = await tx.category.findMany({ where: { id: { in: unique } }, select: { id: true, kind: true, status: true } });
  if (categories.length !== unique.length) throw new AppError("VALIDATION", "BRAND_CATEGORY_NOT_FOUND", "One or more categories not found.");
  for (const category of categories) { if (category.status !== "ACTIVE") throw new AppError("VALIDATION", "BRAND_CATEGORY_INACTIVE", "Brand categories must be active."); if (category.kind !== "PRODUCT") throw new AppError("VALIDATION", "BRAND_CATEGORY_KIND_INVALID", "Brand categories must be PRODUCT categories."); }
}

export async function assertSkuRestorable(tx: TxClient, skuId: string): Promise<void> {
  const sku = await tx.sku.findUniqueOrThrow({ where: { id: skuId } });
  const [brand, baseUnit, purchaseUnit, categories, identityConflict] = await Promise.all([sku.brand_id ? tx.brand.findUniqueOrThrow({ where: { id: sku.brand_id } }) : null, tx.unit.findUniqueOrThrow({ where: { id: sku.base_unit_id } }), sku.purchase_unit_id ? tx.unit.findUniqueOrThrow({ where: { id: sku.purchase_unit_id } }) : null, tx.skuCategory.findMany({ where: { sku_id: skuId }, include: { category: true } }), tx.sku.findFirst({ where: { id: { not: skuId }, brand_id: sku.brand_id, slug: sku.slug, deleted_at: null }, select: { id: true } })]);
  if (brand?.deleted_at) throw new AppError("CONFLICT", "SKU_BRAND_ARCHIVED", "SKU cannot be restored while its Brand is archived.");
  if (baseUnit.status !== "ACTIVE" || purchaseUnit?.status === "ARCHIVED") throw new AppError("CONFLICT", "SKU_UNIT_INACTIVE", "SKU cannot be restored while one of its Units is archived.");
  if (categories.length === 0 || categories.some((row) => row.category.status !== "ACTIVE")) throw new AppError("CONFLICT", "SKU_CATEGORY_INACTIVE", "SKU cannot be restored without active Categories.");
  if (identityConflict) throw new AppError("CONFLICT", "SKU_IDENTITY_CONFLICT", "A live SKU already uses this identity.");
}

export async function assertPriceMaterialRestorable(tx: TxClient, priceId: string): Promise<void> {
  const price = await tx.priceMaterial.findUniqueOrThrow({ where: { id: priceId } });
  const [sku, vendor, unit, conflict, sourceLink] = await Promise.all([tx.sku.findUniqueOrThrow({ where: { id: price.sku_id } }), tx.vendor.findUniqueOrThrow({ where: { id: price.supplier_vendor_id } }), tx.unit.findUniqueOrThrow({ where: { id: price.unit_id } }), tx.priceMaterial.findFirst({ where: { id: { not: priceId }, sku_id: price.sku_id, supplier_vendor_id: price.supplier_vendor_id, deleted_at: null }, select: { id: true } }), price.source_link_id ? tx.brandLink.findUniqueOrThrow({ where: { id: price.source_link_id }, include: { brand: true } }) : null]);
  if (sku.deleted_at) throw new AppError("CONFLICT", "PRICE_SKU_ARCHIVED", "Price cannot be restored while its SKU is archived.");
  if (vendor.deleted_at) throw new AppError("CONFLICT", "PRICE_VENDOR_ARCHIVED", "Price cannot be restored while its Supplier is archived.");
  if (unit.status !== "ACTIVE") throw new AppError("CONFLICT", "PRICE_UNIT_INACTIVE", "Price cannot be restored while its Unit is archived.");
  if (sourceLink?.brand.deleted_at) throw new AppError("CONFLICT", "PRICE_SOURCE_BRAND_ARCHIVED", "Price cannot be restored while its source Brand is archived.");
  await assertVendorMaterialCapable(tx, vendor.id); if (conflict) throw new AppError("CONFLICT", "PRICE_PAIR_CONFLICT", "A live price already exists for this SKU and Supplier.");
}

export async function assertWorkPriceRestorable(tx: TxClient, table: "material-labor" | "labor", priceId: string): Promise<void> {
  const price = table === "material-labor" ? await tx.priceMaterialLabor.findUniqueOrThrow({ where: { id: priceId } }) : await tx.priceLabor.findUniqueOrThrow({ where: { id: priceId } });
  const [category, vendor, unit, conflict] = await Promise.all([tx.category.findUniqueOrThrow({ where: { id: price.category_id } }), tx.vendor.findUniqueOrThrow({ where: { id: price.vendor_id } }), tx.unit.findUniqueOrThrow({ where: { id: price.unit_id } }), table === "material-labor" ? tx.priceMaterialLabor.findFirst({ where: { id: { not: priceId }, vendor_id: price.vendor_id, deleted_at: null, OR: [{ slug: price.slug }, { name: { equals: price.name, mode: "insensitive" } }] }, select: { id: true } }) : tx.priceLabor.findFirst({ where: { id: { not: priceId }, vendor_id: price.vendor_id, deleted_at: null, OR: [{ slug: price.slug }, { name: { equals: price.name, mode: "insensitive" } }] }, select: { id: true } })]);
  if (category.status !== "ACTIVE" || category.kind !== "WORK") throw new AppError("CONFLICT", "PRICE_CATEGORY_INACTIVE", "Work price requires an active WORK Category.");
  if (vendor.deleted_at) throw new AppError("CONFLICT", "PRICE_VENDOR_ARCHIVED", "Price cannot be restored while its Supplier is archived.");
  if (unit.status !== "ACTIVE") throw new AppError("CONFLICT", "PRICE_UNIT_INACTIVE", "Price cannot be restored while its Unit is archived.");
  await assertVendorLaborCapable(tx, vendor.id); if (conflict) throw new AppError("CONFLICT", "PRICE_IDENTITY_CONFLICT", "A live work price already uses this Supplier identity.");
}

export async function createDeletionRequest(tx: TxClient, input: { targetType: string; targetId: string; actor: AuditActor; reason?: string; notes?: string }): Promise<string> {
  const existing = await tx.deletionRequest.findFirst({ where: { target_type: input.targetType, target_id: input.targetId, status: "PENDING" } });
  if (existing) return existing.id;
  const req = await tx.deletionRequest.create({ data: { id: randomUUID(), target_type: input.targetType, target_id: input.targetId, status: "PENDING", requester_user_id: input.actor.userId!, requester_label: input.actor.label, reason: input.reason ?? null, notes: input.notes ?? null } });
  return req.id;
}

export async function latestAuditActorLabels(db: PrismaClient, entityType: string, entityIds: readonly string[]): Promise<Map<string, string>> {
  if (entityIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ entity_id: string; actor_label: string }[]>(Prisma.sql`SELECT DISTINCT ON (entity_id) entity_id, actor_label FROM "platform"."AuditEvent" WHERE app_id = 'masterdata' AND entity_type = ${entityType} AND entity_id IN (${Prisma.join(entityIds)}) ORDER BY entity_id, occurred_at DESC`);
  return new Map(rows.map((row) => [row.entity_id, row.actor_label]));
}

export type MasterDataDeletionTarget = "brand" | "vendor" | "sku" | "unit" | "category" | "vendor_type" | "supplier_category" | "price_material" | "price_material_labor" | "price_labor";

export type MasterDataServicePorts = { runTransaction: <T>(work: (tx: TxClient) => Promise<T>) => Promise<T>; auditWriter: AuditWriter; };

export async function writeAudit(ports: MasterDataServicePorts, tx: TxClient, input: { action: string; entityType: string; entityId: string; actor: AuditActor; changes?: Record<string, { from: unknown; to: unknown }>; metadata?: Record<string, unknown> }): Promise<void> {
  await ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", ...input }), tx);
}

export { Prisma };
