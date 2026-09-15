/**
 * Project naming policy, ported from legacy `projectNamingPolicy`:
 * `[Year]-[Number] [Name]` with a space (not a dash) before the name.
 */
export const PROJECT_NAME_PATTERN = /^(\d{4})-(\d+) (\S.*)$/;

export function looksFormatted(name: string): boolean {
  return /^\d{4}-\d+ .+/.test(name.trim());
}

export function formatProjectName(year: number, sequence: number, readableName: string): string {
  return `${year}-${String(sequence).padStart(3, "0")} ${readableName.trim()}`;
}

/** Returns `{ code, year, sequence }` for a formatted name, or null. */
export function parseProjectName(name: string): { code: string; year: number; sequence: number; readable: string } | null {
  const match = PROJECT_NAME_PATTERN.exec(name.trim());
  if (!match) return null;
  return { code: `${match[1]}-${match[2]}`, year: Number(match[1]), sequence: Number(match[2]), readable: match[3] };
}
