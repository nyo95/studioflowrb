import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toDecimalString } from "@platform/utilities/decimal";

import { createMoney, formatMoney, isValidCurrencyCode } from "./index";

describe("currency validation", () => {
  it("accepts uppercase ISO-style three-letter codes only", () => {
    assert.equal(isValidCurrencyCode("IDR"), true);
    assert.equal(isValidCurrencyCode("USD"), true);
    assert.equal(isValidCurrencyCode("idr"), false);
    assert.equal(isValidCurrencyCode("USDD"), false);
    assert.equal(isValidCurrencyCode("US"), false);
    assert.equal(isValidCurrencyCode("US1"), false);
    assert.equal(isValidCurrencyCode(""), false);
  });
});

describe("createMoney", () => {
  it("normalizes the amount and keeps the explicit currency", () => {
    const value = createMoney("001234.500", "IDR");
    assert.deepEqual(value, { amount: "1234.5", currency: "IDR" });
  });

  it("accepts an already-canonical amount without revalidation cost drift", () => {
    const canonical = toDecimalString("-42.10");
    assert.deepEqual(createMoney(canonical, "USD"), { amount: "-42.1", currency: "USD" });
  });

  it("rejects non-uppercase or malformed currency codes", () => {
    assert.throws(() => createMoney("1", "idr"));
    assert.throws(() => createMoney("1", "EURO"));
  });
});

describe("formatMoney", () => {
  it("formats with an explicit currency and locale", () => {
    const value = createMoney("1234.5", "USD");
    assert.equal(formatMoney(value, { locale: "en-US" }), "$1,234.50");
  });

  it("renders IDR display for very large amounts without precision loss", () => {
    const value = createMoney("98765432109876543210987", "IDR");
    const formatted = formatMoney(value, { locale: "id-ID" });
    assert.ok(formatted.includes("Rp"));
    assert.equal(formatted, "Rp\u00A098.765.432.109.876.543.210.987,00");
    assert.ok(!/[eE]/.test(formatted));
  });

  it("rounds for display only and never mutates the stored value", () => {
    const value = createMoney("0.005", "USD");
    assert.equal(formatMoney(value, { locale: "en-US" }), "$0.01");
    assert.equal(value.amount, "0.005");
  });
});
