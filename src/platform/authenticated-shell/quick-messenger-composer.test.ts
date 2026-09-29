import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { continueList, insertNewline, mergeFiles } from "./quick-messenger-composer";

const file = (name: string, size = 10) => ({ name, size }) as File;

describe("continueList", () => {
  it("continues bullet and star lists at the caret", () => {
    assert.deepEqual(continueList("- one", 5, 5), { value: "- one\n- ", caret: 8 });
    assert.deepEqual(continueList("* one", 5, 5), { value: "* one\n* ", caret: 8 });
  });

  it("counts ordered lists up and keeps indentation", () => {
    assert.deepEqual(continueList("1. a\n2. b", 9, 9), { value: "1. a\n2. b\n3. ", caret: 13 });
    assert.deepEqual(continueList("  - a", 5, 5), { value: "  - a\n  - ", caret: 10 });
  });

  it("moves text after the caret onto the new line", () => {
    assert.deepEqual(continueList("- ab", 3, 3), { value: "- a\n- b", caret: 6 });
  });

  it("exits the list on an empty item", () => {
    assert.deepEqual(continueList("- one\n- ", 8, 8), { value: "- one\n", caret: 6 });
    assert.deepEqual(continueList("1. ", 3, 3), { value: "", caret: 0 });
  });

  it("ignores ordinary lines, selections and a caret inside the prefix", () => {
    assert.equal(continueList("hello", 5, 5), null);
    assert.equal(continueList("-not a list", 11, 11), null);
    assert.equal(continueList("- one", 0, 5), null);
    assert.equal(continueList("- one", 1, 1), null);
  });
});

describe("insertNewline", () => {
  it("replaces the selection with a newline", () => {
    assert.deepEqual(insertNewline("abcd", 1, 3), { value: "a\nd", caret: 2 });
  });
});

describe("mergeFiles", () => {
  it("adds valid files", () => {
    const result = mergeFiles([], [file("a"), file("b")]);
    assert.equal(result.files.length, 2);
    assert.equal(result.error, null);
  });

  it("skips files over 10 MB and names them", () => {
    const result = mergeFiles([], [file("big", 10 * 1024 * 1024 + 1), file("ok")]);
    assert.deepEqual(result.files.map((f) => f.name), ["ok"]);
    assert.match(result.error ?? "", /big is over 10 MB/);
  });

  it("caps the selection at five files", () => {
    const result = mergeFiles([file("1"), file("2"), file("3"), file("4")], [file("5"), file("6"), file("7")]);
    assert.equal(result.files.length, 5);
    assert.match(result.error ?? "", /at most 5 files; 2 more/);
  });
});
