import { addDecimals, divideDecimals, multiplyDecimals, toDecimalString, truncateDecimal, type DecimalString } from "@platform/utilities/decimal";

/**
 * The quotation letter's money rows and text blocks (owner 2026-10-14, the studio's quotation PDF). Pure, no I/O.
 *
 * Subtotal is the grand total of the BQ. Rounding, when set, is the amount the estimator rounds the subtotal to, and
 * PPN is taken on that rounded amount (as the studio's PDF: 11% of 1.320.000.000 = 145.200.000). PPN is rounded half
 * up to whole rupiah.
 */
export const DEFAULT_PPN_PCT = "11";
export const DEFAULT_VALID_DAYS = 30;
export const DEFAULT_PAYMENT_TERMS = ["50% Down Payment", "40% Upon Handover", "10% Retention"].join("\n");
export const LETTER_TEXT_MAX = 2000;

export type QuotationTotals = { subtotal: DecimalString; rounding: DecimalString | null; ppnPct: DecimalString; ppn: DecimalString; total: DecimalString };

export function quotationTotals(input: { subtotal: string; rounding: string | null; ppnPct: string }): QuotationTotals {
  const subtotal = toDecimalString(input.subtotal);
  const rounding = input.rounding === null ? null : toDecimalString(input.rounding);
  const ppnPct = toDecimalString(input.ppnPct);
  const base = rounding ?? subtotal;
  const ppn = truncateDecimal(addDecimals(divideDecimals(multiplyDecimals(base, ppnPct), toDecimalString("100"), 6), toDecimalString("0.5")), 0);
  return { subtotal, rounding, ppnPct, ppn, total: addDecimals(base, ppn) };
}

/** "50% Down Payment" lines → [share, what]; a line without a leading share keeps all its text in `what`. */
export function paymentTermRows(text: string): Array<{ share: string; what: string }> {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^(\d+(?:[.,]\d+)?\s*%)\s+(.*)$/.exec(line);
    return match ? { share: match[1]!.replace(/\s+/g, ""), what: match[2]! } : { share: "", what: line };
  });
}

/** "9 Weeks upon confirmation …" → the leading number apart, as the PDF prints it. */
export function scheduleRow(text: string): { lead: string; rest: string } {
  const match = /^(\d+(?:[.,]\d+)?)\s+(.*)$/s.exec(text.trim());
  return match ? { lead: match[1]!, rest: match[2]! } : { lead: "", rest: text.trim() };
}

/** YYYY-MM-DD plus days. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
