import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

const ZERO = toDecimalString("0");
const ON_REQUEST = /^(by\s*request|tbc|tba|nego|negotiable)$/i;
const NOT_OFFERED = /^(|-+|n\/a)$/i;
const QUOTE_START = /^["\u201c\u201d]/;
export const PRICE_LABEL_MAX_LENGTH = 64;

export type ParsedPriceAmount = { kind: "price"; amount: string; label: string | null } | { kind: "not-offered" };

/**
 * The single grammar for an amount that a person types or a workbook cell holds (WO-MD-PRICE-LABEL-01):
 * - text that starts with a quotation mark is a text price: amount 0 and the quoted words as the label, even when the words look like a number;
 * - By Request, TBC, TBA, Nego, Negotiable are a price on request without a label;
 * - an empty value, "-" or "n/a" is "not offered" (callers decide: a grid skips it, a single form rejects it);
 * - anything else must be a plain decimal ("120000", "120000.50", optional "Rp"), non-negative.
 * Indonesian display styles ("1.250.000,50") are normalized to a plain decimal by the screen or importer before this runs.
 */
export function parsePriceAmount(raw: string): ParsedPriceAmount {
  const value = raw.trim();
  if (NOT_OFFERED.test(value)) return { kind: "not-offered" };
  if (QUOTE_START.test(value)) {
    const label = value.replace(/^["\u201c\u201d]+/, "").replace(/["\u201c\u201d]+$/, "").trim().replace(/\s+/g, " ");
    if (!label) throw new AppError("VALIDATION", "PRICE_AMOUNT_INVALID", "A text price needs words between the quotation marks.");
    if (label.length > PRICE_LABEL_MAX_LENGTH) throw new AppError("VALIDATION", "PRICE_LABEL_TOO_LONG", `A text price can be at most ${PRICE_LABEL_MAX_LENGTH} characters. Put longer detail in Notes.`);
    return { kind: "price", amount: ZERO, label };
  }
  if (ON_REQUEST.test(value)) return { kind: "price", amount: ZERO, label: null };
  let amount: ReturnType<typeof toDecimalString>;
  try { amount = toDecimalString(value.replace(/^rp\.?\s*/i, "")); } catch { throw new AppError("VALIDATION", "PRICE_AMOUNT_INVALID", "Enter a number, or put text in quotation marks, for example \"call sales\"."); }
  if (compareDecimals(amount, ZERO) < 0) throw new AppError("VALIDATION", "PRICE_AMOUNT_NEGATIVE", "Amount must be non-negative.");
  return { kind: "price", amount, label: null };
}
