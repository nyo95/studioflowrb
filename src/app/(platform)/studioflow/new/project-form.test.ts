import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("StudioFlow project creation", () => {
  it("keeps client creation in context and submits either an id or a name", () => {
    const form = readFileSync(new URL("./project-form.tsx", import.meta.url), "utf8");
    const action = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    assert.match(form, /CreatableSearch/);
    assert.match(form, /name="client_id"/);
    assert.match(form, /name="client_name"/);
    assert.match(action, /client_name/);
    assert.match(action, /client_id: client_id \|\| undefined/);
  });
});
