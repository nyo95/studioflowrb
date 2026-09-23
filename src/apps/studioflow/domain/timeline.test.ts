import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePhaseSegments, resolveTimelineSpan } from "./timeline";

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

describe("computePhaseSegments", () => {
  const span = resolveTimelineSpan("2026-01-01", "2026-01-11", { now: Date.parse("2026-01-06T00:00:00.000Z") });

  it("splits undated phases into equal-width slots by sequence, unchanged from the original bar", () => {
    const segments = computePhaseSegments(span, [
      { id: "a", plannedStartDate: null, plannedEndDate: null },
      { id: "b", plannedStartDate: null, plannedEndDate: null },
    ]);
    assert.deepEqual(segments, [
      { id: "a", leftPct: 0, widthPct: 50, dated: false },
      { id: "b", leftPct: 50, widthPct: 50, dated: false },
    ]);
  });

  it("positions a fully-dated phase by its real duration against the span", () => {
    const [segment] = computePhaseSegments(span, [
      { id: "a", plannedStartDate: "2026-01-03", plannedEndDate: "2026-01-05" },
    ]);
    assert.equal(segment.leftPct, 20);
    assert.equal(segment.widthPct, 20);
    assert.equal(segment.dated, true);
  });

  it("keeps a partially-dated phase (only start or only end set) on the equal-width fallback", () => {
    const segments = computePhaseSegments(span, [
      { id: "a", plannedStartDate: "2026-01-03", plannedEndDate: null },
      { id: "b", plannedStartDate: null, plannedEndDate: null },
    ]);
    assert.equal(segments[0]!.dated, false);
    assert.equal(segments[0]!.widthPct, 50);
  });

  it("mixes dated and undated phases independently, each keeping its own placement", () => {
    const segments = computePhaseSegments(span, [
      { id: "a", plannedStartDate: "2026-01-01", plannedEndDate: "2026-01-03" },
      { id: "b", plannedStartDate: null, plannedEndDate: null },
    ]);
    assert.equal(segments[0]!.dated, true);
    assert.equal(segments[0]!.leftPct, 0);
    assert.equal(segments[0]!.widthPct, 20);
    assert.equal(segments[1]!.dated, false);
    assert.equal(segments[1]!.leftPct, 50);
  });

  it("returns nothing for zero phases", () => {
    assert.deepEqual(computePhaseSegments(span, []), []);
  });

  it("clamps a planned end before its start to a minimal visible sliver, not a negative width", () => {
    const [segment] = computePhaseSegments(span, [
      { id: "a", plannedStartDate: "2026-01-05", plannedEndDate: "2026-01-03" },
    ]);
    assert.ok(segment.widthPct > 0);
  });

  it("stays fully within the bar when the span was widened to fit an out-of-range planned phase", () => {
    const widened = resolveTimelineSpan("2026-01-10", "2026-01-20", {
      phases: [{ id: "a", plannedStartDate: "2026-01-01", plannedEndDate: "2026-01-05" }],
    });
    const [segment] = computePhaseSegments(widened, [{ id: "a", plannedStartDate: "2026-01-01", plannedEndDate: "2026-01-05" }]);
    assert.equal(segment.leftPct, 0);
    assert.ok(segment.leftPct + segment.widthPct <= 100);
  });
});
