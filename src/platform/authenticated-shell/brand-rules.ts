/**
 * An identity shown as the top-left mark while the person is inside some areas of the product (owner 2026-10-15:
 * the contractor brand in BQ and Master Data, the consultant brand in StudioFlow). The apps own the identities; the
 * shell only matches the path.
 */
export type ShellAreaBrand = { rootPaths: readonly string[]; name: string; logoUrl: string | null };

/**
 * The top bar's mark, per the prototype's `.a-logo`. Initials for a multi-word
 * name; a name that is already an abbreviation is kept whole; a single
 * closed-up product name is split on its capitals, so "StudioFlow" reads "SF"
 * and not "S" — the previous rule took the first letter of each whitespace-
 * separated word, which yields exactly one letter for a one-word title.
 */
export function brandMark(name: string): string {
  const words = name.trim().split(/[\s_/-]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 3) return words[0].toUpperCase();
  const parts = words.flatMap((word) => word.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? [word]);
  const initials = parts.length > 1 ? parts.map((part) => part[0]).join("") : (parts[0] ?? "");
  return initials.slice(0, 3).toUpperCase();
}

export function areaBrandFor(pathname: string, areas: readonly ShellAreaBrand[]): ShellAreaBrand | null {
  return areas.find((area) => area.rootPaths.some((root) => pathname === root || pathname.startsWith(`${root}/`))) ?? null;
}
