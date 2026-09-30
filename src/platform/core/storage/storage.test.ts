import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FakeObjectStorage, createPrivateObjectKey } from "./index";

describe("shared object storage", () => {
  it("creates server-owned non-guessable keys", () => {
    const first = createPrivateObjectKey("studioflow/mom/project/document", "png");
    const second = createPrivateObjectKey("studioflow/mom/project/document", ".PNG");
    assert.match(first, /^studioflow\/mom\/project\/document\/[0-9a-f-]+\.png$/);
    assert.notEqual(first, second);
  });

  it("supports deterministic fake upload, signed read, and cleanup", async () => {
    const storage = new FakeObjectStorage();
    const body = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await storage.put({ key: "mom/a.png", body, bytes: body.length, contentType: "image/png" });
    assert.match(await storage.createSignedReadUrl("mom/a.png", 60), /expires=60/);
    await storage.remove("mom/a.png");
    await assert.rejects(() => storage.createSignedReadUrl("mom/a.png", 60));
  });

  it("accepts a web stream through the same fake seam", async () => {
    const storage = new FakeObjectStorage();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Uint8Array.from([1, 2])); controller.enqueue(Uint8Array.from([3])); controller.close(); } });
    assert.equal((await storage.putStream({ key: "deliverables/a.pdf", contentType: "application/pdf", stream, maxBytes: 3 })).bytes, 3);
    assert.equal(storage.objects.get("deliverables/a.pdf")?.body.byteLength, 3);
  });
});
