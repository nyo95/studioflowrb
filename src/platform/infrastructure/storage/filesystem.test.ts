import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

import { createLocalFilesystemStorage, createLocalPublicFilesystemStorage } from "./filesystem";

describe("LocalFilesystemStorage adapter", () => {
  it("writes, removes, and creates valid absolute-expiry signed URLs safely", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "studioflow-storage-"));
    try {
      const storage = createLocalFilesystemStorage(tmpDir);
      const data = Uint8Array.from([1, 2, 3, 4]);
      const stored = await storage.put({ key: "test/image.png", body: data, bytes: 4, contentType: "image/png" });
      assert.equal(stored.key, "test/image.png");
      assert.equal(stored.bytes, 4);

      const signedUrl = await storage.createSignedReadUrl("test/image.png", 60);
      assert.match(signedUrl, /\/api\/platform\/assets\/private\?key=test%2Fimage\.png&expires=\d+&token=[a-f0-9]{64}/);

      await storage.remove("test/image.png");
      await assert.rejects(() => storage.createSignedReadUrl("test/image.png", 60));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects path traversal and symlink escape attacks", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "studioflow-storage-"));
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "studioflow-outside-"));
    try {
      const storage = createLocalFilesystemStorage(tmpDir);
      const data = Uint8Array.from([1]);

      // Traversal tests
      await assert.rejects(() => storage.put({ key: "../outside.txt", body: data, bytes: 1, contentType: "text/plain" }));
      await assert.rejects(() => storage.remove("../outside.txt"));
      await assert.rejects(() => storage.createSignedReadUrl("../outside.txt", 60));

      // Symlink escape test with strict error classification
      const symlinkPath = path.join(tmpDir, "escape-link");
      let symlinkCreated = false;
      try {
        await fs.symlink(outsideDir, symlinkPath, "dir");
        symlinkCreated = true;
      } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && ((err as { code?: string }).code === "EPERM" || (err as { code?: string }).code === "EACCES")) {
          // Platform lacks symlink permission (Windows unprivileged user), skip symlink execution safely
        } else {
          throw err;
        }
      }

      if (symlinkCreated) {
        await assert.rejects(() => storage.put({ key: "escape-link/file.txt", body: data, bytes: 1, contentType: "text/plain" }));
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("creates public read URLs for public storage", () => {
    const storage = createLocalPublicFilesystemStorage("/tmp/public");
    const url = storage.createPublicReadUrl("brand-marks/mark.png");
    assert.equal(url, "/api/platform/assets/public/brand-marks/mark.png");
  });
});
