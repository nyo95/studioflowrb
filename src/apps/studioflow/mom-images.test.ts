import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateMomImage } from "./mom-images";

describe("StudioFlow MOM image policy", () => {
  it("preserves the accepted type, size, and signature checks", () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    assert.doesNotThrow(() => validateMomImage({ bytes: png, contentType: "image/png" }));
    assert.throws(() => validateMomImage({ bytes: Uint8Array.from([1, 2, 3]), contentType: "image/png" }));
    assert.throws(() => validateMomImage({ bytes: png, contentType: "image/svg+xml" }));
  });
});
