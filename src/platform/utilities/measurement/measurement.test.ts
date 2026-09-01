import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateRectangleAreaSquareMeters } from "./index";

describe("calculateRectangleAreaSquareMeters", () => {
  it("converts millimetre, centimetre, and metre rectangles to exact square metres", () => {
    assert.equal(calculateRectangleAreaSquareMeters({ length: "1200", width: "2400", lengthToMeterFactor: "0.001" }), "2.88");
    assert.equal(calculateRectangleAreaSquareMeters({ length: "120", width: "240", lengthToMeterFactor: "0.01" }), "2.88");
    assert.equal(calculateRectangleAreaSquareMeters({ length: "1.2", width: "2.4", lengthToMeterFactor: "1" }), "2.88");
  });

  it("rounds deterministically at the requested persisted precision", () => {
    assert.equal(calculateRectangleAreaSquareMeters({ length: "1", width: "1", lengthToMeterFactor: "0.3333333" }), "0.111111");
  });

  it("rejects missing, zero, and negative measurements", () => {
    assert.throws(() => calculateRectangleAreaSquareMeters({ length: "", width: "2", lengthToMeterFactor: "1" }));
    assert.throws(() => calculateRectangleAreaSquareMeters({ length: "0", width: "2", lengthToMeterFactor: "1" }));
    assert.throws(() => calculateRectangleAreaSquareMeters({ length: "-1", width: "2", lengthToMeterFactor: "1" }));
  });
});
