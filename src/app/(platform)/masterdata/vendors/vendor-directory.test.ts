import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Vendor directory form composition", () => {
  it("does not pass a fragment to Field, which injects control props", () => {
    const source = readFileSync(new URL("./vendor-directory.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /<Field[\s\S]{0,260}>\s*<>/);
  });
});
