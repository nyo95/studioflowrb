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
