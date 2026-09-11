import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCalcExpression } from "./calc-expression";

describe("resolveCalcExpression", () => {
  // ─── plain decimal passthrough ───────────────────────────────────────────
  it("returns a plain decimal unchanged", () => {
    assert.equal(resolveCalcExpression("1500"), "1500");
    assert.equal(resolveCalcExpression("0.5"), "0.5");
    assert.equal(resolveCalcExpression("  42  "), "42");
  });

  it("normalises a plain decimal (strips trailing zeros)", () => {
    assert.equal(resolveCalcExpression("1500.00"), "1500");
    assert.equal(resolveCalcExpression("0.50"), "0.5");
  });

  it("accepts negative plain decimal", () => {
    assert.equal(resolveCalcExpression("-5"), "-5");
    assert.equal(resolveCalcExpression("-0.25"), "-0.25");
  });

  // ─── = prefix ────────────────────────────────────────────────────────────
  it("strips a leading = and evaluates", () => {
    assert.equal(resolveCalcExpression("=15000*3"), "45000");
    assert.equal(resolveCalcExpression("=1200+800"), "2000");
  });

  // ─── multiplication ──────────────────────────────────────────────────────
  it("multiplies two decimals exactly", () => {
    assert.equal(resolveCalcExpression("0.5*80000"), "40000");
    assert.equal(resolveCalcExpression("15000*3"), "45000");
    assert.equal(resolveCalcExpression("1.5*2"), "3");
    assert.equal(resolveCalcExpression("0.75*4"), "3");
  });

  // ─── addition ────────────────────────────────────────────────────────────
  it("adds two decimals exactly", () => {
    assert.equal(resolveCalcExpression("1000+500"), "1500");
    assert.equal(resolveCalcExpression("0.1+0.2"), "0.3");
  });

  // ─── subtraction ─────────────────────────────────────────────────────────
  it("subtracts exactly", () => {
    assert.equal(resolveCalcExpression("1000-300"), "700");
    assert.equal(resolveCalcExpression("1-0.5"), "0.5");
  });

  // ─── division ────────────────────────────────────────────────────────────
  it("divides exactly when result is terminating", () => {
    assert.equal(resolveCalcExpression("6/3"), "2");
    assert.equal(resolveCalcExpression("10/4"), "2.5");
  });

  it("truncates non-terminating division to 10 decimal places", () => {
    assert.equal(resolveCalcExpression("1/3"), "0.3333333333");
  });

  it("returns null for division by zero", () => {
    assert.equal(resolveCalcExpression("5/0"), null);
  });

  // ─── operator precedence (* / before + -) ────────────────────────────────
  it("respects multiplication before addition", () => {
    assert.equal(resolveCalcExpression("2+3*4"), "14");
    assert.equal(resolveCalcExpression("10-2*3"), "4");
  });

  it("evaluates chains left to right within same precedence", () => {
    assert.equal(resolveCalcExpression("1+2+3"), "6");
    assert.equal(resolveCalcExpression("2*3*4"), "24");
  });

  // ─── whitespace ──────────────────────────────────────────────────────────
  it("ignores spaces", () => {
    assert.equal(resolveCalcExpression("1500 + 500"), "2000");
    assert.equal(resolveCalcExpression("= 15000 * 3"), "45000");
  });

  // ─── unary minus ─────────────────────────────────────────────────────────
  it("handles unary minus on the first operand", () => {
    assert.equal(resolveCalcExpression("-5*2"), "-10");
    assert.equal(resolveCalcExpression("=-3+10"), "7");
  });

  // ─── invalid input ───────────────────────────────────────────────────────
  it("returns null for empty or whitespace-only input", () => {
    assert.equal(resolveCalcExpression(""), null);
    assert.equal(resolveCalcExpression("   "), null);
  });

  it("returns null for non-numeric text", () => {
    assert.equal(resolveCalcExpression("abc"), null);
    assert.equal(resolveCalcExpression("15000x3"), null);
  });

  it("returns null for malformed numbers", () => {
    assert.equal(resolveCalcExpression("1.2.3"), null);
    assert.equal(resolveCalcExpression("1..2"), null);
  });

  it("returns null when expression is incomplete", () => {
    assert.equal(resolveCalcExpression("15000*"), null);
    assert.equal(resolveCalcExpression("*3"), null);
  });

  it("returns null for parentheses (not supported)", () => {
    assert.equal(resolveCalcExpression("(1+2)*3"), null);
  });
});
