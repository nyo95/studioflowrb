/**
 * Master Data permission IDs. The vocabulary is app-owned; Core RBAC only
 * evaluates grants. `dictionary` covers Unit and BusinessType. Foundation F0
 * exposes this catalog through the app's public boundary for registration.
 */
export const MASTERDATA_CATEGORY_READ = "masterdata.category.read";
export const MASTERDATA_CATEGORY_MANAGE = "masterdata.category.manage";
export const MASTERDATA_DICTIONARY_READ = "masterdata.dictionary.read";
export const MASTERDATA_DICTIONARY_MANAGE = "masterdata.dictionary.manage";
export const MASTERDATA_PARTY_READ = "masterdata.party.read";
export const MASTERDATA_PARTY_MANAGE = "masterdata.party.manage";
export const MASTERDATA_ACCESS = "masterdata.access";
export const MASTERDATA_BRAND_READ = "masterdata.brand.read";
export const MASTERDATA_BRAND_MANAGE = "masterdata.brand.manage";
export const MASTERDATA_SKU_READ = "masterdata.sku.read";
export const MASTERDATA_SKU_MANAGE = "masterdata.sku.manage";
export const MASTERDATA_PRICE_READ = "masterdata.price.read";
export const MASTERDATA_PRICE_MANAGE = "masterdata.price.manage";
export const MASTERDATA_AUDIT_READ = "masterdata.audit.read";
export const MASTERDATA_IMPORT_EXECUTE = "masterdata.import.execute";
export const MASTERDATA_EXPORT_READ = "masterdata.export.read";
export const MASTERDATA_DISCOVERY_READ = "masterdata.discovery.read";

export const MASTERDATA_PERMISSIONS = [
  MASTERDATA_ACCESS,
  MASTERDATA_PARTY_READ,
  MASTERDATA_PARTY_MANAGE,
  MASTERDATA_BRAND_READ,
  MASTERDATA_BRAND_MANAGE,
  MASTERDATA_CATEGORY_READ,
  MASTERDATA_CATEGORY_MANAGE,
  MASTERDATA_DICTIONARY_READ,
  MASTERDATA_DICTIONARY_MANAGE,
  MASTERDATA_SKU_READ,
  MASTERDATA_SKU_MANAGE,
  MASTERDATA_PRICE_READ,
  MASTERDATA_PRICE_MANAGE,
  MASTERDATA_AUDIT_READ,
  MASTERDATA_IMPORT_EXECUTE,
  MASTERDATA_EXPORT_READ,
  MASTERDATA_DISCOVERY_READ,
] as const;
