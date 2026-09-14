import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("local Prisma development runtime", () => {
  it("generates the ignored Prisma client before Next evaluates development routes", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    assert.match(packageJson.scripts.dev, /^prisma generate && next dev\b/);
  });
});
