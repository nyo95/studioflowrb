import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { brandLinkCandidates } from "./schedule";

const brands = [
  { id: "singres", name: "Singres" },
  { id: "singres-mosaic", name: "Singres Mosaic" },
  { id: "sing", name: "Sing" },
  { id: "dulux", name: "Dulux" },
  { id: "dulux-pro", name: "Dulux Professional" },
  { id: "jotun", name: "Jotun" },
];

describe("brandLinkCandidates", () => {
  it("puts the same name first, then the longest Brand the typed name starts with", () => {
    assert.deepEqual(brandLinkCandidates(" singres   mosaic ", brands).map((brand) => brand.id), ["singres-mosaic", "singres"]);
    assert.deepEqual(brandLinkCandidates("Singres Mosaic 30x30", brands).map((brand) => brand.id), ["singres-mosaic", "singres"]);
  });
  it("matches a typed name followed by a dash, and a Brand that starts with the typed name", () => {
    assert.deepEqual(brandLinkCandidates("Jotun-Majestic", brands).map((brand) => brand.id), ["jotun"]);
    assert.deepEqual(brandLinkCandidates("dulux", brands).map((brand) => brand.id), ["dulux", "dulux-pro"]);
  });
  it("never matches inside a word, and offers at most three", () => {
    assert.deepEqual(brandLinkCandidates("Singresia", brands), []);
    assert.deepEqual(brandLinkCandidates("", brands), []);
    assert.deepEqual(brandLinkCandidates(null, brands), []);
    const many = Array.from({ length: 5 }, (_, index) => ({ id: `b${index}`, name: `Acme ${"x".repeat(index + 1)}` }));
    assert.equal(brandLinkCandidates("Acme", many).length, 3);
  });
});
