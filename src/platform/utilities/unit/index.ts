/**
 * Domain-neutral unit representation helpers (CORE.md §9).
 *
 * The canonical unit vocabulary is Master Data-owned. Core only formats a
 * unit code/label for display: no registry, no compatibility, no conversion,
 * and no dimensional meaning.
 */

/**
 * Formats a unit for display: the supplied label wins when present, otherwise
 * the canonical unit code is shown as-is. Labels are presentation hints from
 * the owning dictionary, never authority classifiers.
 */
export function formatUnitLabel(unitCode: string, label?: string): string {
  const code = unitCode.trim();
  if (!code) throw new Error("Unit code must be a non-empty string.");
  const trimmedLabel = label?.trim();
  return trimmedLabel ? trimmedLabel : code;
}
