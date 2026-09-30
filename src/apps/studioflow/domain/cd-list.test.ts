import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drawingGroup, drawingNumber, normalizeDrawingCode } from "./cd-list";

describe("CD List drawing codes", () => {
  it("normalizes legacy prefixes and preserves the entered number", () => {
    assert.equal(normalizeDrawingCode("12"), "ID_12");
    assert.equal(normalizeDrawingCode("id-12.5"), "ID_12.5");
    assert.equal(normalizeDrawingCode("ARS_301"), "ID_301");
    assert.equal(normalizeDrawingCode(""), "ID_");
    assert.equal(normalizeDrawingCode("plan-a"), "ID_PLAN-A");
  });

  it("extracts numeric drawing groups and keeps non-numeric codes separate", () => {
    assert.equal(drawingNumber("ID_301.5"), 301.5);
    assert.equal(drawingNumber("ID_PLAN-A"), null);
    assert.equal(drawingGroup("ID_301.5"), "300");
    assert.equal(drawingGroup("ID_PLAN-A"), "-");
  });
});
