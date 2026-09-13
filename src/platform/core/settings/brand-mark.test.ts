import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FakeObjectStorage } from "@platform/core/storage";
import { uploadBrandMarkPng } from "./brand-mark";

const png = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
]);

describe("Platform Brand mark upload policy", () => {
  it("validates PNG bytes and writes only a server-owned object key", async () => {
    const storage = new FakeObjectStorage();
    const key = await uploadBrandMarkPng(new File([png], "mark.png", { type: "image/png" }), storage);
    assert.match(key, /^brand-marks\/[0-9a-f-]+\.png$/);
    assert.equal(storage.objects.get(key)?.contentType, "image/png");
  });

  it("rejects malformed and oversized PNG inputs before writing", async () => {
    const storage = new FakeObjectStorage();
    await assert.rejects(() => uploadBrandMarkPng(new File([Uint8Array.of(1)], "bad.png", { type: "image/png" }), storage));
    await assert.rejects(() => uploadBrandMarkPng(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), storage));
    assert.equal(storage.objects.size, 0);
  });
});
