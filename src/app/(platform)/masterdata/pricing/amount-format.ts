import { formatDecimal } from "@platform/utilities/decimal";

/** WO-MD-PRICE-LABEL-01: text that starts with a quotation mark is a text price ("call sales"), kept exactly as typed. */
export function isTextAmount(value: string): boolean {
  return /^\s*["\u201c\u201d]/.test(value);
}

/**
 * One typed amount box, read the same way as a pasted cell (`parsePastedAmount`), so typing and pasting
 * never disagree: a quoted text price passes through, "By Request"/TBC/TBA/Nego mean a price on request
 * ("0"), "Rp 15.000" is a number, and a plain number is read the Indonesian way and grouped as it is typed.
 * Letters stay visible while typing (so "By Request" can be typed at all); the box shows the result when
 * it is left (`blurDisplay`). Null refuses the keystroke.
 */
export function readTypedAmount(typed: string): { value: string; display: string } | null {
  if (isTextAmount(typed)) return { value: typed.replace(/^\s+/, ""), display: typed };
  if (/[a-z]/i.test(typed)) return { value: parsePastedAmount(typed), display: typed };
  const value = parseIndonesianAmount(typed);
  if (value === null) return null;
  return { value, display: entryDisplay(value, typed) };
}

/** What the box shows while typing: text as typed, a trailing comma kept, otherwise the grouped number. */
export function entryDisplay(parsed: string, typed: string): string {
  if (isTextAmount(parsed)) return parsed;
  return typed.endsWith(",") ? typed : parsed ? formatDecimal(parsed) : "";
}

/** What the box shows once left: text as typed, otherwise the grouped number. */
export function blurDisplay(value: string): string {
  if (isTextAmount(value)) return value;
  return value ? formatDecimal(value) : "";
}

/** The text a stored price shows in its amount box: the label in quotation marks, or the number. */
export function storedAmountText(amount: string, label: string | null | undefined): string {
  return label ? `"${label}"` : amount;
}

/** Reads an amount typed the Indonesian way ("1.250.000" or "12,5"). Returns a plain decimal string, "" when empty, null when unreadable. */
export function parseIndonesianAmount(value: string): string | null {
  const compact = value.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return "";
  const commaIndex = compact.lastIndexOf(",");
  if (commaIndex === -1) return compact.replace(/\D/g, "") || "";
  const integer = compact.slice(0, commaIndex).replace(/\D/g, "") || "0";
  const fraction = compact.slice(commaIndex + 1).replace(/\D/g, "");
  if (!fraction) return integer;
  return `${integer}.${fraction}`;
}

/** One pasted spreadsheet cell as an amount: "-", "n/a" and blanks mean "no price" (""); "By Request", TBC, TBA and Nego mean a price on request ("0"). */
export function parsePastedAmount(cell: string): string {
  const text = cell.trim();
  if (isTextAmount(text)) return text;
  if (/^(by request|tbc|tba|nego|negotiable)$/i.test(text)) return "0";
  if (!text || /^(-+|n\/a)$/i.test(text)) return "";
  const withoutCurrency = text.replace(/^rp\.?\s*/i, "");
  // "135000", "135.000", "135.000,50" and "135,000" all appear in workbooks; a lone dot or comma group of 3 is a thousands separator.
  if (/^\d{1,3}(,\d{3})+$/.test(withoutCurrency)) return withoutCurrency.replace(/,/g, "");
  return parseIndonesianAmount(withoutCurrency) ?? "";
}
