/**
 * Inline tokens such as `@HT-01` or `#tile`: a trigger character at the start of a line or after a space, then word
 * characters. Pure text logic shared by `RichTextEditor` (caret token, highlights) and its tests; no app vocabulary.
 */

const WORD = "[A-Za-z0-9_-]";
const MAX = 32;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type TokenAtCaret = {
  trigger: string;
  /** What was typed between the trigger and the caret. */
  query: string;
  /** Offsets in the line: the trigger's position and the end of the token (which may run past the caret). */
  from: number;
  to: number;
};

/** The token the caret is in, given the line text before and after the caret; null when there is none. */
export function tokenAtCaret(before: string, after: string, triggers: readonly string[]): TokenAtCaret | null {
  const usable = triggers.filter((trigger) => trigger.length === 1);
  if (!usable.length) return null;
  const match = new RegExp(`(^|\\s)([${usable.map(escape).join("")}])(${WORD}{0,${MAX}})$`).exec(before);
  if (!match) return null;
  const rest = new RegExp(`^${WORD}*`).exec(after)?.[0] ?? "";
  if (match[3]!.length + rest.length > MAX) return null;
  const from = before.length - match[3]!.length - 1;
  return { trigger: match[2]!, query: match[3]!, from, to: before.length + rest.length };
}

/** Every match of `pattern` in `text` as [start, end) offsets; empty matches are skipped. */
export function tokenRanges(text: string, pattern: RegExp): [number, number][] {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const ranges: [number, number][] = [];
  for (const match of text.matchAll(global)) {
    if (!match[0]) continue;
    ranges.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }
  return ranges;
}

/** The text that replaces a token: a trailing space unless the line already continues with one. */
export function tokenReplacement(text: string, after: string): string {
  return /^\s/.test(after) ? text : `${text} `;
}
