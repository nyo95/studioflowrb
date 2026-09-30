import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const form = readFileSync(new URL("../projects/new-project-dialog.tsx", import.meta.url), "utf8");
const action = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");

describe("StudioFlow project creation", () => {
  it("picks or creates a client in one searchable control and submits its id", () => {
    assert.match(form, /ClientSelect/);
    assert.doesNotMatch(form, /projectType/);
    assert.match(form, /clientId/);
    assert.match(action, /newClientName: z\.string/);
    assert.match(action, /clientId: Id\.nullish/);
  });
});
