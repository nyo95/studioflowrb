/**
 * BQ calculation engine. It is pure, server-only, and uses canonical decimal
 * strings exclusively. BQ owns its formula and two-decimal truncation policy;
 * the exact primitive arithmetic is reused from Foundation Utilities.
 */

import {
  addDecimals,
  divideDecimals,
  multiplyDecimals,
  toDecimalString,
  truncateDecimal,
  type DecimalString,
} from "@platform/utilities/decimal";

const TWO_DECIMALS = 2;
const MARKUP_DIVISION_PRECISION = 6;

function exactProduct(...values: DecimalString[]): DecimalString {
  return values.reduce((result, value) => multiplyDecimals(result, value), toDecimalString("1"));
}

function sum(values: DecimalString[]): DecimalString {
  return values.reduce((result, value) => addDecimals(result, value), toDecimalString("0"));
}

function truncate2(value: DecimalString): DecimalString {
  return truncateDecimal(value, TWO_DECIMALS);
}

function applyMarkup(value: DecimalString, markupPct: DecimalString): DecimalString {
  const multiplier = addDecimals(
    toDecimalString("1"),
    divideDecimals(markupPct, toDecimalString("100"), MARKUP_DIVISION_PRECISION),
  );
  return truncate2(multiplyDecimals(value, multiplier));
}

export type LineItemInput = {
  qty: DecimalString;
  hargaSnapshot: DecimalString;
  koefisien: DecimalString;
};

export type SubObjectInput = {
  qtyPerL1: DecimalString;
  markupL2Pct: DecimalString;
  lineItems: LineItemInput[];
};

export type ItemInput = {
  qty: DecimalString;
  markupL1Pct: DecimalString;
  subObjects: SubObjectInput[];
  lineItemsDirect: LineItemInput[];
  hargaSnapshot?: DecimalString;
  koefisien?: DecimalString;
};

export type LineItemResult = { biayaLine: DecimalString };

export type SubObjectResult = {
  subtotalL2Raw: DecimalString;
  subtotalL2: DecimalString;
  lineItems: LineItemResult[];
};

export type ItemResult = {
  biayaPokok?: DecimalString;
  rate: DecimalString;
  total: DecimalString;
  subObjects?: SubObjectResult[];
  lineItemsDirect: LineItemResult[];
};

export type ProjectResult = { items: ItemResult[]; grandTotal: DecimalString };

export function calculateLineItem(input: LineItemInput): LineItemResult {
  return { biayaLine: truncate2(exactProduct(input.qty, input.hargaSnapshot, input.koefisien)) };
}

export function calculateSubObject(input: SubObjectInput): SubObjectResult {
  const lineItems = input.lineItems.map(calculateLineItem);
  const subtotalL2Raw = truncate2(sum(lineItems.map((item) => item.biayaLine)));
  return { subtotalL2Raw, subtotalL2: applyMarkup(subtotalL2Raw, input.markupL2Pct), lineItems };
}

export function calculateItem(input: ItemInput): ItemResult {
  const lineItemsDirect = input.lineItemsDirect.map(calculateLineItem);
  const subObjects = input.subObjects.map(calculateSubObject);
  const hasChildren = subObjects.length > 0 || lineItemsDirect.length > 0;

  if (!hasChildren) {
    if (!input.hargaSnapshot || !input.koefisien) {
      throw new Error("A standalone L1 item requires hargaSnapshot and koefisien.");
    }
    const rate = applyMarkup(exactProduct(input.hargaSnapshot, input.koefisien), input.markupL1Pct);
    return { rate, total: truncate2(multiplyDecimals(rate, input.qty)), lineItemsDirect };
  }

  const biayaPokok = truncate2(sum([
    ...subObjects.map((item) => item.subtotalL2),
    ...lineItemsDirect.map((item) => item.biayaLine),
  ]));
  const rate = applyMarkup(biayaPokok, input.markupL1Pct);
  return { biayaPokok, rate, total: truncate2(multiplyDecimals(rate, input.qty)), subObjects, lineItemsDirect };
}

export function calculateProject(items: ItemInput[]): ProjectResult {
  const results = items.map(calculateItem);
  return { items: results, grandTotal: truncate2(sum(results.map((item) => item.total))) };
}
