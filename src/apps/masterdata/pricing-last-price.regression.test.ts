import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pricing = readFileSync("src/app/(platform)/masterdata/pricing/pricing-directory.tsx", "utf8");
const skus = readFileSync("src/app/(platform)/masterdata/skus/sku-directory.tsx", "utf8");

describe("archiving the last price of a live SKU", () => {
  it("says so up front and offers to archive the SKU with it", () => {
    assert.match(pricing, /const lastPriceSku = archive\?\.sku && props\.materialPrices\.filter\(\(row\) => row\.sku\.id === archive\.sku\?\.id && !row\.deleted_at\)\.length <= 1/);
    assert.match(pricing, /confirmLabel="Archive SKU and price"/);
    assert.match(pricing, /archiveSkuAction\(sku\.id\)/);
  });
  it("explains the way out to someone who cannot manage SKUs", () => {
    assert.match(pricing, /Add another price first, or ask someone who can manage SKUs/);
  });
  it("describes the SKU archive in plain words", () => {
    assert.doesNotMatch(skus, /archive causes|parent provenance/);
  });
});
