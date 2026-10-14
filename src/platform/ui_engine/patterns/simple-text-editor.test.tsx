import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toggleListText } from "./simple-text-editor";

const apply = (value: string, start: number, end: number, kind: "bullet" | "number") => {
  const change = toggleListText(value, start, end, kind);
  return value.slice(0, change.from) + change.text + value.slice(change.to);
};

describe("SimpleTextEditor list buttons", () => {
  it("start a list on an empty note or an empty line", () => {
    assert.equal(apply("", 0, 0, "bullet"), "- ");
    assert.equal(apply("", 0, 0, "number"), "1. ");
    assert.equal(apply("- first\n", 8, 8, "bullet"), "- first\n- ");
    assert.equal(toggleListText("", 0, 0, "bullet").caret, "end", "the caret lands after the marker, ready to type");
  });

  it("mark, number and unmark the selected lines, skipping empty ones", () => {
    assert.equal(apply("a\n\nb", 0, 4, "bullet"), "- a\n\n- b");
    assert.equal(apply("a\nb", 0, 3, "number"), "1. a\n2. b");
    assert.equal(apply("- a\n- b", 0, 7, "bullet"), "a\nb");
    assert.equal(apply("1. a\nb", 0, 6, "bullet"), "- a\n- b");
  });
});
