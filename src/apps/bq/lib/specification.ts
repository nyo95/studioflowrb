/**
 * A suggested client specification for a Work Item from its Cost Components (owner 2026-10-14, "Isi dari rincian"):
 * their names in table order, each once, joined with " + ". Only a suggestion: it is copied into the Work Item's own
 * specification, which stays free text and never follows later changes of the components or Master Data.
 */
export const SPECIFICATION_MAX = 1000;

export function specificationFromComponents(item: {
  subObjects: readonly { lineItems: readonly { titleSnapshot: string }[] }[];
  lineItems: readonly { titleSnapshot: string }[];
}): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of [...item.subObjects.flatMap((group) => group.lineItems), ...item.lineItems]) {
    const name = line.titleSnapshot.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  let text = "";
  for (const name of names) {
    const next = text ? `${text} + ${name}` : name;
    if (next.length > SPECIFICATION_MAX) break;
    text = next;
  }
  return text;
}
