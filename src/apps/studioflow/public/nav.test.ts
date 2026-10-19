import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { studioFlowWorkspaceLinks } from "./nav";

const hrefs = (input: Parameters<typeof studioFlowWorkspaceLinks>[0]) => studioFlowWorkspaceLinks(input).map((link) => link.href);

describe("StudioFlow role navigation", () => {
  it("keeps Designers on personal work, the read-only project list, and Library", () => {
    assert.deepEqual(hrefs({ canManageProjects: false, ideasEnabled: false, canUseIdeas: false }), [
      "/studioflow",
      "/studioflow/projects",
      "/studioflow/library",
    ]);
  });

  it("adds operational Clients and portfolio Timeline for Studio Managers", () => {
    assert.deepEqual(hrefs({ canManageProjects: true, ideasEnabled: false, canUseIdeas: false }), [
      "/studioflow",
      "/studioflow/projects",
      "/studioflow/timeline",
      "/studioflow/clients",
      "/studioflow/library",
    ]);
  });

  it("shows Ideas only when both module and grant are enabled", () => {
    assert.equal(hrefs({ canManageProjects: false, ideasEnabled: true, canUseIdeas: true }).includes("/studioflow/ideas"), true);
    assert.equal(hrefs({ canManageProjects: false, ideasEnabled: true, canUseIdeas: false }).includes("/studioflow/ideas"), false);
  });
});
