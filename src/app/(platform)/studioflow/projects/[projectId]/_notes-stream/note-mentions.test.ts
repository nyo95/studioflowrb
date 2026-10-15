import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveNoteItemIds } from "./note-mentions";
import { createNoteReadSequence } from "./note-read-sequence";

it("resolves the complete normalized mention set, punctuation/escaped Markdown/repeats, and clears absent codes", async () => {
  const queries: string[] = [];
  const lookup = async (query: string) => {
    queries.push(query);
    return { ok: true as const, data: [{ entryId: query.toUpperCase().includes("02") ? "two" : "one", code: query.toUpperCase().includes("02") ? "HT-02" : "HT-01" }] };
  };
  assert.deepEqual(await resolveNoteItemIds("Use \\@ht\\-01, @HT1! then @HT-02)", lookup), ["one", "two"]);
  assert.equal(queries.length, 2, "normalized repeated codes need only one lookup");
  assert.deepEqual(await resolveNoteItemIds("Mention removed", lookup), []);
  assert.deepEqual(await resolveNoteItemIds("Only @HT-02.", lookup), ["two"]);
});

it("keeps ambiguous/unmatched codes plain and uses picked IDs only when their code remains in the text", async () => {
  const lookup = async () => ({ ok: true as const, data: [{ entryId: "one", code: "HT-01" }, { entryId: "other", code: "HT-01" }] });
  assert.deepEqual(await resolveNoteItemIds("@HT1 @HT2", lookup), []);
  assert.deepEqual(await resolveNoteItemIds("@HT1", lookup, new Map([["HT1", "picked"], ["HT2", "removed"]])), ["picked"]);
});

it("never returns a partial set on failed/thrown lookups and refuses more than ten unique entries", async () => {
  const error = { kind: "CONFLICT" as const, code: "LOOKUP_FAILED", safeMessage: "Try again." };
  await assert.rejects(resolveNoteItemIds("@HT1 @HT2", async (query) => query === "HT1" ? { ok: true, data: [{ entryId: "one", code: "HT-01" }] } : { ok: false, error }), /Try again/);
  await assert.rejects(resolveNoteItemIds("@HT1", async () => { throw new Error("private detail"); }), /Schedule items could not be loaded/);
  const text = Array.from({ length: 11 }, (_, n) => `@HT${n + 1}`).join(" ");
  await assert.rejects(resolveNoteItemIds(text, async (query) => ({ ok: true, data: [{ entryId: query, code: query }] })), /at most 10/);
});

it("invalidates reads across filter/page/refresh ordering and project unmount, including late requests", async () => {
  const sequence = createNoteReadSequence();
  const all = sequence.begin();
  const tag = sequence.begin();
  assert.equal(all(), false);
  assert.equal(tag(), true);
  const refreshedTag = sequence.begin();
  assert.equal(tag(), false);
  sequence.dispose();
  assert.equal(refreshedTag(), false);
  const lateOldProject = sequence.begin();
  assert.equal(lateOldProject(), false);
  sequence.resume();
  assert.equal(lateOldProject(), false, "effect replay cannot revive an earlier request");
  const newRead = sequence.begin();
  assert.equal(lateOldProject(), false);
  assert.equal(newRead(), true);
});
