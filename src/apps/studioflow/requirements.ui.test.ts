import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const projectPage = readFileSync("src/app/(platform)/studioflow/[id]/requirements/page.tsx", "utf8");
const phasePage = readFileSync("src/app/(platform)/studioflow/[id]/phases/[phaseId]/requirements/page.tsx", "utf8");
const workflow = readFileSync("src/app/(platform)/studioflow/[id]/requirements/requirement-workflow.tsx", "utf8");
const actions = readFileSync("src/app/(platform)/studioflow/[id]/requirements/actions.ts", "utf8");

describe("StudioFlow project requirement workflow routes", () => {
  it("exposes guarded General requirement lifecycle controls", () => {
    assert.match(projectPage, /RequirementCreateForm/);
    assert.match(projectPage, /RequirementWorkflowRow/);
    for (const action of ["createProjectRequirementAction", "editProjectRequirementAction", "satisfyRequirementAction", "reopenRequirementAction", "archiveRequirementAction", "restoreRequirementAction", "linkEvidenceAction", "unlinkEvidenceAction"]) {
      assert.match(actions, new RegExp(`export async function ${action}`));
    }
    assert.match(workflow, /Link evidence/);
    assert.match(workflow, /Unlink evidence/);
  });

  it("keeps Phase requirements on the project/phase canonical route", () => {
    assert.match(phasePage, /RequirementCreateForm/);
    assert.match(phasePage, /phaseId/);
    assert.match(phasePage, /listProjectRequirements/);
    assert.match(workflow, /name=\"phase_id\"/);
  });
});
