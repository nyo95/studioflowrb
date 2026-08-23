import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSlug } from "@platform/utilities/slug";
import { buildCategoryPath, categorySlug, splitCategoryInput } from "./category-rules";

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
});
