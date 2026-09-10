import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";

import { deriveCatalogueSearchKey, snapshotCatalogueProduct, STUDIOFLOW_PERMISSIONS } from "./service";

describe("Product Catalogue search key", () => {
  it("normalises brand, product, colour, and finishing from columns", () => {
    assert.equal(
      deriveCatalogueSearchKey({
        brand_name: "  Acme ",
        product_name: "Tile",
        colour: "White",
        finishing: "Matte",
      }),
      "acme::tile::white::matte",
    );
  });

  it("omits empty parts and does not invent a visible code", () => {
    assert.equal(
      deriveCatalogueSearchKey({ brand_name: null, product_name: "Lamp", colour: "  ", finishing: undefined }),
      "lamp",
    );
  });
});

describe("Product Catalogue snapshot", () => {
  it("copies specification fields so later catalogue edits cannot mutate the snapshot", () => {
    const row = {
      brand_md_id: "brand-1",
      brand_name: "Acme",
      product_name: "Tile",
      colour: "White",
      finishing: "Matte",
      dimension_text: "600x600",
      unit: "pcs",
      notes: "Living room",
      search_key: "acme::tile::white::matte",
    };
    const snapshot = snapshotCatalogueProduct(row);
    row.product_name = "Changed";
    row.brand_name = "Other";
    row.search_key = "other";
    assert.equal(snapshot.product_name, "Tile");
    assert.equal(snapshot.brand_name, "Acme");
    assert.equal(snapshot.search_key, "acme::tile::white::matte");
  });
});

describe("Product Catalogue boundary", () => {
  it("registers schedule.manage for writes and keeps reads on project.read", () => {
    assert.equal(STUDIOFLOW_PERMISSIONS.projectRead, "studioflow.project.read");
    assert.equal(STUDIOFLOW_PERMISSIONS.scheduleManage, "studioflow.schedule.manage");
  });

  it("does not import Master Data SKU, unit, or pricing", () => {
    const files = [
      resolve("src/apps/studioflow/service.ts"),
      resolve("src/app/(platform)/studioflow/catalogue/actions.ts"),
      resolve("src/app/(platform)/studioflow/catalogue/page.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/catalogue-table.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/catalogue-form.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/new/page.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/[id]/page.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/[id]/catalogue-detail.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/loading.tsx"),
      resolve("src/app/(platform)/studioflow/catalogue/error.tsx"),
    ];
    const source = files.map((path) => readFileSync(path, "utf8")).join("\n");
    assert.match(source, /createMasterDataPublicRead/);
    assert.match(source, /listBrandLibraryReads|getBrandLibraryRead/);
    assert.doesNotMatch(source, /listUnits\(/);
    assert.doesNotMatch(source, /listMaterialPriceOptions/);
    assert.doesNotMatch(source, /getSkuPricingOptions/);
    assert.doesNotMatch(source, /listWorkPricesRead/);
    assert.doesNotMatch(source, /apps\/masterdata\/service/);
    assert.doesNotMatch(source, /master_data\.Sku|PriceMaterial|sku_id/);
  });
});
