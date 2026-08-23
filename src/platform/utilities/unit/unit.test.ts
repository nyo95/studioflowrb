import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatUnitLabel } from "./index";

describe("formatUnitLabel", () => {
  it("uses the supplied display label when present", () => {
    assert.equal(formatUnitLabel("M2", "square meter"), "square meter");
  });

  it("falls back to the canonical unit code as-is", () => {
    assert.equal(formatUnitLabel("kg"), "kg");
    assert.equal(formatUnitLabel("m2"), "m2");
  });

  it("trims surrounding whitespace from code and label without converting", () => {
    assert.equal(formatUnitLabel("  kg  "), "kg");
    assert.equal(formatUnitLabel("kg", " kilogram "), "kilogram");
  });

  it("rejects empty unit codes instead of guessing", () => {
    assert.throws(() => formatUnitLabel(""));
    assert.throws(() => formatUnitLabel("   "));
  });

  it("performs no registry lookup or conversion between codes", () => {
    assert.notEqual(formatUnitLabel("cm"), formatUnitLabel("m"));
    assert.equal(formatUnitLabel("cm"), "cm");
  });
});
