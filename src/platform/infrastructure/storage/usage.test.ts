import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createStorageUsageReader } from "./usage";

describe("storage usage reader", () => {
  it("groups files by owner area, skips symlinks, caps traversal and caches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "studioflow-usage-"));
    try {
      await fs.mkdir(path.join(root, "private-assets", "studioflow"), { recursive: true });
      await fs.mkdir(path.join(root, "private-assets", "messenger"), { recursive: true });
      await fs.mkdir(path.join(root, "public-assets"), { recursive: true });
      await fs.writeFile(path.join(root, "private-assets", "studioflow", "a"), Buffer.alloc(3));
      await fs.writeFile(path.join(root, "private-assets", "messenger", "b"), Buffer.alloc(4));
      await fs.writeFile(path.join(root, "public-assets", "mark"), Buffer.alloc(5));
      let now = new Date("2026-09-30T00:00:00Z");
      const usage = createStorageUsageReader(root, { now: () => now, maxFiles: 2 });
      const first = await usage();
      assert.equal(first.truncated, true);
      assert.equal(first.groups.reduce((sum, group) => sum + group.bytes, 0), 7);
      await fs.writeFile(path.join(root, "private-assets", "studioflow", "later"), Buffer.alloc(99));
      assert.deepEqual(await usage(), first, "within a minute the cached report is reused");
      now = new Date(now.getTime() + 60_000);
      assert.notDeepEqual(await usage(), first);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
});
