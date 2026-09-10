import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Project file controls", () => {
  it("consumes the shared drop zone instead of owning drop semantics", () => {
    const source = readFileSync(new URL("./file-controls.tsx", import.meta.url), "utf8");

    assert.match(source, /import \{[^}]*\bFileDropZone\b[^}]*\} from "@\/platform\/ui_engine"/);

    /* KB-011: the defect was a second local implementation of the gesture, not
       the gesture itself. This guard fails if one is reintroduced here. */
    for (const owned of ["onDragEnter", "onDragOver", "onDragLeave", "onDrop", "dataTransfer"]) {
      assert.doesNotMatch(source, new RegExp(owned), `${owned} belongs to the shared zone`);
    }

    /* What a dropped file means stays this app's decision: a filename and a
       byte count are recorded, and the bytes themselves never leave the PC. */
    assert.match(source, /setFilename\(file\.name\)/);
    assert.match(source, /setBytes\(String\(file\.size\)\)/);
  });
});
