import type { ActionResult } from "@platform/core/actions";

/** The existing chat dialect escapes punctuation when it saves Markdown. */
export function plainNoteText(text: string) {
  return text.replace(/\\([#@_*[\]-])/g, "$1");
}

export const noteCodeKey = (code: string) => code.replace(/^@/, "").replace(/-/g, "").replace(/^([A-Za-z]+)0*(\d+)$/, "$1$2").toUpperCase();
const CODE = /(?:^|\s)@([A-Za-z]{1,4}-?\d{1,3})(?=$|[\s.,!?;:)])/g;

/** Posting and editing send the complete set. A failed lookup must never save a partial set. */
export async function resolveNoteItemIds(
  body: string,
  lookup: (query: string) => Promise<ActionResult<readonly { entryId: string; code: string }[]>>,
  picked: ReadonlyMap<string, string> = new Map(),
): Promise<string[]> {
  const ids = new Set<string>();
  const codes = new Map([...plainNoteText(body).matchAll(CODE)].map((match) => [noteCodeKey(match[1]!), match[1]!]));
  for (const [key, query] of codes) {
    const known = picked.get(key);
    if (known) ids.add(known);
    else {
      let result: Awaited<ReturnType<typeof lookup>>;
      try { result = await lookup(query); }
      catch { throw new Error("Schedule items could not be loaded. Please try again."); }
      if (!result.ok) throw new Error(result.error.safeMessage);
      const exact = result.data.filter((item) => noteCodeKey(item.code) === key);
      if (exact.length === 1) ids.add(exact[0]!.entryId);
    }
  }
  if (ids.size > 10) throw new Error("Choose at most 10 schedule items.");
  return [...ids];
}
