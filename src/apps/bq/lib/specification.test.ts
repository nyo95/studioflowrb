import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPECIFICATION_MAX, specificationFromComponents } from "./specification";

const line = (titleSnapshot: string) => ({ titleSnapshot });

describe("BQ specification from Cost Components", () => {
  it("lists group components first, then direct ones, each name once", () => {
    const item = {
      subObjects: [{ lineItems: [line("Gypsum 9mm Knauf"), line("Rangka  Hollow 4x4")] }],
      lineItems: [line("gypsum 9mm knauf"), line("Cat texture"), line("  ")],
    };
    assert.equal(specificationFromComponents(item), "Gypsum 9mm Knauf + Rangka Hollow 4x4 + Cat texture");
  });

  it("is empty without components and stops before the length limit", () => {
    assert.equal(specificationFromComponents({ subObjects: [], lineItems: [] }), "");
    const long = { subObjects: [], lineItems: Array.from({ length: 40 }, (_, index) => line(`${"x".repeat(40)} ${index}`)) };
    const text = specificationFromComponents(long);
    assert.ok(text.length <= SPECIFICATION_MAX);
    assert.ok(!text.endsWith("+"));
  });
});
