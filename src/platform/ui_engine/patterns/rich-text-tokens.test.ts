import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tokenAtCaret, tokenRanges, tokenReplacement } from "./rich-text-tokens";

const AT = ["@", "#"];

describe("tokenAtCaret", () => {
  it("opens on a bare trigger at the start of a line or after a space", () => {
    assert.deepEqual(tokenAtCaret("@", "", AT), { trigger: "@", query: "", from: 0, to: 1 });
    assert.deepEqual(tokenAtCaret("see #", "", AT), { trigger: "#", query: "", from: 4, to: 5 });
  });

  it("reports the typed query and extends the range over the rest of the word, mid-text", () => {
    assert.deepEqual(tokenAtCaret("Use @HT", "-01 here", AT), { trigger: "@", query: "HT", from: 4, to: 10 });
    assert.deepEqual(tokenAtCaret("Use @HT-01", " here", AT), { trigger: "@", query: "HT-01", from: 4, to: 10 });
  });

  it("ignores triggers inside a word, after punctuation, past a space or too long", () => {
    assert.equal(tokenAtCaret("mail@HT", "", AT), null);
    assert.equal(tokenAtCaret("(@HT", "", AT), null);
    assert.equal(tokenAtCaret("@HT ", "", AT), null);
    assert.equal(tokenAtCaret(`@${"a".repeat(33)}`, "", AT), null);
    assert.equal(tokenAtCaret("@abc", "x".repeat(30), AT), null);
  });

  it("only knows the triggers it is given and escapes regex characters", () => {
    assert.equal(tokenAtCaret("#tile", "", ["@"]), null);
    assert.deepEqual(tokenAtCaret("+a", "", ["+"]), { trigger: "+", query: "a", from: 0, to: 2 });
    assert.equal(tokenAtCaret("@a", "", []), null);
  });
});

describe("tokenRanges", () => {
  it("finds every match with or without the global flag and skips empty matches", () => {
    assert.deepEqual(tokenRanges("@HT1 and @CL-02.", /@[A-Z]+-?\d+/), [[0, 4], [9, 15]]);
    assert.deepEqual(tokenRanges("aaa", /x*/g), []);
  });
});

describe("tokenReplacement", () => {
  it("adds one trailing space unless the text already continues with whitespace", () => {
    assert.equal(tokenReplacement("@HT-01", ""), "@HT-01 ");
    assert.equal(tokenReplacement("@HT-01", " rest"), "@HT-01");
    assert.equal(tokenReplacement("@HT-01", ", rest"), "@HT-01 ");
  });
});
