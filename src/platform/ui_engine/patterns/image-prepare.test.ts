import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shrinkImageFile } from "./image-prepare";

describe("shrinkImageFile", () => {
  it("returns a file that already fits untouched, so screenshots stay sharp PNGs", async () => {
    const file = new File([new Uint8Array(1024)], "screen.png", { type: "image/png" });
    assert.equal(await shrinkImageFile(file, { maxBytes: 3 * 1024 * 1024 }), file);
  });

  it("only re-encodes when the file is over the limit (decoding needs a browser)", async () => {
    const file = new File([new Uint8Array(4096)], "photo.jpg", { type: "image/jpeg" });
    // Node has no image decoder: reaching the decode step proves the size gate let it through.
    await assert.rejects(shrinkImageFile(file, { maxBytes: 1024 }));
  });
});
