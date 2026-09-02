/**
 * Canonical base-10 decimal-string representation (CORE.md §8).
 *
 * Cross-layer and public decimal values are normalized strings, never
 * JavaScript floating-point numbers. Normalization and comparison are pure
 * string operations: arbitrary-precision values survive without loss and no
 * scientific notation is produced.
 */

declare const decimalStringBrand: unique symbol;

/** A validated, normalized base-10 decimal string (e.g. "-12.34", "0.5", "7"). */
export type DecimalString = string & { readonly [decimalStringBrand]: true };

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export const DEFAULT_DECIMAL_LOCALE = "id-ID";

export type FormatDecimalOptions = {
  locale?: string;
  useGrouping?: boolean;
};

function normalize(value: string): string {
  let sign = "";
  let body = value;
  if (body.startsWith("+") || body.startsWith("-")) {
    sign = body[0];
    body = body.slice(1);
  }
  const dotIndex = body.indexOf(".");
  let intPart = dotIndex === -1 ? body : body.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? "" : body.slice(dotIndex + 1);

  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (intPart === "") intPart = "0";
  const trimmedFraction = fracPart.replace(/0+$/, "");

  if (/^0*$/.test(intPart) && trimmedFraction === "") return "0";
  return `${sign === "-" ? "-" : ""}${intPart}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

/**
 * Parses a decimal literal into a canonical DecimalString.
 * Rejects empty input, whitespace, locale separators, scientific notation,
 * NaN/Infinity words, and any other malformed value.
 */
export function toDecimalString(value: string): DecimalString {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`Invalid decimal string: ${JSON.stringify(value)}`);
  }
  return normalize(value) as DecimalString;
}

/** Type guard proving a value already satisfies the canonical representation. */
export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === "string" && DECIMAL_PATTERN.test(value) && normalize(value) === value;
}

/**
 * Formats a canonical decimal for display without converting its magnitude or
 * fractional digits to a JavaScript number. Locale grouping, signs, decimal
 * separators, and digits are applied without rounding or appending zeroes.
 */
export function formatDecimal(
  value: DecimalString | string,
  options: FormatDecimalOptions = {},
): string {
  const canonical = isDecimalString(value) ? value : toDecimalString(value);
  const negative = canonical.startsWith("-");
  const unsigned = negative ? canonical.slice(1) : canonical;
  const [integer, fraction] = splitParts(unsigned);
  const locale = options.locale ?? DEFAULT_DECIMAL_LOCALE;
  const useGrouping = options.useGrouping ?? true;
  const integerFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping,
  });
  const formattedInteger = integerFormatter.format(BigInt(integer));
  const formattedFraction = fraction ? localizeDigits(fraction, locale) : "";
  const decimalSeparator = formattedFraction ? getDecimalSeparator(locale) : "";

  if (!negative) return `${formattedInteger}${decimalSeparator}${formattedFraction}`;

  const { prefix, suffix } = getNegativeAffixes(locale);
  return `${prefix}${formattedInteger}${decimalSeparator}${formattedFraction}${suffix}`;
}

/** Pure three-way comparison of two canonical decimal strings; no numeric conversion. */
export function compareDecimals(a: DecimalString, b: DecimalString): -1 | 0 | 1 {
  const negativeA = a.startsWith("-");
  const negativeB = b.startsWith("-");

  if (negativeA !== negativeB) {
    if (a === "0" && b === "0") return 0;
    return negativeA ? -1 : 1;
  }
  if (a === "0" && b === "0") return 0;

  const magnitude = compareMagnitude(negativeA ? a.slice(1) : a, negativeB ? b.slice(1) : b);
  return (negativeA ? -magnitude : magnitude) as -1 | 0 | 1;
}

/** Adds two canonical decimals exactly, without using floating point. */
export function addDecimals(a: DecimalString, b: DecimalString): DecimalString {
  const [aSign, aInteger, aFraction] = decimalParts(a);
  const [bSign, bInteger, bFraction] = decimalParts(b);
  const scale = Math.max(aFraction.length, bFraction.length);
  const left = aSign * BigInt(`${aInteger}${aFraction.padEnd(scale, "0")}`);
  const right = bSign * BigInt(`${bInteger}${bFraction.padEnd(scale, "0")}`);
  return fromScaledInteger(left + right, scale);
}

/** Multiplies two canonical decimals exactly, without using floating point. */
export function multiplyDecimals(a: DecimalString, b: DecimalString): DecimalString {
  const [aSign, aInteger, aFraction] = decimalParts(a);
  const [bSign, bInteger, bFraction] = decimalParts(b);
  const left = BigInt(`${aInteger}${aFraction}`);
  const right = BigInt(`${bInteger}${bFraction}`);
  return fromScaledInteger(aSign * bSign * left * right, aFraction.length + bFraction.length);
}

/**
 * Divides canonical decimals and truncates (toward zero) to the requested
 * number of fractional places. Callers must choose the precision explicitly.
 */
export function divideDecimals(
  a: DecimalString,
  b: DecimalString,
  maximumFractionDigits: number,
): DecimalString {
  if (!Number.isInteger(maximumFractionDigits) || maximumFractionDigits < 0) {
    throw new Error("maximumFractionDigits must be a non-negative integer.");
  }
  const [aSign, aInteger, aFraction] = decimalParts(a);
  const [bSign, bInteger, bFraction] = decimalParts(b);
  const numerator = BigInt(`${aInteger}${aFraction}`) * 10n ** BigInt(bFraction.length + maximumFractionDigits);
  const denominator = BigInt(`${bInteger}${bFraction}`) * 10n ** BigInt(aFraction.length);
  if (denominator === 0n) throw new Error("Cannot divide by zero.");
  return fromScaledInteger((aSign * bSign * numerator) / denominator, maximumFractionDigits);
}

/** Truncates a canonical decimal toward zero to the requested fractional precision. */
export function truncateDecimal(value: DecimalString, maximumFractionDigits: number): DecimalString {
  if (!Number.isInteger(maximumFractionDigits) || maximumFractionDigits < 0) {
    throw new Error("maximumFractionDigits must be a non-negative integer.");
  }
  const [sign, integer, fraction] = decimalParts(value);
  if (fraction.length <= maximumFractionDigits) return value;
  return fromScaledInteger(
    sign * BigInt(`${integer}${fraction.slice(0, maximumFractionDigits)}`),
    maximumFractionDigits,
  );
}

function decimalParts(value: DecimalString): [1n | -1n, string, string] {
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  return [negative ? -1n : 1n, integer, fraction];
}

function fromScaledInteger(value: bigint, scale: number): DecimalString {
  const negative = value < 0n;
  const magnitude = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const integer = scale === 0 ? magnitude : magnitude.slice(0, -scale);
  const fraction = scale === 0 ? "" : magnitude.slice(-scale);
  return toDecimalString(`${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`);
}

function compareMagnitude(x: string, y: string): -1 | 0 | 1 {
  const [intX, fracX] = splitParts(x);
  const [intY, fracY] = splitParts(y);

  if (intX.length !== intY.length) return intX.length < intY.length ? -1 : 1;
  if (intX !== intY) return intX < intY ? -1 : 1;

  const width = Math.max(fracX.length, fracY.length);
  const paddedX = fracX.padEnd(width, "0");
  const paddedY = fracY.padEnd(width, "0");
  if (paddedX === paddedY) return 0;
  return paddedX < paddedY ? -1 : 1;
}

function splitParts(value: string): [string, string] {
  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return [value, ""];
  return [value.slice(0, dotIndex), value.slice(dotIndex + 1)];
}

function localizeDigits(value: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
  });
  const digits = Array.from({ length: 10 }, (_, digit) => formatter.format(digit));
  return value.replace(/\d/g, (digit) => digits[Number(digit)]);
}

function getDecimalSeparator(locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  });
  return formatter.formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
}

function getNegativeAffixes(locale: string): { prefix: string; suffix: string } {
  const parts = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
  }).formatToParts(-1);
  const integerIndex = parts.findIndex((part) => part.type === "integer");
  if (integerIndex === -1) return { prefix: "-", suffix: "" };
  return {
    prefix: parts
      .slice(0, integerIndex)
      .map((part) => part.value)
      .join(""),
    suffix: parts
      .slice(integerIndex + 1)
      .map((part) => part.value)
      .join(""),
  };
}
