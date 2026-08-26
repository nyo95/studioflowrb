import { AppError } from "@platform/core/errors";
import { normalizeText } from "@platform/utilities/normalization";

export const UNIT_USAGES = ["DIMENSION", "QUANTITY", "USAGE", "PURCHASE", "RATE"] as const;
export type UnitUsage = (typeof UNIT_USAGES)[number];

export type UnitCandidate = {
  code: string;
  usages: readonly UnitUsage[];
  deletedAt: Date | null;
};

export type UnitDeleteReferences = {
  liveBaseUnitSkus: number;
  livePurchaseUnitSkus: number;
  liveDimensionUnitSkus: number;
  liveSkuPrices: number;
  liveWorkPrices: number;
};

export function unitSearchKey(value: string): string {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US");
}

export function normalizeUnitCode(value: string): string {
  const code = normalizeText(value);
  if (!code) {
    throw new AppError("VALIDATION", "UNIT_CODE_REQUIRED", "Unit code is required.");
  }
  return code;
}

export function assertUnitCodeImmutable(currentCode: string, requestedCode: string): void {
  if (normalizeUnitCode(currentCode) !== normalizeUnitCode(requestedCode)) {
    throw new AppError(
      "INVARIANT",
      "UNIT_CODE_IMMUTABLE",
      "Unit code cannot be changed after creation.",
    );
  }
}

export function normalizeUnitUsages(values: readonly UnitUsage[]): UnitUsage[] {
  const selected = new Set(values);
  return UNIT_USAGES.filter((usage) => selected.has(usage));
}

export function unitSupportsUsage(unit: UnitCandidate, usage: UnitUsage): boolean {
  return unit.deletedAt === null && unit.usages.includes(usage);
}

export function filterUnitsForUsage<T extends UnitCandidate>(units: readonly T[], usage: UnitUsage): T[] {
  return units.filter((unit) => unitSupportsUsage(unit, usage));
}

export function assertUnitCanBeDeleted(references: UnitDeleteReferences): void {
  const blockers = Object.entries(references)
    .filter(([, count]) => count > 0)
    .map(([name]) => name);
  if (blockers.length > 0) {
    throw new AppError(
      "CONFLICT",
      "UNIT_STILL_REFERENCED",
      "This unit is still used by live records and cannot be deleted.",
      { details: { blockers } },
    );
  }
}
