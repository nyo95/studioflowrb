import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { printTitle } from "./print-title";

describe("Presentation print title", () => {
  const at = new Date("2026-10-09T03:00:00Z");
  it("is the date, the project without its number, then the board", () => {
    assert.equal(printTitle({ date: at, timeZone: "Asia/Jakarta", projectName: "2026-506 Sociolla SG Funan", boardTitle: "Material Funan" }), "20261009 Sociolla SG Funan Material Funan");
  });
  it("keeps a project name that has no number, and uses the given time zone for the date", () => {
    assert.equal(printTitle({ date: at, timeZone: "Asia/Jakarta", projectName: "Heloskin Cimanggu", boardTitle: "Moodboard" }), "20261009 Heloskin Cimanggu Moodboard");
    // 20:00 UTC on the 9th is already the 10th in Jakarta.
    assert.equal(printTitle({ date: new Date("2026-10-09T20:00:00Z"), timeZone: "Asia/Jakarta", projectName: "A", boardTitle: "B" }), "20261010 A B");
    assert.equal(printTitle({ date: new Date("2026-10-09T20:00:00Z"), timeZone: "UTC", projectName: "A", boardTitle: "B" }), "20261009 A B");
  });
  it("does not leave an empty name when the project is only a number", () => {
    assert.equal(printTitle({ date: at, timeZone: "UTC", projectName: "2026-506", boardTitle: "Board" }), "20261009 2026-506 Board");
  });
});
