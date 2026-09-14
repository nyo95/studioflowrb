import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const createPage = readFileSync(new URL("./new/page.tsx", import.meta.url), "utf8");
const phasePage = readFileSync(new URL("../phases/[phaseTemplateId]/requirements/page.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("./template-form.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

describe("StudioFlow requirement template routes", () => {
  it("keeps create and lifecycle controls on the canonical settings surface", () => {
    assert.match(page, /\/studioflow\/settings\/requirements\/new/);
    assert.match(page, /EditRequirementTemplateForm/);
    assert.match(page, /RequirementTemplateActions/);
    assert.match(createPage, /createRequirementTemplateAction|RequirementTemplateForm/);
    for (const action of ["archiveRequirementTemplateAction", "restoreRequirementTemplateAction", "deleteRequirementTemplateAction"]) {
      assert.match(actions, new RegExp(`export async function ${action}`));
    }
  });

  it("keeps Phase template management parent-scoped", () => {
    assert.match(phasePage, /settings\/requirements\/new\?phase_template_id=/);
    assert.match(phasePage, /listPhaseRequirementTemplates/);
    assert.match(form, /fixedPhaseTemplateId/);
    assert.match(form, /value=\"PHASE\"/);
  });
});
