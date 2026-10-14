/**
 * Units as an estimator types them in the quick entry row (owner 2026-10-14): the studio's own code, or an office word
 * from the contractor's workbook ("titik", "m'") that the studio stores under another code. Pure, no I/O.
 */

/** Office words for units the studio stores under another code. */
const UNIT_ALIASES: Record<string, string> = { titik: "point", "m'": "m", m1: "m", mtr: "m", meter: "m", "lump sum": "ls", lumpsum: "ls", bh: "pcs", buah: "pcs" };

/** The office words, offered next to the studio's codes. */
export const UNIT_ALIAS_WORDS: readonly string[] = Object.keys(UNIT_ALIASES);

/** Resolves a typed unit to a studio unit code: the code itself, an office alias, or the text as typed (lowercase). */
export function resolveUnit(raw: string, knownUnits: readonly string[]): { unit: string; note: string | null } {
  const typed = raw.trim().toLowerCase();
  if (!typed) return { unit: "ls", note: "Satuan kosong → ls" };
  const known = new Set(knownUnits.map((unit) => unit.toLowerCase()));
  if (known.has(typed)) return { unit: typed, note: null };
  const alias = UNIT_ALIASES[typed];
  if (alias && known.has(alias)) return { unit: alias, note: `"${raw.trim()}" dibaca sebagai ${alias}` };
  return { unit: typed, note: `Satuan "${raw.trim()}" belum ada di Master Data` };
}
