import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toDecimalString } from "@platform/utilities/decimal";

import { calculateItem, calculateLineItem, calculateProject } from "./calculation-engine";

const decimal = toDecimalString;

describe("BQ calculation engine", () => {
  it("keeps fractional markup exact until the BQ-defined truncation point", () => {
    const result = calculateItem({
      qty: decimal("1"), markupL1Pct: decimal("12.5"), hargaSnapshot: decimal("100"), koefisien: decimal("1"), subObjects: [], lineItemsDirect: [],
    });
    assert.equal(result.rate, "112.5");
    assert.equal(result.total, "112.5");
  });

  it("does not truncate an unnamed partial product before biaya_line", () => {
    assert.equal(calculateLineItem({ qty: decimal("100"), hargaSnapshot: decimal("0.045"), koefisien: decimal("1") }).biayaLine, "4.5");
  });

  it("multiplies an L2 subtotal by qty_per_l1 before its markup", () => {
    const result = calculateProject([{
      qty: decimal("3"), markupL1Pct: decimal("0"),
      subObjects: [{ qtyPerL1: decimal("2"), markupL2Pct: decimal("0"), lineItems: [{ qty: decimal("1"), hargaSnapshot: decimal("100"), koefisien: decimal("1") }] }],
      lineItemsDirect: [],
    }]);
    assert.equal(result.items[0]?.subObjects?.[0]?.subtotalL2Raw, "200");
    assert.equal(result.items[0]?.rate, "200");
    // L1.qty x L2.qty_per_l1 x L3.qty x harga x koefisien = 3 x 2 x 1 x 100 x 1
    assert.equal(result.grandTotal, "600");
  });

  it("applies compound L2 then L1 markup and truncates each named output", () => {
    const result = calculateProject([{
      qty: decimal("2"), markupL1Pct: decimal("10"),
      subObjects: [{ qtyPerL1: decimal("1"), markupL2Pct: decimal("12.5"), lineItems: [{ qty: decimal("1"), hargaSnapshot: decimal("100"), koefisien: decimal("1") }] }],
      lineItemsDirect: [],
    }]);
    assert.equal(result.items[0]?.subObjects?.[0]?.subtotalL2, "112.5");
    assert.equal(result.items[0]?.rate, "123.75");
    assert.equal(result.grandTotal, "247.5");
  });
});
