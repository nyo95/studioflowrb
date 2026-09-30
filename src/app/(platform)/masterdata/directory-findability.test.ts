import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lowestPriceByCurrencyUnit, matchesDirectoryStatus, normalizeIndonesiaPhone } from "./directory-findability";

describe("directory findability helpers", () => {
  it("keeps active and archived filtering explicit", () => {
    assert.equal(matchesDirectoryStatus(null, "ACTIVE"), true);
    assert.equal(matchesDirectoryStatus(new Date(), "ACTIVE"), false);
    assert.equal(matchesDirectoryStatus(new Date(), "ARCHIVED"), true);
  });
  it("only returns a normalized WhatsApp number for valid digits", () => {
    assert.equal(normalizeIndonesiaPhone("0812-3456-7890"), "6281234567890");
    assert.equal(normalizeIndonesiaPhone("abc"), null);
  });
  it("picks the lowest comparable display price", () => {
    assert.equal(lowestPriceByCurrencyUnit([{ amount: "20", currency: "IDR", unit: { code: "M" } }, { amount: "10", currency: "IDR", unit: { code: "M" } }])?.amount, "10");
  });
});
