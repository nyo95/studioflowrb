import type { Money } from "@platform/contracts";
import { isDecimalString, toDecimalString, type DecimalString } from "@platform/utilities/decimal";

/**
 * Display-only money formatting (CORE.md §8).
 *
 * Formatting never mutates stored values and never defines calculation
 * rounding. Currency is an explicit uppercase ISO-style three-letter code on
 * every persisted/public Money value; there is no implicit conversion.
 */

export const DEFAULT_MONEY_LOCALE = "id-ID";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function isValidCurrencyCode(currency: string): boolean {
  return CURRENCY_CODE_PATTERN.test(currency);
}

/** Builds a canonical Money value from a decimal amount and explicit currency. */
export function createMoney(amount: DecimalString | string, currency: string): Money {
  if (!isValidCurrencyCode(currency)) {
    throw new Error(
      `Invalid currency code: ${JSON.stringify(currency)}. Expected an uppercase ISO-style three-letter code.`,
    );
  }
  return { amount: isDecimalString(amount) ? amount : toDecimalString(amount), currency };
}

/**
 * Formats a Money value for display using Intl with the canonical decimal
 * string passed straight through — arbitrary-precision amounts are never
 * converted to JavaScript numbers.
 */
export function formatMoney(value: Money, options: { locale?: string } = {}): string {
  if (!isValidCurrencyCode(value.currency)) {
    throw new Error(`Invalid currency code on Money value: ${JSON.stringify(value.currency)}.`);
  }
  // ECMA-402 formats decimal strings as exact mathematical values; the TS
  // library only admits literal numeric strings, so bridge the branded type
  // here. The original canonical string reaches Intl untouched — no JS number.
  return new Intl.NumberFormat(options.locale ?? DEFAULT_MONEY_LOCALE, {
    style: "currency",
    currency: value.currency,
  }).format(value.amount as unknown as number);
}
