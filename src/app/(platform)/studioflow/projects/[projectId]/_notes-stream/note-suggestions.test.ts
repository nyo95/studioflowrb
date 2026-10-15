import assert from "node:assert/strict";
import { test } from "node:test";

import { inlineNoteItem, remainingNoteItems, suggestionPosition, suggestionState, type SuggestionState } from "./note-suggestions";

test("suggestions immediately load, settle results/empty/error, retry and ignore late responses after change/close", () => {
  let state: SuggestionState = { request: 0, status: "closed", list: [] };
  state = suggestionState(state, { type: "start", request: 1 });
  assert.equal(state.status, "loading");
  const row = { key: "a", label: "HT-01", insert: "@HT-01", detail: null };
  state = suggestionState(state, { type: "loaded", request: 1, list: [row] });
  assert.equal(state.status, "results");
  state = suggestionState(state, { type: "start", request: 2 });
  assert.strictEqual(suggestionState(state, { type: "loaded", request: 1, list: [row] }), state);
  assert.strictEqual(suggestionState(state, { type: "failed", request: 1, error: "old" }), state);
  state = suggestionState(state, { type: "loaded", request: 2, list: [] });
  assert.equal(state.status, "empty");
  state = suggestionState(state, { type: "start", request: 3 });
  state = suggestionState(state, { type: "failed", request: 3, error: "Try again" });
  assert.equal(state.status, "error");
  assert.equal(state.error, "Try again");
  state = suggestionState(state, { type: "start", request: 4 }); // Retry
  assert.equal(state.status, "loading");
  state = suggestionState(state, { type: "close", request: 5 });
  assert.strictEqual(suggestionState(state, { type: "loaded", request: 4, list: [row] }), state);
  assert.equal(state.status, "closed");
  state = suggestionState(state, { type: "start", request: 6 });
  state = suggestionState(state, { type: "loaded", request: 6, list: [row] });
  assert.deepEqual(state.list, [row]);
});

test("popup is above the caret and clamps both horizontal edges including a phone-width wrapper", () => {
  const wrapper = { left: 100, bottom: 600, width: 600 };
  assert.deepEqual(suggestionPosition({ left: 240, top: 450 }, wrapper, 352), { left: 140, bottom: 156 });
  assert.equal(suggestionPosition({ left: 90, top: 450 }, wrapper, 352).left, 8);
  assert.equal(suggestionPosition({ left: 690, top: 450 }, wrapper, 352).left, 240);
  assert.equal(suggestionPosition({ left: 360, top: 450 }, { left: 0, bottom: 600, width: 375 }, 359).left, 8);
});

test("inline chips normalize codes and escaped hyphens, leave unknown codes plain and retain explicit links", () => {
  const tile = { code: "HT-01", entryId: "tile" };
  const explicit = { code: "L-02", entryId: "light" };
  assert.equal(inlineNoteItem("@ht1", [tile]), tile);
  assert.equal(inlineNoteItem("@HT-01", [tile]), tile);
  assert.equal(inlineNoteItem("@HT-99", [tile]), undefined);
  assert.deepEqual(remainingNoteItems("Before @ht1, after @HT\\-01!", [tile, explicit]), [explicit]);
  assert.deepEqual(remainingNoteItems("Unlinked @HT-99 and email@ht1", [tile, explicit]), [tile, explicit]);
});
