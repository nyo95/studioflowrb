import { AppError } from "@platform/core/errors";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";

export const categorySlug = toSlug;

export type CategoryKind = "PRODUCT" | "WORK";

export type CategoryParentCandidate = {
  id: string;
  kind: CategoryKind;
  path: string | null;
  deletedAt: Date | null;
  /** The candidate parent's ancestor IDs, ordered nearest-first or root-first. */
  ancestorIds: readonly string[];
};

export type CategoryDeleteReferences = {
  liveBrandCategories: number;
  nonDeletedSkus: number;
  liveWorkPrices: number;
  liveChildren: number;
};

export function buildCategoryPath(parentPath: string | null | undefined, name: string): string {
  const own = categorySlug(name);
  const parent = parentPath?.trim();
  return parent ? `${parent}/${own}` : own;
}

export function splitCategoryInput(value: string): { parent: string | null; child: string } {
  const parts = value.split(/[>/]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { parent: null, child: "" };
  if (parts.length === 1) return { parent: null, child: parts[0] };
  return { parent: parts.at(-2) ?? null, child: parts.at(-1) ?? "" };
}

/** Matching identity used only to normalize/deduplicate discovery synonyms. */
export function categorySearchKey(value: string): string {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US");
}

/** Keeps the first normalized display value and removes empty/equivalent aliases. */
export function normalizeCategorySynonyms(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const display = normalizeText(value);
    if (!display) continue;
    const key = categorySearchKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(display);
  }
  return normalized;
}

export function assertCategoryKindImmutable(current: CategoryKind, requested: CategoryKind): void {
  if (current !== requested) {
    throw new AppError(
      "INVARIANT",
      "CATEGORY_KIND_IMMUTABLE",
      "Category kind cannot be changed after creation.",
    );
  }
}

/**
 * Resolves the only legal persisted placement for a Category.
 * The application layer must load `parent` and its complete ancestor chain in
 * the same transaction used for the write and descendant-path propagation.
 */
export function resolveCategoryPlacement(input: {
  categoryId?: string;
  kind: CategoryKind;
  name: string;
  parent: CategoryParentCandidate | null;
}): { parentId: string | null; path: string | null } {
  if (input.kind === "PRODUCT") {
    if (input.parent !== null) {
      throw new AppError(
        "VALIDATION",
        "PRODUCT_CATEGORY_MUST_BE_FLAT",
        "Product categories cannot have a parent.",
      );
    }
    return { parentId: null, path: null };
  }

  const parent = input.parent;
  if (parent === null) {
    return { parentId: null, path: buildCategoryPath(null, input.name) };
  }
  if (parent.kind !== "WORK" || parent.deletedAt !== null || parent.path === null) {
    throw new AppError(
      "CONFLICT",
      "WORK_CATEGORY_PARENT_INVALID",
      "A work category parent must be a live work category.",
    );
  }
  if (
    input.categoryId !== undefined &&
    (parent.id === input.categoryId || parent.ancestorIds.includes(input.categoryId))
  ) {
    throw new AppError(
      "INVARIANT",
      "WORK_CATEGORY_CYCLE",
      "A work category cannot be moved below itself or one of its descendants.",
    );
  }
  return { parentId: parent.id, path: buildCategoryPath(parent.path, input.name) };
}

/** Rewrites a descendant path when its WORK ancestor is renamed or re-parented. */
export function rewriteDescendantCategoryPath(
  descendantPath: string,
  previousRootPath: string,
  nextRootPath: string,
): string {
  if (descendantPath === previousRootPath) return nextRootPath;
  const prefix = `${previousRootPath}/`;
  if (!descendantPath.startsWith(prefix)) {
    throw new AppError(
      "INVARIANT",
      "CATEGORY_DESCENDANT_PATH_MISMATCH",
      "A descendant path does not belong to the category subtree being updated.",
    );
  }
  return `${nextRootPath}/${descendantPath.slice(prefix.length)}`;
}

export function assertCategoryCanBeDeleted(references: CategoryDeleteReferences): void {
  const blockers = Object.entries(references)
    .filter(([, count]) => count > 0)
    .map(([name]) => name);
  if (blockers.length > 0) {
    throw new AppError(
      "CONFLICT",
      "CATEGORY_STILL_REFERENCED",
      "This category is still used by live records and cannot be deleted.",
      { details: { blockers } },
    );
  }
}

export function assertBrandCategoryTarget(category: {
  kind: CategoryKind;
  deletedAt: Date | null;
}): void {
  if (category.kind !== "PRODUCT" || category.deletedAt !== null) {
    throw new AppError(
      "VALIDATION",
      "BRAND_CATEGORY_REQUIRES_LIVE_PRODUCT",
      "Brand classification requires a live product category.",
    );
  }
}
