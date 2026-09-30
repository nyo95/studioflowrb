/** Pure display helpers shared by Master Data directories. */
export type DirectoryStatus = "ACTIVE" | "ARCHIVED" | "ALL";

export function matchesDirectoryStatus(deletedAt: Date | null, status: DirectoryStatus): boolean {
  return status === "ALL" || (status === "ACTIVE" ? deletedAt === null : deletedAt !== null);
}

export function normalizeIndonesiaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return normalized.length >= 8 && normalized.length <= 15 ? normalized : null;
}

export function lowestPriceByCurrencyUnit<T extends { amount: unknown; currency: string; unit: { code: string } }>(rows: readonly T[]): T | null {
  return rows.reduce<T | null>((lowest, row) => {
    if (!lowest || Number(String(row.amount)) < Number(String(lowest.amount))) return row;
    return lowest;
  }, null);
}

export function suppliedByNames(owner: { name: string } | null, suppliers: readonly { name: string }[]): string[] {
  return [...(owner ? [`${owner.name} (owner)`] : []), ...suppliers.map((supplier) => supplier.name)];
}

export function groupLowestRows<T extends { id: string; amount: unknown; currency: string; unit: { code: string }; deleted_at: Date | null }>(rows: readonly T[]): Set<string> {
  const active = rows.filter((row) => row.deleted_at === null);
  if (active.length < 2) return new Set();
  const keys = new Set(active.map((row) => `${row.currency}|${row.unit.code}`));
  if (keys.size !== 1) return new Set();
  const amount = Math.min(...active.map((row) => Number(String(row.amount))));
  return new Set(active.filter((row) => Number(String(row.amount)) === amount).map((row) => row.id));
}

export function lowestPricesByCurrencyUnit<T extends { amount: unknown; currency: string; unit: { code: string } }>(rows: readonly T[]): T[] {
  return [...new Map(rows.map((row) => [`${row.currency}|${row.unit.code}`, row] as const)).entries()].map(([key]) => lowestPriceByCurrencyUnit(rows.filter((row) => `${row.currency}|${row.unit.code}` === key))!).filter(Boolean);
}
