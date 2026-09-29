import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { AppError } from "@platform/core/errors";

import { assertStorageRootConfigured, resolveStorageRoot, storageRootProblems } from "./storage-root";

const cwd = path.resolve(os.tmpdir(), "sf-app");
const outside = path.resolve(os.tmpdir(), "sf-data");

describe("storage root safety", () => {
  it("falls back to <cwd>/.storage only outside production", () => {
    assert.equal(resolveStorageRoot({}, cwd), path.join(cwd, ".storage"));
    assert.deepEqual(storageRootProblems({ NODE_ENV: "development" }, cwd), []);
    assert.equal(storageRootProblems({ NODE_ENV: "production" }, cwd).length, 1);
    assert.equal(storageRootProblems({ NODE_ENV: "production", STUDIOFLOW_STORAGE_ROOT: "  " }, cwd).length, 1);
  });

  it("rejects relative, root, and in-repo folders in production", () => {
    assert.match(storageRootProblems({ STUDIOFLOW_STORAGE_ROOT: "storage" }, cwd)[0], /absolute/);
    assert.match(storageRootProblems({ STUDIOFLOW_STORAGE_ROOT: path.parse(cwd).root }, cwd)[0], /root/);
    assert.match(
      storageRootProblems({ NODE_ENV: "production", STUDIOFLOW_STORAGE_ROOT: path.join(cwd, "data") }, cwd)[0],
      /outside the application folder/,
    );
    assert.deepEqual(storageRootProblems({ NODE_ENV: "production", STUDIOFLOW_STORAGE_ROOT: outside }, cwd), []);
  });

  it("proves the production folder is writable and leaves no probe behind", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sf-root-"));
    const target = path.join(root, "nested");
    await assertStorageRootConfigured({ NODE_ENV: "production", STUDIOFLOW_STORAGE_ROOT: target }, cwd);
    assert.deepEqual(await fs.readdir(target), []);

    const blocker = path.join(root, "file");
    await fs.writeFile(blocker, "x");
    await assert.rejects(
      assertStorageRootConfigured({ NODE_ENV: "production", STUDIOFLOW_STORAGE_ROOT: path.join(blocker, "sub") }, cwd),
      (error) => error instanceof AppError && error.code === "storage.root-unwritable",
    );
    await assert.rejects(assertStorageRootConfigured({ NODE_ENV: "production" }, cwd), AppError);
    await fs.rm(root, { recursive: true, force: true });
  });
});
