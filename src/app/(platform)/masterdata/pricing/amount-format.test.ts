import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blurDisplay, entryDisplay, isTextAmount, parseIndonesianAmount, parsePastedAmount, readTypedAmount, shouldShowAmountPrefix, storedAmountText } from "./amount-format";

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

describe("text prices in quotation marks", () => {
  it("recognizes text that starts with a straight or curly quote", () => {
    for (const text of ['"call sales"', '\u201ccall sales\u201d', '  "open', '"120"']) assert.equal(isTextAmount(text), true, text);
    for (const text of ["120", "Rp 1.000", "call sales", "", "By Request"]) assert.equal(isTextAmount(text), false, text);
  });

  it("lets a typed quote through and keeps typing the text, but still groups numbers", () => {
    assert.deepEqual(readTypedAmount('"call sa'), { value: '"call sa', display: '"call sa' });
    assert.deepEqual(readTypedAmount("1.250,50"), { value: "1250.50", display: "1.250,5" });
    assert.equal(entryDisplay('"call sa', '"call sa'), '"call sa');
    assert.equal(entryDisplay("1250", "1250"), "1.250");
    assert.equal(entryDisplay("12", "12,"), "12,");
    assert.equal(entryDisplay("", ""), "");
  });

  it("keeps text when the box is left and shows a stored label in quotes", () => {
    assert.equal(blurDisplay('"call sales"'), '"call sales"');
    assert.equal(blurDisplay("135000"), "135.000");
    assert.equal(blurDisplay(""), "");
    assert.equal(storedAmountText("0", "call sales"), '"call sales"');
    assert.equal(storedAmountText("135000", null), "135000");
  });

  it("passes a quoted pasted cell through, even when it looks like a number", () => {
    assert.equal(parsePastedAmount('"call sales"'), '"call sales"');
    assert.equal(parsePastedAmount('"120"'), '"120"');
    assert.equal(parsePastedAmount("120"), "120");
  });
});

describe("typed and pasted amounts agree", () => {
  it("reads every value a paste accepts the same way when it is typed", () => {
    for (const cell of ["135000", "135.000", "Rp 1.250.000", "12,5", "By Request", "tbc", "Nego", "0", "N/A", '"call sales"']) {
      assert.equal(readTypedAmount(cell)?.value, parsePastedAmount(cell), cell);
    }
  });

  it("keeps letters visible while typing so a keyword can be finished", () => {
    assert.deepEqual(readTypedAmount("By"), { value: "", display: "By" });
    assert.deepEqual(readTypedAmount("By Request"), { value: "0", display: "By Request" });
    assert.equal(blurDisplay(readTypedAmount("By Request")!.value), "0");
    assert.deepEqual(readTypedAmount("15000"), { value: "15000", display: "15.000" });
  });
});

describe("amount currency prefix", () => {
  it("shows for an empty or numeric price and hides for on-request or text prices", () => {
    assert.equal(shouldShowAmountPrefix("", ""), true);
    assert.equal(shouldShowAmountPrefix("15000", "15.000"), true);
    assert.equal(shouldShowAmountPrefix("15000", "Rp 15.000"), false);
    assert.equal(shouldShowAmountPrefix("0", "0"), false);
    assert.equal(shouldShowAmountPrefix("0.00", "0"), false);
    assert.equal(shouldShowAmountPrefix("0", "By Request"), false);
    assert.equal(shouldShowAmountPrefix('"call sales"', '"call sales"'), false);
  });
});
