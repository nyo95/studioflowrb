import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { expandLibrarySearchTerms, relatedLibraryTerms } from "./semantic-terms";

describe("StudioFlow Library semantic reader utility", () => {
  it("offers aliases and related terms without changing the source tag", () => {
    assert.deepEqual(relatedLibraryTerms("chair"), ["kursi", "bench", "stool", "armchair"]);
    assert.equal(relatedLibraryTerms("chair").includes("chair"), false);
  });

  it("expands a search for an alias to the canonical and related terms", () => {
    assert.deepEqual(expandLibrarySearchTerms("kursi"), ["kursi", "chair", "bench", "stool", "armchair"]);
  });

  it("leaves unknown terms unchanged", () => {
    assert.deepEqual(expandLibrarySearchTerms("lamp"), ["lamp"]);
  });
});
