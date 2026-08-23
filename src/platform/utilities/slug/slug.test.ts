import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSlug } from "./index";

describe("toSlug", () => {
  it("normalizes accents, whitespace, punctuation, edges, and empty input", () => {
    assert.equal(toSlug("PT Café Créme"), "pt-cafe-creme");
    assert.equal(toSlug("  TACO\tHPL  "), "taco-hpl");
    assert.equal(toSlug("A---B__C!!!"), "a-b-c");
    assert.equal(toSlug("!!!"), "");
    assert.equal(toSlug(""), "");
  });

  it("is idempotent", () => {
    for (const value of ["PT Café Créme", "  A / B  ", "", "Müller Överström"]) {
      assert.equal(toSlug(toSlug(value)), toSlug(value));
    }
  });
});
