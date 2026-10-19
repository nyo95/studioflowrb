import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panel = readFileSync(new URL("./deliverables-panel.tsx", import.meta.url), "utf8");

describe("Deliverables panel safety", () => {
  it("confirms every delete before dispatch", () => {
    const remove = panel.slice(panel.indexOf("async function remove"), panel.indexOf("function handleFileChange"));
    assert.ok(remove.indexOf("await confirm.confirm") < remove.indexOf("deleteDeliverableAction"));
    assert.match(remove, /permanently deletes the file for this phase/);
    assert.match(remove, /tone: "danger"/);
    assert.match(panel, /\{confirm\.dialog\}/);
  });

  it("routes delete through the shared visible-error command and exposes no version lifecycle", () => {
    assert.match(panel, /command\.run\([^\n]+deleteDeliverableAction/);
    assert.match(panel, /command\.error \? <div className="mt-3"/);
    assert.match(panel, /<InlineError>\{command\.error\}<\/InlineError>/);
    assert.doesNotMatch(panel, /setDeliverableFinalAction|extendDeliverableExpiryAction|Version \{d\.versionNumber\}|Mark final|Temporary files expire/);
  });

  it("offers the project-wide table row and explains an outdated file", () => {
    assert.match(panel, /variant === "table-row"/);
    assert.match(panel, /This file belongs to an earlier iteration/);
    assert.match(panel, /<TableRow>/);
  });
});
