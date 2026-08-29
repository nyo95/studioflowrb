/**
 * Pure pagination normalization helpers (CORE.md §13).
 *
 * Deterministic representation only: callers supply their own defaults and
 * maximum page size and their own sort keys. No app query, filter, ranking,
 * or business sort policy lives here.
 */

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return undefined;
  return value;
}

/** Normalizes a 1-based page number; falls back to `defaultPage` for invalid input. */
export function normalizePage(value: unknown, options: { defaultPage?: number } = {}): number {
  const fallback = toPositiveInteger(options.defaultPage) ?? 1;
  return toPositiveInteger(value) ?? fallback;
}

/**
 * Normalizes a page size against the caller-supplied default and maximum.
 * Invalid, zero, and negative values fall back to `defaultSize`; values above
 * `maxSize` are clamped to `maxSize`.
 */
export function normalizePageSize(
  value: unknown,
  options: { defaultSize: number; maxSize: number },
): number {
  const maxSize = toPositiveInteger(options.maxSize) ?? 1;
  const fallback = Math.min(toPositiveInteger(options.defaultSize) ?? maxSize, maxSize);
  return Math.min(toPositiveInteger(value) ?? fallback, maxSize);
}

/** Zero-based offset for a normalized page/size pair. */
export function calcOffset(page: number, pageSize: number): number {
  const safePage = toPositiveInteger(page) ?? 1;
  const safeSize = toPositiveInteger(pageSize) ?? 1;
  return (safePage - 1) * safeSize;
}

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  /** True when the requested page is beyond the last page and the total is non-zero. */
  outOfRange: boolean;
};

/**
 * Bounded page metadata from an explicit total. A requested page beyond the
 * last page is reported via `outOfRange` — clamping page numbers silently is
 * a caller decision, never a shared default.
 */
export function buildPageMeta(page: number, pageSize: number, total: number): PageMeta {
  const safePage = toPositiveInteger(page) ?? 1;
  const safeSize = toPositiveInteger(pageSize) ?? 1;
  const safeTotal = typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : 0;
  const pageCount = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeSize);
  return {
    page: safePage,
    pageSize: safeSize,
    total: safeTotal,
    pageCount,
    outOfRange: pageCount > 0 && safePage > pageCount,
  };
}

/** Normalizes a sort direction to `"asc" | "desc"`; anything else becomes `"asc"`. */
export function normalizeSortDirection(value: unknown): "asc" | "desc" {
  return value === "desc" ? "desc" : "asc";
}
