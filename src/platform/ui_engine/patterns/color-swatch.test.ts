import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeHex, swatchFileName, swatchSize } from "./color-swatch";

describe("colour swatch", () => {
  it("accepts short and long hex with or without #, in any case", () => {
    assert.equal(normalizeHex("#ABC"), "#aabbcc");
    assert.equal(normalizeHex(" 5a3e2b "), "#5a3e2b");
    assert.equal(normalizeHex("#5A3E2B"), "#5a3e2b");
  });

  it("refuses anything that is not a hex colour", () => {
    for (const value of ["", "#12", "#12345", "red", "#ggg000", "#1234567"]) assert.equal(normalizeHex(value), null);
  });

  it("sizes the swatch to the caller's aspect", () => {
    assert.deepEqual(swatchSize(4 / 5, 800), { width: 640, height: 800 });
    assert.deepEqual(swatchSize(16 / 9, 800), { width: 800, height: 450 });
    assert.deepEqual(swatchSize(undefined, 800), { width: 800, height: 800 });
  });

  it("names the file after the colour", () => {
    assert.equal(swatchFileName("#5a3e2b", "image/jpeg"), "color-5a3e2b.jpg");
    assert.equal(swatchFileName("#5a3e2b", "image/png"), "color-5a3e2b.png");
  });
});
