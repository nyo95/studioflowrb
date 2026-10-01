import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

/** Pure display helpers shared by Master Data directories. Nothing here writes, converts or recomputes a price. */
export type DirectoryStatus = "ACTIVE" | "ARCHIVED" | "ALL";

export function matchesDirectoryStatus(deletedAt: Date | null, status: DirectoryStatus): boolean {
  return status === "ALL" || (status === "ACTIVE" ? deletedAt === null : deletedAt !== null);
}

export function normalizeIndonesiaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return normalized.length >= 8 && normalized.length <= 15 ? normalized : null;
}

/** Decimal-safe comparison of two stored amounts (no floating point); falls back to Number only for a value that is not a decimal string. */
export function compareAmounts(a: unknown, b: unknown): -1 | 0 | 1 {
  try {
    return compareDecimals(toDecimalString(String(a)), toDecimalString(String(b)));
  } catch {
    const left = Number(String(a));
    const right = Number(String(b));
    return left < right ? -1 : left > right ? 1 : 0;
  }
}

type Priced = { amount: unknown; currency: string; unit: { code: string } };

/** In the company's price lists a price of 0 means "depends on the request" (By Request); it is not a real zero price. */
export function isPriceOnRequest(amount: unknown): boolean {
  return compareAmounts(amount, "0") === 0;
}

/** The lowest price among rows; the caller decides what is comparable (see `lowestPricesByCurrencyUnit`). */
export function lowestPriceByCurrencyUnit<T extends Priced>(rows: readonly T[]): T | null {
  // A price on request is never "the lowest"; it only stands in when nothing in the group has a quoted price.
  const quoted = rows.filter((row) => !isPriceOnRequest(row.amount));
  return (quoted.length ? quoted : rows).reduce<T | null>((lowest, row) => (!lowest || compareAmounts(row.amount, lowest.amount) < 0 ? row : lowest), null);
}

/** One lowest price per currency and unit; prices in different currencies or units are never compared with each other. */
export function lowestPricesByCurrencyUnit<T extends Priced>(rows: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.currency}|${row.unit.code}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => lowestPriceByCurrencyUnit(group)!);
}

export function suppliedByNames(owner: { name: string } | null, suppliers: readonly { name: string }[]): string[] {
  return [...(owner ? [`${owner.name} (owner)`] : []), ...suppliers.map((supplier) => supplier.name)];
}

/**
 * Ids of the rows to mark "Lowest" in one item group: only when the group has at least two ACTIVE prices, all in one
 * currency and one unit; ties are all marked; archived rows are never marked and never counted; a mixed group is not marked.
 */
export function groupLowestRows<T extends Priced & { id: string; deleted_at: Date | null }>(rows: readonly T[]): Set<string> {
  const active = rows.filter((row) => row.deleted_at === null && !isPriceOnRequest(row.amount));
  if (active.length < 2) return new Set();
  if (new Set(active.map((row) => `${row.currency}|${row.unit.code}`)).size !== 1) return new Set();
  const lowest = lowestPriceByCurrencyUnit(active)!;
  return new Set(active.filter((row) => compareAmounts(row.amount, lowest.amount) === 0).map((row) => row.id));
}

export type PriceGroup<T> = { key: string; label: string; rows: T[]; lowestIds: Set<string> };

/**
 * "Group by item": groups ordered by item name, rows inside a group ordered by price ascending (archived rows after
 * the active ones, so the cheapest live price is always first; a mixed-currency or mixed-unit group is ordered by currency and unit
 * before amount), with the ids to badge as "Lowest".
 */
export function groupPriceRows<T extends Priced & { id: string; deleted_at: Date | null }>(rows: readonly T[], keyOf: (row: T) => string, labelOf: (row: T) => string): Array<PriceGroup<T>> {
  const groups = new Map<string, { label: string; rows: T[] }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { label: labelOf(row), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      // Comparable prices sit together: currency and unit first, so a mixed group never puts USD 45 above IDR 850,000 just because 45 < 850,000.
      rows: [...group.rows].sort((a, b) => (a.deleted_at === null ? 0 : 1) - (b.deleted_at === null ? 0 : 1) || a.currency.localeCompare(b.currency) || a.unit.code.localeCompare(b.unit.code) || compareAmounts(a.amount, b.amount)),
      lowestIds: groupLowestRows(group.rows),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));
}

/** "60 × 60 × 1 cm" from the stored dimensions, or "" when there are none. */
export function sizeText(dimensions: { length: string | null; width: string | null; thickness: string | null; unitCode: string | null }): string {
  const parts = [dimensions.length, dimensions.width, dimensions.thickness].filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length === 0) return "";
  return `${parts.join(" × ")}${dimensions.unitCode ? ` ${dimensions.unitCode}` : ""}`;
}

/** The label for a tab: the number of rows the current filters show. */
export function tabCountLabel(name: string, shown: number): string {
  return `${name} (${shown})`;
}

/** Brands a supplier carries: the brands it owns first, then the brands it is linked to, each once. */
export function carriedBrandNames(owned: readonly { id: string; name: string }[], linked: readonly { brand: { id: string; name: string } }[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const brand of [...owned, ...linked.map((item) => item.brand)]) {
    if (seen.has(brand.id)) continue;
    seen.add(brand.id);
    names.push(brand.name);
  }
  return names;
}
