import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseIndonesianAmount, parsePastedAmount } from "./amount-format";

describe("pasted amounts", () => {
  it("reads Indonesian and spreadsheet number styles", () => {
    assert.equal(parsePastedAmount("135000"), "135000");
    assert.equal(parsePastedAmount("135.000"), "135000");
    assert.equal(parsePastedAmount("Rp 1.250.000"), "1250000");
    assert.equal(parsePastedAmount("135,000"), "135000");
    assert.equal(parsePastedAmount("12,5"), "12.5");
  });

  it("keeps a dash as no price, and By Request / TBC / 0 as a price on request", () => {
    assert.equal(parsePastedAmount("-"), "");
    assert.equal(parsePastedAmount(""), "");
    assert.equal(parsePastedAmount("N/A"), "");
    assert.equal(parsePastedAmount("By Request"), "0");
    assert.equal(parsePastedAmount("tbc"), "0");
    assert.equal(parsePastedAmount("Nego"), "0");
    assert.equal(parsePastedAmount("0"), "0");
  });

  it("typed amounts are read the Indonesian way", () => {
    assert.equal(parseIndonesianAmount("1.250,50"), "1250.50");
    assert.equal(parseIndonesianAmount(""), "");
  });
});
