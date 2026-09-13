import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const service = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../app/(platform)/studioflow/[id]/mom-actions.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../../app/(platform)/studioflow/[id]/mom-editor.tsx", import.meta.url), "utf8");
const imagePolicy = readFileSync(new URL("./mom-images.ts", import.meta.url), "utf8");

describe("StudioFlow MOM contract", () => {
  it("keeps MOM project-owned with the ordered legacy hierarchy", () => {
    assert.match(schema, /mom_documents SfMomDocument\[\]/);
    assert.match(schema, /model SfMomDocument[\s\S]*project SfProject/);
    assert.match(schema, /model SfMomDocument[\s\S]*items SfMomItem\[\]/);
    assert.match(schema, /model SfMomItem[\s\S]*points SfMomPoint\[\]/);
    assert.match(schema, /model SfMomItem[\s\S]*images SfMomImage\[\]/);
    const hierarchy = schema.match(/model SfMomItem[\s\S]*?model SfProjectPhase/)?.[0] ?? "";
    assert.doesNotMatch(hierarchy, /@@unique\(\[(document_id|item_id), sort_order\]\)/);
  });

  it("does not introduce task, phase, or iteration foreign keys", () => {
    const momModels = schema.match(/model SfMomDocument[\s\S]*?model SfProjectPhase/)?.[0] ?? "";
    assert.doesNotMatch(momModels, /phase_id|iteration_id|task_id|linked_task_id/);
    assert.match(service, /Only an issued MOM can be corrected/);
    assert.match(service, /Only draft MOMs can be issued/);
  });

  it("exposes the project-scoped lifecycle through the public service", () => {
    for (const method of ["listMomDocuments", "getMom", "createMomDraft", "updateMomDraft", "updateMomContent", "discardMomDraft", "issueMom", "supersedeMom"]) {
      assert.match(service, new RegExp(`\\b${method}\\b`));
    }
    assert.match(service, /momManage: "studioflow\.mom\.manage"/);
    assert.match(service, /momIssue: "studioflow\.mom\.issue"/);
  });

  it("uses the canonical text, image, storage, and draft-safety surfaces", () => {
    assert.match(editor, /SimpleTextEditor/);
    assert.match(editor, /ImageWorkspace/);
    assert.match(editor, /useUnsavedChangesGuard/);
    assert.match(editor, /useFormDraftGuard/);
    assert.match(actions, /@platform\/core\/storage/);
    assert.match(actions, /@\/apps\/studioflow\/mom-images/);
    assert.match(actions, /assertMomDraftEditable/);
    assert.match(actions, /validateMomImage/);
    assert.match(imagePolicy, /MOM images must be non-empty and no larger than 10 MB/);
    assert.doesNotMatch(editor + actions, /window\.confirm/);
  });
});
