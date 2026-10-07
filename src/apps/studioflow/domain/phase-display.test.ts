import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { phaseSkipReason, phaseStepPresentation } from "./phase-display";

describe("StudioFlow phase display wording", () => {
  it("maps phase and iteration state to the shared strip wording", () => {
    assert.deepEqual(phaseStepPresentation({ phaseName: "Moodboard", phaseStatus: "PENDING", previousPhaseName: "Survey", canStart: false, isSupervision: false, iteration: null }), { state: "upcoming", note: "Starts after Survey" });
    assert.deepEqual(phaseStepPresentation({ phaseName: "Moodboard", phaseStatus: "ACTIVE", canStart: false, isSupervision: false, iteration: { name: "Moodboard 2", state: "SENT", waitingDays: 3 } }), { state: "waiting", note: "Moodboard 2 · with client 3d" });
    assert.deepEqual(phaseStepPresentation({ phaseName: "Moodboard", phaseStatus: "ACTIVE", canStart: false, isSupervision: false, iteration: { name: "Moodboard 2", state: "ANSWERED", waitingDays: null } }), { state: "attention", note: "Moodboard 2 · client answered" });
    assert.deepEqual(phaseStepPresentation({ phaseName: "Moodboard", phaseStatus: "DONE", canStart: false, isSupervision: false, iterationCount: 2, iteration: null }), { state: "done", note: "Done in 2 iterations" });
    assert.deepEqual(phaseStepPresentation({ phaseName: "Moodboard", phaseStatus: "DONE", canStart: false, isSupervision: false, skippedReason: "Client cancelled it", iteration: null }), { state: "done", note: "Skipped" });
    assert.equal(phaseSkipReason({ auto_created: { kind: "bypass", reason: "Client cancelled it" } }), "Client cancelled it");
    assert.equal(phaseSkipReason({ auto_created: { reason: "Ordinary finish" } }), null);
  });
});
