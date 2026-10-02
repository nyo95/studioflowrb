import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "@platform/core/errors";

import { parsePriceAmount } from "./price-amount";

const price = (amount: string, label: string | null) => ({ kind: "price", amount, label });

describe("parsePriceAmount (WO-MD-PRICE-LABEL-01)", () => {
  const priced: Array<[string, string, string | null]> = [
    ["120000", "120000", null],
    ["120000.50", "120000.5", null],
    ["  120000  ", "120000", null],
    ["Rp 120.50", "120.5", null],
    ["rp120000", "120000", null],
    ["0", "0", null],
    ['"call sales"', "0", "call sales"],
    ["“call sales”", "0", "call sales"],
    ['"120"', "0", "120"],
    ["“120”", "0", "120"],
    ['"open quote', "0", "open quote"],
    ['  "  per   project  "  ', "0", "per project"],
    ['"Per Project"', "0", "Per Project"],
    ["By Request", "0", null],
    ["by request", "0", null],
    ["TBC", "0", null],
    ["tba", "0", null],
    ["Nego", "0", null],
    ["Negotiable", "0", null],
  ];
  for (const [raw, amount, label] of priced) {
    it(`reads ${JSON.stringify(raw)} as ${label === null ? `amount ${amount}` : `label "${label}"`}`, () => assert.deepEqual(parsePriceAmount(raw), price(amount, label)));
  }

  for (const raw of ["", "   ", "-", "--", "n/a", "N/A"]) {
    it(`reports ${JSON.stringify(raw)} as not offered`, () => assert.deepEqual(parsePriceAmount(raw), { kind: "not-offered" }));
  }

  it("keeps a label of exactly 64 characters and rejects 65", () => {
    assert.deepEqual(parsePriceAmount(`"${"x".repeat(64)}"`), price("0", "x".repeat(64)));
    assert.throws(() => parsePriceAmount(`"${"x".repeat(65)}"`), (error) => error instanceof AppError && error.code === "PRICE_LABEL_TOO_LONG");
  });

  it("rejects empty quotes, unquoted words, and negative numbers with a clear code", () => {
    for (const raw of ['""', '“”', '" "']) assert.throws(() => parsePriceAmount(raw), (error) => error instanceof AppError && error.code === "PRICE_AMOUNT_INVALID", raw);
    for (const raw of ["call sales", "ask", "12abc"]) assert.throws(() => parsePriceAmount(raw), (error) => error instanceof AppError && error.code === "PRICE_AMOUNT_INVALID" && /quotation marks/.test(error.safeMessage), raw);
    assert.throws(() => parsePriceAmount("-5"), (error) => error instanceof AppError && error.code === "PRICE_AMOUNT_NEGATIVE");
  });
});
