import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeProjectPlan } from "./plan";
import { back, fwd, workingDaysBetween } from "./working-time";

describe("working time", () => {
  const holidays = new Set(["2026-01-06"]);
  it("counts after the base date through weekends and holidays", () => { assert.equal(fwd("2026-01-02", 2, holidays), "2026-01-07"); assert.equal(back("2026-01-07", 2, holidays), "2026-01-02"); assert.equal(fwd("2026-01-03", 0, holidays), "2026-01-03"); assert.equal(back(fwd("2026-01-02", 3, holidays), 3, holidays), "2026-01-02"); });
  it("computes the joined plan and warnings", () => { const result = computeProjectPlan({ fitOutStart: "2026-02-02", intervals: { cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 40, handoverToOpening: 10 }, holidays: new Set(), openingDate: "2026-04-01", timelineStart: "2026-02-01", cdDoneDate: "2026-01-20", today: "2026-01-01" }); assert.deepEqual(result.milestones, { designFinal: "2026-01-12", cdMallStart: "2026-01-12", cdFinalStart: "2026-01-19", end: "2026-01-26", fitOutStart: "2026-02-02", handover: "2026-03-30", openingForecast: "2026-04-13" }); assert.equal(result.warnings.length, 3); assert.equal(result.suggestedFitOutStart, "2026-01-27"); assert.equal(workingDaysBetween("2026-01-01", "2026-01-02"), 1); });
});
