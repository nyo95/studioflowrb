import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSpreadsheetText } from "./patterns/clipboard";

describe("toSpreadsheetText", () => {
  it("joins cells with tabs and rows with line breaks, keeping each value in its own cell", () => {
    assert.equal(
      toSpreadsheetText([["PT-02", "PAINT", null, "Heart's\tDesire", "", "Pink tua\nSociolla"], ["PT-03", undefined]]),
      "PT-02\tPAINT\t\tHeart's Desire\t\tPink tua Sociolla\nPT-03\t",
    );
  });
});
