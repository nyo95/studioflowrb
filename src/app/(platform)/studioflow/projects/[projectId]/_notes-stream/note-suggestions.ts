import { noteCodeKey, plainNoteText } from "./note-mentions";

export const NOTE_CODE_PATTERN = /(?<=^|\s)@[A-Za-z]{1,4}-?\d{1,3}(?=$|[\s.,!?;:)])/g;

export function inlineNoteItem<T extends { code: string }>(match: string, items: readonly T[]): T | undefined {
  return items.find((item) => noteCodeKey(item.code) === noteCodeKey(match));
}

export function remainingNoteItems<T extends { code: string }>(body: string, items: readonly T[]): T[] {
  const mentioned = new Set([...plainNoteText(body).matchAll(NOTE_CODE_PATTERN)].map((match) => noteCodeKey(match[0])));
  return items.filter((item) => !mentioned.has(noteCodeKey(item.code)));
}

export type Suggestion = { key: string; label: string; detail: string | null; location?: string | null; thumbnailUrl?: string | null; insert: string; entryId?: string };
export type SuggestionState = { request: number; status: "closed" | "loading" | "results" | "empty" | "error"; list: readonly Suggestion[]; error?: string };
export type SuggestionEvent = { type: "start"; request: number } | { type: "close"; request: number } | { type: "loaded"; request: number; list: readonly Suggestion[] } | { type: "failed"; request: number; error: string };

/** A response can only settle the request that is still open. Closing/retrying invalidates every older response. */
export function suggestionState(state: SuggestionState, event: SuggestionEvent): SuggestionState {
  if (event.type === "start" || event.type === "close") return { request: event.request, status: event.type === "start" ? "loading" : "closed", list: [] };
  if (event.request !== state.request || state.status !== "loading") return state;
  if (event.type === "loaded") return { request: state.request, status: event.list.length ? "results" : "empty", list: event.list };
  return { request: state.request, status: "error", list: [], error: event.error };
}

export function suggestionPosition(caret: { left: number; top: number }, wrapper: { left: number; bottom: number; width: number }, popupWidth: number) {
  return {
    left: Math.max(8, Math.min(caret.left - wrapper.left, wrapper.width - popupWidth - 8)),
    bottom: wrapper.bottom - caret.top + 6,
  };
}
