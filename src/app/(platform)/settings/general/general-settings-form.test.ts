import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("General Settings form", () => {
  it("lets React choose the encoding for its Server Action", () => {
    const source = readFileSync(new URL("./general-settings-form.tsx", import.meta.url), "utf8");

    assert.match(source, /<form action=\{action\}>/);
    assert.doesNotMatch(source, /encType=/);
  });
});
