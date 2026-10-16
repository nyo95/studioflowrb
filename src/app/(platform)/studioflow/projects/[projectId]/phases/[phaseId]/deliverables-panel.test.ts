import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panel = readFileSync(new URL("./deliverables-panel.tsx", import.meta.url), "utf8");

describe("Deliverables panel safety", () => {
  it("confirms every delete before dispatch and calls out a Final file", () => {
    const remove = panel.slice(panel.indexOf("async function remove"), panel.indexOf("function handleFileChange"));
    assert.ok(remove.indexOf("await confirm.confirm") < remove.indexOf("deleteDeliverableAction"));
    assert.match(remove, /Delete final file/);
    assert.match(remove, /leaves this file slot without a Final/);
    assert.match(remove, /tone: "danger"/);
    assert.match(panel, /\{confirm\.dialog\}/);
  });

  it("routes delete, Final and Extend through the shared visible-error command", () => {
    for (const action of ["deleteDeliverableAction", "setDeliverableFinalAction", "extendDeliverableExpiryAction"]) {
      assert.match(panel, new RegExp(`command\\.run\\([^\\n]+${action}`));
    }
    assert.match(panel, /command\.error \? <div className="mt-3"/);
    assert.match(panel, /<InlineError>\{command\.error\}<\/InlineError>/);
  });
});
