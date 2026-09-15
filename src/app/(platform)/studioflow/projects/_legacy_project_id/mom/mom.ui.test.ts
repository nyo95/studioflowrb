import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const section = readFileSync(new URL("../mom-section.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../mom-editor.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./[momId]/page.tsx", import.meta.url), "utf8");
const correction = readFileSync(new URL("./mom-correction-form.tsx", import.meta.url), "utf8");
const loading = readFileSync(new URL("./[momId]/loading.tsx", import.meta.url), "utf8");
const error = readFileSync(new URL("./[momId]/error.tsx", import.meta.url), "utf8");

describe("StudioFlow MOM UI", () => {
  it("covers empty, permission, immutable, loading, and error states", () => {
    assert.match(section, /No MOM documents yet/);
    assert.match(page, /Access denied/);
    assert.match(page, /Immutable project meeting record/);
    assert.match(loading, /Loading MOM/);
    assert.match(error, /MOM unavailable|meeting record could not be loaded/);
  });

  it("uses shared confirmation and unsaved-change patterns", () => {
    assert.match(section, /useConfirm/);
    assert.match(section, /useFormDraftGuard/);
    assert.match(editor, /useUnsavedChangesGuard/);
    assert.match(editor, /useFormDraftGuard/);
    assert.match(correction, /useConfirm/);
    assert.match(correction, /useFormDraftGuard/);
    assert.doesNotMatch(section + editor + correction, /window\.confirm/);
  });

  it("provides canonical text/image preparation, print, and correction", () => {
    assert.match(editor, /SimpleTextEditor/);
    assert.match(editor, /ImageWorkspace/);
    assert.match(page, /PrintButton/);
    assert.match(page, /MomCorrectionForm/);
  });
});
