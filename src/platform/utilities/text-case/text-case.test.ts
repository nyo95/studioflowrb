import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lowerCaseText, titleCaseWords } from "./index";

describe("titleCaseWords", () => {
  it("capitalizes the first letter of each word and leaves every other character alone", () => {
    assert.equal(titleCaseWords("pasang keramik lantai"), "Pasang Keramik Lantai");
    assert.equal(titleCaseWords("MEP"), "MEP");
    assert.equal(titleCaseWords("pt mulia sejahtera adi"), "Pt Mulia Sejahtera Adi");
    assert.equal(titleCaseWords("PT Mulia sejahtera"), "PT Mulia Sejahtera");
    assert.equal(titleCaseWords("iPhone case"), "IPhone Case");
  });

  it("keeps digits, symbols, hyphens, apostrophes and accents intact", () => {
    assert.equal(titleCaseWords("supply & install floor 60x60"), "Supply & Install Floor 60x60");
    assert.equal(titleCaseWords("anti-slip o'brien"), "Anti-slip O'brien");
    assert.equal(titleCaseWords("élan café"), "Élan Café");
    assert.equal(titleCaseWords("(sample) 3mm"), "(sample) 3mm");
  });

  it("trims and collapses whitespace, and handles empty input", () => {
    assert.equal(titleCaseWords("  lantai   dua \n"), "Lantai Dua");
    assert.equal(titleCaseWords(""), "");
    assert.equal(titleCaseWords("   "), "");
  });

  it("is idempotent", () => {
    const once = titleCaseWords("flat ceiling hollow 20x40");
    assert.equal(titleCaseWords(once), once);
  });
});

describe("lowerCaseText", () => {
  it("lowers case and collapses whitespace", () => {
    assert.equal(lowerCaseText("  M2 "), "m2");
    assert.equal(lowerCaseText("Surface  FINISH"), "surface finish");
    assert.equal(lowerCaseText(""), "");
  });
});
