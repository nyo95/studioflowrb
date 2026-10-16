import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./studioflow-asset-retention.ts", import.meta.url), "utf8");

describe("StudioFlow composed maintenance", () => {
  it("retries Presentation Schedule links without module-state gating or blocking archive retention", () => {
    assert.match(source, /reconcilePresentationScheduleLinks/);
    assert.match(source, /await reconcilePresentationScheduleLinks\(input\.limit\)\.catch/);
    assert.match(source, /Presentation Schedule-link reconciliation failed/);
    assert.ok(source.indexOf("reconcilePresentationScheduleLinks(input.limit)") < source.indexOf("studioFlow.projects.purgeExpiredArchivedAssets"));
    assert.doesNotMatch(source, /requireModuleEnabled|MODULE_DISABLED/);
  });
});
