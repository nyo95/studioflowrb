import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertUnitCanBeDeleted,
  assertUnitCodeImmutable,
  filterUnitsForUsage,
  normalizeUnitCode,
  normalizeUnitUsages,
  unitSearchKey,
  unitSupportsUsage,
} from "./unit-rules";

describe("Unit controlled-dictionary rules", () => {
  it("trims codes but never guesses or changes them during update", () => {
    assert.equal(unitSearchKey(" Mètre "), "metre");
    assert.equal(normalizeUnitCode("  m2 "), "m2");
    assert.throws(() => normalizeUnitCode("   "), { code: "UNIT_CODE_REQUIRED" });
    assert.doesNotThrow(() => assertUnitCodeImmutable("m2", " m2 "));
    assert.throws(() => assertUnitCodeImmutable("m2", "sqm"), { code: "UNIT_CODE_IMMUTABLE" });
  });

  it("deduplicates usages in canonical order without adding conversion semantics", () => {
    assert.deepEqual(
      normalizeUnitUsages(["RATE", "PURCHASE", "RATE", "DIMENSION"]),
      ["DIMENSION", "PURCHASE", "RATE"],
    );
  });

  it("filters selectors by usage and excludes deleted units", () => {
    const live = { code: "m2", usages: ["USAGE", "RATE"] as const, deletedAt: null };
    const deleted = { code: "sqm", usages: ["USAGE"] as const, deletedAt: new Date() };
    const quantity = { code: "pcs", usages: ["QUANTITY"] as const, deletedAt: null };
    assert.equal(unitSupportsUsage(live, "USAGE"), true);
    assert.equal(unitSupportsUsage(live, "PURCHASE"), false);
    assert.deepEqual(filterUnitsForUsage([live, deleted, quantity], "USAGE"), [live]);
  });

  it("blocks deletion while any live canonical record references the unit", () => {
    assert.doesNotThrow(() => assertUnitCanBeDeleted({
      liveBaseUnitSkus: 0,
      livePurchaseUnitSkus: 0,
      liveDimensionUnitSkus: 0,
      liveSkuPrices: 0,
      liveWorkPrices: 0,
    }));
    assert.throws(() => assertUnitCanBeDeleted({
      liveBaseUnitSkus: 1,
      livePurchaseUnitSkus: 0,
      liveDimensionUnitSkus: 0,
      liveSkuPrices: 0,
      liveWorkPrices: 0,
    }), { code: "UNIT_STILL_REFERENCED" });
  });
});
