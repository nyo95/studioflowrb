import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
const service = readFileSync(new URL("./mom/service.ts", import.meta.url), "utf8");
const permissions = readFileSync(new URL("./permissions.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../../app/(platform)/studioflow/projects/[projectId]/mom/[momId]/mom-editor.tsx", import.meta.url), "utf8");
const imagePolicy = readFileSync(new URL("./domain/mom.ts", import.meta.url), "utf8");

describe("StudioFlow MOM contract", () => {
  it("keeps MOM project-owned with the ordered legacy hierarchy", () => {
    assert.match(schema, /mom_documents\s+SfMomDocument\[\]/);
    assert.match(schema, /model SfMomDocument[\s\S]*project\s+SfProject/);
    assert.match(schema, /model SfMomDocument[\s\S]*items\s+SfMomItem\[\]/);
    assert.match(schema, /model SfMomItem[\s\S]*content\s+String/);
    assert.match(schema, /model SfMomItem[\s\S]*images\s+SfMomImage\[\]/);
    const hierarchy = schema.match(/model SfMomItem[\s\S]*?model SfProjectPhase/)?.[0] ?? "";
    assert.doesNotMatch(hierarchy, /@@unique\(\[(document_id|item_id), sort_order\]\)/);
  });

  it("does not introduce task, phase, or iteration foreign keys", () => {
    const momModels = schema.match(/model SfMomDocument[\s\S]*?model SfProjectPhase/)?.[0] ?? "";
    assert.doesNotMatch(momModels, /phase_id|iteration_id|task_id|linked_task_id/);
  });

  it("exposes the project-scoped lifecycle through the service", () => {
    for (const method of ["listDocuments", "getDocument", "createDocument", "updateDocument", "deleteDocument"]) {
      assert.match(service, new RegExp(`\\b${method}\\b`));
    }
    assert.match(service, /momManage/);
    assert.match(permissions, /momManage.*studioflow\.mom\.manage/);
  });

  it("uses the canonical image storage surface", () => {
    assert.match(editor, /ImageWorkspace/);
    assert.match(imagePolicy, /imageBytes:\s*3 \* 1024 \* 1024/);
    assert.doesNotMatch(editor, /window\.confirm/);
  });
});
