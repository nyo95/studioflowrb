import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveTimelineSpan } from "./timeline";

describe("resolveTimelineSpan", () => {
  it("spans start to the opening date when one is set", () => {
    const span = resolveTimelineSpan("2026-01-01", "2026-01-11", { now: Date.parse("2026-01-06T00:00:00.000Z") });
    assert.equal(span.totalMs, 10 * 86_400_000);
    assert.equal(span.todayPct, 50);
    assert.equal(span.showTodayMarker, true);
  });

  it("falls back to today (or start+30d, whichever is later) when there is no opening date", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const span = resolveTimelineSpan("2026-01-01", null, { now });
    assert.equal(span.endMs, now + 30 * 86_400_000);
  });

  it("never lets the marker show before start or after end", () => {
    const span = resolveTimelineSpan("2026-01-01", "2026-01-11", { now: Date.parse("2025-12-01T00:00:00.000Z") });
    assert.equal(span.showTodayMarker, false);
    assert.equal(span.todayPct, 0);
  });

  it("widens to cover a phase planned before the project's own start date", () => {
    const span = resolveTimelineSpan("2026-01-10", "2026-01-20", {
      now: Date.parse("2026-01-10T00:00:00.000Z"),
      phases: [{ id: "a", plannedStartDate: "2026-01-01", plannedEndDate: "2026-01-05" }],
    });
    assert.equal(span.startMs, Date.parse("2026-01-01T00:00:00.000Z"));
    assert.equal(span.endMs, Date.parse("2026-01-20T00:00:00.000Z"));
  });

  it("widens to cover a phase planned after the project's opening date", () => {
    const span = resolveTimelineSpan("2026-01-01", "2026-01-10", {
      phases: [{ id: "a", plannedStartDate: "2026-01-05", plannedEndDate: "2026-01-20" }],
    });
    assert.equal(span.startMs, Date.parse("2026-01-01T00:00:00.000Z"));
    assert.equal(span.endMs, Date.parse("2026-01-20T00:00:00.000Z"));
  });

  it("ignores a partially-dated phase (only one of the two fields set) when widening", () => {
    const span = resolveTimelineSpan("2026-01-01", "2026-01-10", {
      phases: [{ id: "a", plannedStartDate: "2025-12-01", plannedEndDate: null }],
    });
    assert.equal(span.startMs, Date.parse("2026-01-01T00:00:00.000Z"));
  });
});
