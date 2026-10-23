import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const queue = readFileSync("src/app/(platform)/masterdata/sample-requests/sample-request-directory.tsx", "utf8");

describe("sample request queue shows the schedule item (WO-SF-SAMPLE-PHOTO-01)", () => {
  it("shows the photo and code in the row and the dialog, and nothing when there is no photo", () => {
    assert.match(queue, /\{row\.product\.imageUrl \? <img src=\{row\.product\.imageUrl\}/);
    assert.match(queue, /\{detail\.product\.imageUrl \? \(/);
    assert.match(queue, /title=\{detail\.product\.entryCode \? `\$\{detail\.product\.entryCode\} · \$\{detail\.product\.name\}` : detail\.product\.name\}/);
  });
});
