/**
 * Pure composer rules for the quick-messenger popup. The message stays plain
 * text; nothing here changes what is stored or rendered.
 */

export const QUICK_MESSENGER_MAX_FILES = 5;
export const QUICK_MESSENGER_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ListEdit = { value: string; caret: number };

const LIST_LINE = /^([ \t]*)([-*]|\d{1,9}\.)[ \t]/;

/**
 * Enter inside a plain-text list. Returns the edited text, or null when the
 * caret is not on a `- `, `* ` or `1. ` line (or a range is selected), so the
 * caller falls back to its normal Enter behaviour.
 *
 * - Line with content after the prefix: split at the caret and start the next
 *   line with the same prefix (ordered numbers count up).
 * - Line holding only the prefix: drop it, leaving an empty line, i.e. exit
 *   the list.
 */
export function continueList(value: string, selectionStart: number, selectionEnd: number): ListEdit | null {
  if (selectionStart !== selectionEnd) return null;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const newlineAt = value.indexOf("\n", selectionStart);
  const lineEnd = newlineAt === -1 ? value.length : newlineAt;
  const line = value.slice(lineStart, lineEnd);
  const match = LIST_LINE.exec(line);
  if (!match) return null;

  const prefixEnd = lineStart + match[0].length;
  if (selectionStart < prefixEnd) return null;

  const [, indent, marker] = match;
  if (line.slice(match[0].length).trim() === "") {
    return { value: value.slice(0, lineStart) + value.slice(lineEnd), caret: lineStart };
  }

  const nextMarker = /^\d/.test(marker) ? `${Number.parseInt(marker, 10) + 1}.` : marker;
  const insert = `\n${indent}${nextMarker} `;
  return {
    value: value.slice(0, selectionStart) + insert + value.slice(selectionStart),
    caret: selectionStart + insert.length,
  };
}

/** Plain newline at the selection (Alt+Enter, which browsers do not insert on their own). */
export function insertNewline(value: string, selectionStart: number, selectionEnd: number): ListEdit {
  return {
    value: `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`,
    caret: selectionStart + 1,
  };
}

export type FileSelection = { files: File[]; error: string | null };

/**
 * One selection path for both the `+` picker and drag-and-drop. Files that
 * break a limit are skipped and named; the server re-checks everything and
 * stays the authority.
 */
export function mergeFiles(current: File[], incoming: File[]): FileSelection {
  const files = [...current];
  const tooBig: string[] = [];
  let overflow = 0;
  for (const file of incoming) {
    if (file.size > QUICK_MESSENGER_MAX_FILE_BYTES) {
      tooBig.push(file.name);
    } else if (files.length >= QUICK_MESSENGER_MAX_FILES) {
      overflow += 1;
    } else {
      files.push(file);
    }
  }
  const problems: string[] = [];
  if (tooBig.length > 0) problems.push(`${tooBig.join(", ")} ${tooBig.length === 1 ? "is" : "are"} over 10 MB and was not attached.`);
  if (overflow > 0) problems.push(`Attach at most ${QUICK_MESSENGER_MAX_FILES} files; ${overflow} more not added.`);
  return { files, error: problems.length > 0 ? problems.join(" ") : null };
}
