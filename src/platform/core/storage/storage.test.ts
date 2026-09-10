import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FakeObjectStorage, createPrivateObjectKey, validateMomImage } from "./index";

describe("shared object storage", () => {
  it("creates server-owned non-guessable keys", () => {
    const first = createPrivateObjectKey("studioflow/mom/project/document", "png");
    const second = createPrivateObjectKey("studioflow/mom/project/document", ".PNG");
    assert.match(first, /^studioflow\/mom\/project\/document\/[0-9a-f-]+\.png$/);
    assert.notEqual(first, second);
  });

  it("validates image type, size, and signature", () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    assert.doesNotThrow(() => validateMomImage({ bytes: png, contentType: "image/png" }));
    assert.throws(() => validateMomImage({ bytes: Uint8Array.from([1, 2, 3]), contentType: "image/png" }));
    assert.throws(() => validateMomImage({ bytes: png, contentType: "image/svg+xml" }));
  });

  it("supports deterministic fake upload, signed read, and cleanup", async () => {
    const storage = new FakeObjectStorage();
    const body = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await storage.put({ key: "mom/a.png", body, bytes: body.length, contentType: "image/png" });
    assert.match(await storage.createSignedReadUrl("mom/a.png", 60), /expires=60/);
    await storage.remove("mom/a.png");
    await assert.rejects(() => storage.createSignedReadUrl("mom/a.png", 60));
  });
});
