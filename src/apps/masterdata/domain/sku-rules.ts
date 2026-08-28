import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString, type DecimalString } from "@platform/utilities/decimal";

export const SKU_KINDS = ["MATERIAL", "FURNITURE", "FIXTURE"] as const;
export type SkuKind = (typeof SKU_KINDS)[number];
export const SKU_STATUSES = ["DRAFT", "ACTIVE", "DISCONTINUED"] as const;
export type SkuStatus = (typeof SKU_STATUSES)[number];
export const SKU_MEDIA_KINDS = ["IMAGE", "THUMBNAIL", "ORIGINAL", "REFERENCE", "FOLDER"] as const;
export type SkuMediaKind = (typeof SKU_MEDIA_KINDS)[number];

export type SkuRelationState = {
  brand: { id: string; deletedAt: Date | null } | null;
  category: { id: string; kind: "PRODUCT" | "WORK"; deletedAt: Date | null } | null;
  baseUnit: { id: string; deletedAt: Date | null } | null;
  purchaseUnit: { id: string; deletedAt: Date | null } | null;
  dimensionUnit: { id: string; deletedAt: Date | null } | null;
  /// Current price rows of this SKU, one per supplier pair. Every row must
  /// stay aligned with the SKU's required price Unit.
  skuPrices: readonly { unitId: string }[];
};

export function assertSkuKind(value: string): asserts value is SkuKind { if (!SKU_KINDS.includes(value as SkuKind)) throw new AppError("VALIDATION", "SKU_KIND_INVALID", "SKU kind must be Material, Furniture, or Fixture."); }
export function assertSkuStatusTransition(from: SkuStatus, to: SkuStatus): void {
  const valid = (from === "DRAFT" && to === "ACTIVE") || (from === "ACTIVE" && to === "DISCONTINUED") || (from === "DISCONTINUED" && to === "ACTIVE");
  if (!valid) throw new AppError("INVARIANT", "SKU_STATUS_TRANSITION_INVALID", `SKU cannot transition from ${from} to ${to}.`);
}
export function optionalNonNegativeDecimal(value: string | null | undefined, code: string): DecimalString | null { if (value == null || value.trim() === "") return null; let decimal: DecimalString; try { decimal = toDecimalString(value.trim()); } catch { throw new AppError("VALIDATION", code, "Value must be a plain decimal string."); } if (compareDecimals(decimal, "0" as DecimalString) < 0) throw new AppError("VALIDATION", code, "Value cannot be negative."); return decimal; }
export function optionalPositiveDecimal(value: string | null | undefined, code: string): DecimalString | null { const decimal = optionalNonNegativeDecimal(value, code); if (decimal !== null && compareDecimals(decimal, "0" as DecimalString) <= 0) throw new AppError("VALIDATION", code, "Value must be greater than zero."); return decimal; }

export function assertSkuRelations(input: { status: SkuStatus; baseUnitId: string; purchaseUnitId: string | null; dimensionUnitId: string | null; categoryId: string | null; brandId: string | null; conversion: DecimalString | null; relations: SkuRelationState }): void {
  const r = input.relations;
  if (!r.baseUnit || r.baseUnit.id !== input.baseUnitId || r.baseUnit.deletedAt) throw new AppError("VALIDATION", "SKU_BASE_UNIT_INVALID", "Base Unit must exist and be live.");
  if (input.purchaseUnitId && (!r.purchaseUnit || r.purchaseUnit.id !== input.purchaseUnitId || r.purchaseUnit.deletedAt)) throw new AppError("VALIDATION", "SKU_PURCHASE_UNIT_INVALID", "Purchase Unit must exist and be live.");
  if (input.dimensionUnitId && (!r.dimensionUnit || r.dimensionUnit.id !== input.dimensionUnitId || r.dimensionUnit.deletedAt)) throw new AppError("VALIDATION", "SKU_DIMENSION_UNIT_INVALID", "Dimension Unit must exist and be live.");
  if (input.brandId && (!r.brand || r.brand.id !== input.brandId || r.brand.deletedAt)) throw new AppError("VALIDATION", "SKU_BRAND_INVALID", "Brand must exist and be live.");
  if (input.categoryId && (!r.category || r.category.id !== input.categoryId || r.category.deletedAt || r.category.kind !== "PRODUCT")) throw new AppError("VALIDATION", "SKU_CATEGORY_INVALID", "SKU Category must be a live Product Category.");
  if (input.purchaseUnitId && input.purchaseUnitId !== input.baseUnitId && input.conversion === null) throw new AppError("VALIDATION", "SKU_CONVERSION_REQUIRED", "Conversion is required when purchase and base Units differ.");
  const requiredPriceUnit = input.purchaseUnitId ?? input.baseUnitId;
  if (r.skuPrices.some((price) => price.unitId !== requiredPriceUnit)) throw new AppError("CONFLICT", "SKU_PRICE_UNIT_MISMATCH", "Update every SKU price Unit atomically before changing SKU Units.");
  if (input.status === "ACTIVE") {
    if (!input.categoryId) throw new AppError("INVARIANT", "SKU_ACTIVE_CATEGORY_REQUIRED", "An active SKU requires a live Product Category.");
    if (r.skuPrices.length === 0) throw new AppError("INVARIANT", "SKU_ACTIVE_PRICE_REQUIRED", "An active SKU requires at least one current supplier price.");
  }
}

export function normalizeSkuMedia<T extends { url: string }>(media: readonly T[]): T[] {
  const seen = new Set<string>();
  for (const item of media) { const url = item.url.trim(); if (!url) throw new AppError("VALIDATION", "SKU_MEDIA_URL_REQUIRED", "Media URL is required."); if (seen.has(url)) throw new AppError("CONFLICT", "SKU_MEDIA_URL_DUPLICATE", "Media URLs must be unique within a SKU."); seen.add(url); }
  return [...media];
}
