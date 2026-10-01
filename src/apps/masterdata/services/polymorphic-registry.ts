/** Canonical closed sets for Master Data polymorphic persistence. */
export const MASTERDATA_DELETION_TARGET_TYPES = [
  "brand", "vendor", "sku", "unit", "category", "vendor_type",
  "price_material", "price_material_labor", "price_labor",
] as const;

export const MASTERDATA_ARCHIVE_ENTITY_TYPES = [...MASTERDATA_DELETION_TARGET_TYPES] as const;

export type MasterDataDeletionTargetType = (typeof MASTERDATA_DELETION_TARGET_TYPES)[number];
export type MasterDataArchiveEntityType = (typeof MASTERDATA_ARCHIVE_ENTITY_TYPES)[number];

export function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}
