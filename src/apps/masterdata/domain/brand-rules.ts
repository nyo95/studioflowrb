import { AppError } from "@platform/core/errors";

import { assertBrandCategoryTarget } from "./category-rules";
import { assertPartyEligibleForRole } from "./party-rules";

export type BrandCategoryCandidate = { id: string; kind: "PRODUCT" | "WORK"; deletedAt: Date | null };
export type BrandSupplierCandidate = { id: string; deletedAt: Date | null; roles: readonly ("MATERIAL_SUPPLIER" | "WORK_VENDOR")[] };
export type BrandDeleteReferences = { liveSkus: number; scopedContacts: number };

export function assertBrandCategories(categories: readonly BrandCategoryCandidate[]): void {
  if (categories.length === 0) {
    throw new AppError("INVARIANT", "BRAND_REQUIRES_PRODUCT_CATEGORY", "A live Brand must have at least one explicit Product Category.");
  }
  for (const category of categories) assertBrandCategoryTarget(category);
}

export function assertBrandSuppliers(suppliers: readonly BrandSupplierCandidate[]): void {
  for (const supplier of suppliers) assertPartyEligibleForRole(supplier, "MATERIAL_SUPPLIER");
}

export function assertBrandCategoryCanBeRemoved(currentCategoryIds: readonly string[], removeId: string): void {
  if (currentCategoryIds.includes(removeId) && currentCategoryIds.length === 1) {
    throw new AppError("INVARIANT", "BRAND_REQUIRES_PRODUCT_CATEGORY", "A live Brand cannot lose its final Product Category.");
  }
}

export function assertBrandCanBeDeleted(references: BrandDeleteReferences): void {
  const blockers = Object.entries(references).filter(([, count]) => count > 0).map(([key]) => key);
  if (blockers.length) throw new AppError("CONFLICT", "BRAND_STILL_REFERENCED", "This Brand is still used by live records and cannot be deleted.", { details: { blockers } });
}
