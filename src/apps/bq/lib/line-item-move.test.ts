import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toDecimalString as decimal } from "@platform/utilities/decimal";
import { previewCalculationMove, type MoveCalculationItem } from "./line-item-move";

function item(): MoveCalculationItem {
  return {
    qty: decimal("2.345678"), markupL1Pct: decimal("12.5"), subObjects: [],
    lineItemsDirect: ["0.5", "0.333333", "1.234567"].map((qty, i) => ({ id: `line-${i}`, qty: decimal(qty), hargaSnapshot: decimal("33.333"), koefisien: decimal("1.111111") })),
  };
}

describe("BQ in-memory Cost Component move", () => {
  it("proves grouping truncated fractional lines with neutral factors leaves exact rate/total unchanged", () => {
    const original = item();
    const untouched = structuredClone(original);
    const preview = previewCalculationMove(original, ["line-2", "line-0", "line-1"], { newGroup: { qtyPerL1: decimal("1"), markupL2Pct: decimal("0") } });
    assert.equal(preview.changes, false);
    assert.deepEqual(preview.after, preview.before);
    assert.equal(preview.before.rate, "86.14");
    assert.equal(preview.before.total, "202.05");
    assert.deepEqual(original, untouched);
  });

  it("uses the same engine for quantity and markup changes and keeps the source input immutable", () => {
    const original = item();
    const untouched = structuredClone(original);
    const preview = previewCalculationMove(original, ["line-0", "line-1"], { newGroup: { qtyPerL1: decimal("2"), markupL2Pct: decimal("10") } });
    assert.equal(preview.changes, true);
    assert.notEqual(preview.before.rate, preview.after.rate);
    assert.notEqual(preview.before.total, preview.after.total);
    assert.deepEqual(original, untouched);
  });

  it("keeps same-parent selections in place while moving other parents' lines", () => {
    const original = item();
    original.subObjects = [{ id: "target", qtyPerL1: decimal("2"), markupL2Pct: decimal("0"), lineItems: [original.lineItemsDirect.pop()!] }];
    const preview = previewCalculationMove(original, ["line-2", "line-0"], { subObjectId: "target" });
    const expected = previewCalculationMove(original, ["line-0"], { subObjectId: "target" });
    assert.deepEqual(preview, expected);
    assert.equal(previewCalculationMove(original, ["line-2"], { subObjectId: "target" }).changes, false);
    assert.equal(previewCalculationMove(original, ["line-0"], { direct: true }).changes, false);
  });
});
