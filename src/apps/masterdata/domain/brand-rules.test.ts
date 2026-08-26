import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertBrandCanBeDeleted, assertBrandCategories, assertBrandCategoryCanBeRemoved, assertBrandSuppliers } from "./brand-rules";

describe("Brand rules", () => {
  it("requires explicit live PRODUCT categories and protects the final assignment", () => {
    assert.throws(() => assertBrandCategories([]), { code: "BRAND_REQUIRES_PRODUCT_CATEGORY" });
    assert.doesNotThrow(() => assertBrandCategories([{ id: "c", kind: "PRODUCT", deletedAt: null }]));
    assert.throws(() => assertBrandCategories([{ id: "c", kind: "WORK", deletedAt: null }]), { code: "BRAND_CATEGORY_REQUIRES_LIVE_PRODUCT" });
    assert.throws(() => assertBrandCategoryCanBeRemoved(["c"], "c"), { code: "BRAND_REQUIRES_PRODUCT_CATEGORY" });
  });
  it("requires supplier eligibility and blocks deletion references", () => {
    assert.doesNotThrow(() => assertBrandSuppliers([{ id: "p", deletedAt: null, roles: ["MATERIAL_SUPPLIER"] }]));
    assert.throws(() => assertBrandSuppliers([{ id: "p", deletedAt: null, roles: ["WORK_VENDOR"] }]), { code: "PARTY_NOT_OPERATIONALLY_ELIGIBLE" });
    assert.throws(() => assertBrandCanBeDeleted({ liveSkus: 1, scopedContacts: 0 }), { code: "BRAND_STILL_REFERENCED" });
  });
});
