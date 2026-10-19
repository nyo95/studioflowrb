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

  it("makes Manager Designer-capable but excludes recovery overrides", () => {
    const manager = profile("studio-manager").permissionIds;
    assert.deepEqual(manager, [...profile("designer").permissionIds, P.projectManage]);
    const managerPermissions = new Set<string>(manager);
    assert.equal(managerPermissions.has(P.projectOverride), false);
    assert.equal(managerPermissions.has(P.phaseOverride), false);
    assert.equal(managerPermissions.has(P.settingsManage), false);
    assert.equal(managerPermissions.has(P.ideasManage), false);
  });
});
