import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const rowActions = readFileSync(new URL("./project-row-actions.tsx", import.meta.url), "utf8");
const deletionReview = readFileSync(new URL("./project-deletion-review.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("./[id]/project-editor.tsx", import.meta.url), "utf8");

describe("BQ project directory", () => {
  it("shows Created and Updated with people and keeps lifecycle actions on each directory row", () => {
    assert.match(page, /<TableHead>Created<\/TableHead><TableHead>Updated<\/TableHead>/);
    assert.match(page, /secondary=\{`by \$\{createdBy\}`\}/);
    assert.match(page, /secondary=\{`by \$\{project\.updatedBy \?\? createdBy\}`\}/);
    assert.match(page, /<ProjectRowActions project=/);
    assert.doesNotMatch(page, /<TableHead>Estimator<\/TableHead>/);
  });

  it("moves lock, archive, restore and deletion controls out of the estimating workspace", () => {
    for (const label of ["Kunci project", "Buka kunci", "Arsipkan project", "Pulihkan project", "Ajukan penghapusan"]) {
      assert.match(rowActions, new RegExp(label));
    }
    assert.doesNotMatch(editor, /Kunci project ini\?|Arsipkan project ini\?|Ajukan penghapusan permanen\?/);
  });

  it("lets a deletion-right holder execute the pending deletion without a typed confirmation", () => {
    assert.match(deletionReview, /label: "Delete permanently"/);
    assert.doesNotMatch(deletionReview, /requireTypedConfirmation|ConfirmDialog|Approve permanent deletion/);
  });
});
