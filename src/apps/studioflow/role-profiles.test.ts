import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { STUDIOFLOW_ROLE_PROFILES } from "./role-profiles";

const profile = (code: (typeof STUDIOFLOW_ROLE_PROFILES)[number]["code"]) =>
  STUDIOFLOW_ROLE_PROFILES.find((candidate) => candidate.code === code)!;

describe("StudioFlow role profiles", () => {
  it("keeps Junior and Mid in one Designer access profile", () => {
    assert.deepEqual(profile("designer").permissionIds, [
      P.access, P.projectRead, P.projectPicDesigner, P.phaseWork, P.phaseReview,
      P.taskManage, P.momManage, P.scheduleManage, P.presentationManage,
    ]);
  });

  it("gives every Drafter their own PIC position without management", () => {
    const drafter = new Set<string>(profile("drafter").permissionIds);
    assert.equal(drafter.has(P.projectPicDrafter), true);
    assert.equal(drafter.has(P.projectPicDesigner), false);
    assert.equal(drafter.has(P.projectManage), false);
  });

  it("makes Manager a stand-in for any PIC plus template and operations authority, without a PIC position", () => {
    const manager = new Set<string>(profile("studio-manager").permissionIds);
    for (const permission of [P.access, P.projectRead, P.phaseWork, P.phaseReview, P.taskManage, P.momManage, P.scheduleManage, P.presentationManage, P.projectManage, P.projectOverride, P.settingsManage]) {
      assert.equal(manager.has(permission), true, permission);
    }
    assert.equal(manager.has(P.projectPicDesigner), false);
    assert.equal(manager.has(P.projectPicDrafter), false);
    assert.equal(manager.has(P.phaseOverride), false, "the hard reset of phase history stays with the Platform Owner");
    assert.equal(manager.has(P.ideasManage), false);
  });
});
