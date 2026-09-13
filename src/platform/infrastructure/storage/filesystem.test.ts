import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

import { createLocalFilesystemStorage, createLocalPublicFilesystemStorage } from "./filesystem";

describe("LocalFilesystemStorage adapter", () => {
  it("writes, removes, and creates signed URLs safely", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "studioflow-storage-"));
    try {
      const storage = createLocalFilesystemStorage(tmpDir);
      const data = Uint8Array.from([1, 2, 3, 4]);
      const stored = await storage.put({ key: "test/image.png", body: data, bytes: 4, contentType: "image/png" });
      assert.equal(stored.key, "test/image.png");
      assert.equal(stored.bytes, 4);

      const signedUrl = await storage.createSignedReadUrl("test/image.png", 60);
      assert.match(signedUrl, /\/api\/platform\/assets\/private\?key=test%2Fimage\.png/);

      await storage.remove("test/image.png");
      await assert.rejects(() => storage.createSignedReadUrl("test/image.png", 60));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects path traversal attacks", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "studioflow-storage-"));
    try {
      const storage = createLocalFilesystemStorage(tmpDir);
      const data = Uint8Array.from([1]);
      await assert.rejects(() => storage.put({ key: "../outside.txt", body: data, bytes: 1, contentType: "text/plain" }));
      await assert.rejects(() => storage.remove("../outside.txt"));
      await assert.rejects(() => storage.createSignedReadUrl("../outside.txt", 60));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates public read URLs for public storage", () => {
    const storage = createLocalPublicFilesystemStorage("/tmp/public");
    const url = storage.createPublicReadUrl("brand-marks/mark.png");
    assert.equal(url, "/api/platform/assets/public/brand-marks/mark.png");
  });
});
