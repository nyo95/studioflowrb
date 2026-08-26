import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSlug } from "@platform/utilities/slug";
import {
  assertBrandCategoryTarget,
  assertCategoryCanBeDeleted,
  assertCategoryKindImmutable,
  buildCategoryPath,
  categorySearchKey,
  categorySlug,
  normalizeCategorySynonyms,
  resolveCategoryPlacement,
  rewriteDescendantCategoryPath,
  splitCategoryInput,
} from "./category-rules";

describe("category pure rules", () => {
  it("uses the canonical slug function by reference", () => assert.equal(categorySlug, toSlug));

  it("builds root, nested, and same-name paths", () => {
    assert.equal(buildCategoryPath(null, "Cat Dinding"), "cat-dinding");
    assert.equal(buildCategoryPath("pekerjaan-dinding", "Cat Dinding"), "pekerjaan-dinding/cat-dinding");
    assert.equal(buildCategoryPath("cat", "Cat"), "cat/cat");
  });

  it("splits > and / input without adding parsing formats", () => {
    assert.deepEqual(splitCategoryInput("MEP > Lighting"), { parent: "MEP", child: "Lighting" });
    assert.deepEqual(splitCategoryInput("MEP/Lighting"), { parent: "MEP", child: "Lighting" });
    assert.deepEqual(splitCategoryInput("A > B > C"), { parent: "B", child: "C" });
    assert.deepEqual(splitCategoryInput("   "), { parent: null, child: "" });
  });

  it("normalizes and deduplicates synonyms without replacing display values", () => {
    assert.equal(categorySearchKey("  Café   Wall  "), "cafe wall");
    assert.deepEqual(
      normalizeCategorySynonyms([" High   Pressure Laminate ", "high pressure laminate", "HPL", "", "hpl"]),
      ["High Pressure Laminate", "HPL"],
    );
  });

  it("keeps PRODUCT flat and rejects kind changes", () => {
    assert.deepEqual(
      resolveCategoryPlacement({ kind: "PRODUCT", name: "HPL", parent: null }),
      { parentId: null, path: null },
    );
    assert.throws(
      () => resolveCategoryPlacement({
        kind: "PRODUCT",
        name: "HPL",
        parent: { id: "parent", kind: "PRODUCT", path: null, deletedAt: null, ancestorIds: [] },
      }),
      { code: "PRODUCT_CATEGORY_MUST_BE_FLAT" },
    );
    assert.throws(() => assertCategoryKindImmutable("PRODUCT", "WORK"), {
      code: "CATEGORY_KIND_IMMUTABLE",
    });
  });

  it("builds WORK placement and fails closed on invalid parents and cycles", () => {
    assert.deepEqual(
      resolveCategoryPlacement({ kind: "WORK", name: "MEP", parent: null }),
      { parentId: null, path: "mep" },
    );
    assert.deepEqual(
      resolveCategoryPlacement({
        categoryId: "lighting",
        kind: "WORK",
        name: "Lighting",
        parent: { id: "mep", kind: "WORK", path: "mep", deletedAt: null, ancestorIds: [] },
      }),
      { parentId: "mep", path: "mep/lighting" },
    );
    assert.throws(
      () => resolveCategoryPlacement({
        categoryId: "mep",
        kind: "WORK",
        name: "MEP",
        parent: {
          id: "lighting",
          kind: "WORK",
          path: "mep/lighting",
          deletedAt: null,
          ancestorIds: ["mep"],
        },
      }),
      { code: "WORK_CATEGORY_CYCLE" },
    );
  });

  it("rewrites only paths inside the affected WORK subtree", () => {
    assert.equal(
      rewriteDescendantCategoryPath("mep/lighting/fixtures", "mep/lighting", "electrical/lighting"),
      "electrical/lighting/fixtures",
    );
    assert.throws(
      () => rewriteDescendantCategoryPath("civil/floor", "mep", "electrical"),
      { code: "CATEGORY_DESCENDANT_PATH_MISMATCH" },
    );
  });

  it("reports delete blockers and accepts only live PRODUCT BrandCategory targets", () => {
    assert.doesNotThrow(() => assertCategoryCanBeDeleted({
      liveBrandCategories: 0,
      nonDeletedSkus: 0,
      liveWorkPrices: 0,
      liveChildren: 0,
    }));
    assert.throws(
      () => assertCategoryCanBeDeleted({
        liveBrandCategories: 1,
        nonDeletedSkus: 0,
        liveWorkPrices: 0,
        liveChildren: 0,
      }),
      { code: "CATEGORY_STILL_REFERENCED" },
    );
    assert.doesNotThrow(() => assertBrandCategoryTarget({ kind: "PRODUCT", deletedAt: null }));
    assert.throws(() => assertBrandCategoryTarget({ kind: "WORK", deletedAt: null }), {
      code: "BRAND_CATEGORY_REQUIRES_LIVE_PRODUCT",
    });
  });
});
