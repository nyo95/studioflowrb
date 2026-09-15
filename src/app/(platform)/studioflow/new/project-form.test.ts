import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const form = readFileSync(new URL("../projects/new-project-dialog.tsx", import.meta.url), "utf8");
const action = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");

describe("StudioFlow project creation", () => {
  it("keeps client creation in context and submits either an id or a new client name", () => {
    assert.match(form, /newClientName/);
    assert.match(form, /clientId/);
    assert.match(action, /newClientName/);
    assert.match(action, /newClientName: z\.string/);
    assert.match(action, /clientId: Id\.nullish/);
  });
});
