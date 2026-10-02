/**
 * Read-only semantic hints for the Library catalogue.
 *
 * These terms are deliberately ephemeral: they expand discovery only and do
 * not rewrite, persist, or synchronize Master Data tags.
 */
type SemanticTermGroup = {
  canonical: string;
  aliases: string[];
  related: string[];
};

const SEMANTIC_TERM_GROUPS: SemanticTermGroup[] = [
  { canonical: "chair", aliases: ["kursi"], related: ["bench", "stool", "armchair"] },
];

function normalizeTerm(value: string) {
  return value.trim().toLocaleLowerCase();
}

function groupForTerm(value: string) {
  const normalized = normalizeTerm(value);
  return SEMANTIC_TERM_GROUPS.find((group) =>
    [group.canonical, ...group.aliases, ...group.related].includes(normalized),
  );
}

/** Returns temporary alternate and related terms for a visible Library tag. */
export function relatedLibraryTerms(value: string) {
  const group = groupForTerm(value);
  if (!group) return [];

  return [...new Set([group.canonical, ...group.aliases, ...group.related])]
    .filter((term) => term !== normalizeTerm(value));
}

/** Expands a search phrase without changing the source tag or stored record. */
export function expandLibrarySearchTerms(value: string) {
  const normalized = normalizeTerm(value);
  if (!normalized) return [];

  const group = groupForTerm(normalized);
  return [...new Set([normalized, ...(group ? [group.canonical, ...group.aliases, ...group.related] : [])])];
}
