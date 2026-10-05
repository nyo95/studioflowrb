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

/** The studio's standard terms, printed whenever a project has none of its own. */
export const BQ_DEFAULT_QUOTATION_TERMS = [
  "Prices are in Indonesian Rupiah (IDR) and exclude VAT unless stated otherwise.",
  "This quotation is valid for 30 days from the quotation date.",
  "Items marked TBC are priced once the specification is confirmed. Items marked By Owner are supplied by the owner and are not included in this quotation.",
  "Payment terms: 50% down payment on order confirmation, 40% on delivery of materials to site, 10% on handover.",
  "Work outside the listed items is quoted separately as additional work.",
  "Quantities follow the approved drawings; changes to the drawings may change the quotation.",
].join("\n");
