import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareDecimals, isDecimalString, toDecimalString } from "./index";

describe("toDecimalString normalization", () => {
  it("normalizes sign, leading zeros, and trailing fractional zeros", () => {
    assert.equal(toDecimalString("1234.5000"), "1234.5");
    assert.equal(toDecimalString("-00012.3400"), "-12.34");
    assert.equal(toDecimalString("+7"), "7");
    assert.equal(toDecimalString("007"), "7");
    assert.equal(toDecimalString(".5"), "0.5");
    assert.equal(toDecimalString("-.25"), "-0.25");
    assert.equal(toDecimalString("0.000"), "0");
    assert.equal(toDecimalString("-0.00"), "0");
    assert.equal(toDecimalString("0"), "0");
    assert.equal(toDecimalString("42"), "42");
  });

  it("rejects empty, malformed, locale-separated, and non-finite input", () => {
    const invalid = [
      "",
      "   ",
      ".",
      "1.",
      "+.",
      "1,000",
      "1 000",
      "1e5",
      "NaN",
      "Infinity",
      "-Infinity",
      "abc",
      "12.34.56",
      "--1",
      "1-2",
    ];
    for (const value of invalid) {
      assert.throws(() => toDecimalString(value), Error, `expected rejection: "${value}"`);
    }
  });

  it("preserves very large and highly fractional values without scientific notation", () => {
    const huge = "98765432109876543210987.000098765432109876543210";
    assert.equal(toDecimalString(huge), "98765432109876543210987.00009876543210987654321");
    const tinyNegative = "-0.0000012300000";
    assert.equal(toDecimalString(tinyNegative), "-0.00000123");
  });

  it("keeps negative zero as plain zero", () => {
    assert.equal(toDecimalString("-0"), "0");
  });
});

describe("isDecimalString guard", () => {
  it("accepts only canonical output values", () => {
    assert.equal(isDecimalString("12.34"), true);
    assert.equal(isDecimalString("0"), true);
    assert.equal(isDecimalString("-7"), true);
    assert.equal(isDecimalString("+7"), false);
    assert.equal(isDecimalString("007"), false);
    assert.equal(isDecimalString("1.50"), false);
    assert.equal(isDecimalString(".5"), false);
    assert.equal(isDecimalString(12), false);
    assert.equal(isDecimalString(null), false);
  });
});

describe("compareDecimals", () => {
  it("orders magnitudes, signs, zeros, and fractions correctly", () => {
    const d = toDecimalString;
    assert.equal(compareDecimals(d("2"), d("10")), -1);
    assert.equal(compareDecimals(d("10"), d("2")), 1);
    assert.equal(compareDecimals(d("-2"), d("-10")), 1);
    assert.equal(compareDecimals(d("-10"), d("-2")), -1);
    assert.equal(compareDecimals(d("2"), d("-10")), 1);
    assert.equal(compareDecimals(d("-0.01"), d("0")), -1);
    assert.equal(compareDecimals(d("0"), d("0")), 0);
    assert.equal(compareDecimals(d("1.25"), d("1.2500")), 0);
    assert.equal(compareDecimals(d("1.2"), d("1.21")), -1);
    assert.equal(compareDecimals(d("0.001"), d("0.0001")), 1);
    assert.equal(compareDecimals(d("-1.21"), d("-1.2")), -1);
    assert.equal(
      compareDecimals(d("99999999999999999999999.1"), d("100000000000000000000000")),
      -1,
    );
  });
});
