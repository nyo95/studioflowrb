import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(new URL("./phase-section.tsx", import.meta.url), "utf8");

describe("Phase deliverable surface", () => {
  it("renders the complete current-file summary and external link", () => {
    assert.match(source, /Current deliverable/);
    assert.match(source, /currentFile\.original_filename/);
    assert.match(source, /currentFile\.treatment/);
    assert.match(source, /currentFile\.bytes_label/);
    assert.match(source, /currentFile\.dropped_at_label/);
    assert.match(source, /currentFile\.external_url/);
    assert.match(source, /Open external link/);
    assert.doesNotMatch(source, /Number\(currentFile\.bytes\)/);
  });

  it("keeps phase intake fixed to the phase folder and hidden for DONE", () => {
    assert.match(source, /DeliverableForm projectId=\{projectId\} fixedFolderKey=\{folder_key\}/);
    assert.match(source, /canManage && !isDone/);
    assert.match(source, /!isDone && nextFilename/);
  });
});
