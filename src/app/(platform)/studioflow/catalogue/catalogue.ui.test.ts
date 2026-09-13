import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { STUDIOFLOW_NAV_LINKS } from "@/apps/studioflow/public/nav";

const nav = readFileSync(new URL("../nav.tsx", import.meta.url), "utf8");
const list = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const table = readFileSync(new URL("./catalogue-table.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("./catalogue-form.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("./[id]/catalogue-detail.tsx", import.meta.url), "utf8");
const createPage = readFileSync(new URL("./new/page.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

describe("Product Catalogue UI", () => {
  it("adds a global catalogue nav item and leaves project schedule disabled", () => {
    const catalogueLink = STUDIOFLOW_NAV_LINKS.extensions.find((link) => link.href === "/studioflow/catalogue");
    const scheduleLink = STUDIOFLOW_NAV_LINKS.extensions.find((link) => link.href === "/studioflow/schedule");
    assert.ok(catalogueLink, "expected a /studioflow/catalogue nav link");
    assert.equal(catalogueLink?.label, "Product Catalogue");
    assert.ok(scheduleLink, "expected a /studioflow/schedule nav link");
    assert.equal(scheduleLink?.label, "Product Schedule");
    assert.equal(scheduleLink?.disabled, true);
    assert.match(nav, /STUDIOFLOW_NAV_LINKS/);
  });

  it("covers list search, archived filter, empty, and permission states", () => {
    assert.match(list, /Access denied/);
    assert.match(list, /No catalogue products yet/);
    assert.match(list, /No results/);
    assert.match(list, /Include archived/);
    assert.match(list, /Search catalogue/);
    assert.match(table, /minWidth=\{760\}/);
    assert.match(table, /sortable/);
    assert.match(table, /Pagination/);
  });

  it("edits explicit specification columns with a Brand public-port picker", () => {
    assert.match(form, /Combobox/);
    assert.match(form, /No catalogued brand/);
    assert.match(form, /name="product_name"/);
    assert.match(form, /name="colour"/);
    assert.match(form, /name="finishing"/);
    assert.match(form, /name="dimension_text"/);
    assert.match(form, /name="unit"/);
    assert.match(form, /name="notes"/);
    assert.match(createPage, /listBrandLibraryReads/);
    assert.match(actions, /getBrandLibraryRead/);
    assert.doesNotMatch(form, /price|sku|SKU|supplier/i);
    assert.doesNotMatch(list, /price|sku|SKU/i);
  });

  it("archives and restores from detail without rewriting a project", () => {
    assert.match(detail, /Archive product/);
    assert.match(detail, /Restore product/);
    assert.match(detail, /Existing project snapshots will not change/);
    assert.match(detail, /disabled=\{!canManage \|\| archived\}/);
    assert.match(detail, /useConfirm/);
    assert.doesNotMatch(detail, /window\.confirm/);
    assert.match(form, /useFormDraftGuard/);
  });
});
