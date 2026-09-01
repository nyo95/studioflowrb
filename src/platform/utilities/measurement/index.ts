import { toDecimalString, type DecimalString } from "@platform/utilities/decimal";

type PositiveDecimal = {
  numerator: bigint;
  denominator: bigint;
};

function parsePositiveDecimal(value: string, label: string): PositiveDecimal {
  const canonical = toDecimalString(value);
  if (canonical.startsWith("-") || canonical === "0") {
    throw new Error(`${label} must be greater than zero.`);
  }
  const [integer, fraction = ""] = canonical.split(".");
  return {
    numerator: BigInt(`${integer}${fraction}`),
    denominator: 10n ** BigInt(fraction.length),
  };
}

function roundedDecimal(numerator: bigint, denominator: bigint, precision: number): DecimalString {
  const scale = 10n ** BigInt(precision);
  const scaled = numerator * scale;
  const quotient = scaled / denominator;
  const rounded = scaled % denominator * 2n >= denominator ? quotient + 1n : quotient;
  const digits = rounded.toString().padStart(precision + 1, "0");
  const value = precision === 0
    ? digits
    : `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
  return toDecimalString(value);
}

/**
 * Calculates rectangular area in square metres using exact decimal arithmetic.
 * The caller supplies the domain-owned length-to-metre factor, so Utilities do
 * not own or infer a Unit dictionary.
 */
export function calculateRectangleAreaSquareMeters(input: {
  length: string;
  width: string;
  lengthToMeterFactor: string;
  precision?: number;
}): DecimalString {
  const length = parsePositiveDecimal(input.length, "Length");
  const width = parsePositiveDecimal(input.width, "Width");
  const factor = parsePositiveDecimal(input.lengthToMeterFactor, "Length-to-metre factor");
  return roundedDecimal(
    length.numerator * width.numerator * factor.numerator * factor.numerator,
    length.denominator * width.denominator * factor.denominator * factor.denominator,
    input.precision ?? 6,
  );
}
