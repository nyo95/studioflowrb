/**
 * How a Work Item's price reads on the document (owner, 2026-09-23). TBC ("to be confirmed") and BY_OWNER are
 * marker lines: the row stays on the BQ and the quotation, but it carries no rate or total and nothing of it is
 * counted toward the grand total.
 */
export const BQ_PRICE_MODES = ["PRICED", "TBC", "BY_OWNER"] as const;
export type BqPriceMode = (typeof BQ_PRICE_MODES)[number];

export const BQ_PRICE_MODE_LABEL: Record<BqPriceMode, string> = {
  PRICED: "Priced",
  TBC: "TBC",
  BY_OWNER: "By Owner",
};

export function isMarkerPriceMode(mode: BqPriceMode): boolean {
  return mode !== "PRICED";
}

export const QUOTATION_TERMS_MAX = 8000;

/**
 * The studio's standard terms, printed whenever a project has none of its own (owner 2026-10-14: as on the studio's
 * quotation; validity, payment terms and PPN print in their own places on the letter).
 */
export const BQ_DEFAULT_QUOTATION_TERMS = [
  "Quotation is based on latest design drawings.",
  "Any deposit charges by construction location management will be paid by Client.",
  "Any additional / deduction works resulted by design changes or client's request will be quoted separately.",
  "Items marked TBC are priced once the specification is confirmed. Items marked By Owner are supplied by the owner and are not included in this quotation.",
].join("\n");
