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

/** One pasted spreadsheet cell as an amount: "-", "By Request", "n/a" and blanks mean "no price" (""). */
export function parsePastedAmount(cell: string): string {
  const text = cell.trim();
  if (!text || /^(-+|by request|n\/a|tbc|tba)$/i.test(text)) return "";
  const withoutCurrency = text.replace(/^rp\.?\s*/i, "");
  // "135000", "135.000", "135.000,50" and "135,000" all appear in workbooks; a lone dot or comma group of 3 is a thousands separator.
  if (/^\d{1,3}(,\d{3})+$/.test(withoutCurrency)) return withoutCurrency.replace(/,/g, "");
  return parseIndonesianAmount(withoutCurrency) ?? "";
}
