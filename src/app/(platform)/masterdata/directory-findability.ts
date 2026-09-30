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
