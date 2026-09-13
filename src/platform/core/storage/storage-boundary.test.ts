import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Core storage boundary", () => {
  it("contains no app policy or provider adapter", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /studioflow|supabase|MOM_IMAGE/i);
  });
});
