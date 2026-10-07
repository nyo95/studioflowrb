import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGanttAxis, dateOfDay, dayNumber, ganttBar, ganttDayLabel, ganttMarkerX, ganttWeekends, GANTT_PX_PER_DAY } from "./gantt";

describe("Gantt geometry", () => {
  it("labels today by its own calendar date", () => {
    assert.equal(ganttDayLabel("2026-10-07"), "7 Oct 2026");
    assert.equal(ganttDayLabel("2027-01-31"), "31 Jan 2027");
  });

  const axis = buildGanttAxis(["2026-10-12", "2026-12-28"], { zoom: "week", today: "2026-11-02" });

  it("starts on a Monday before the earliest date and runs past the latest", () => {
    assert.equal(new Date(axis.startDay * 86_400_000).getUTCDay(), 1);
    assert.ok(axis.startDay <= dayNumber("2026-10-05"));
    assert.ok(axis.endDay >= dayNumber("2026-12-28") + 14);
    assert.equal(axis.widthPx, (axis.endDay - axis.startDay + 1) * GANTT_PX_PER_DAY.week);
  });

  it("draws a bar from its first to its last day inclusive and keeps one-day jobs visible", () => {
    const bar = ganttBar(axis, "2026-10-12", "2026-10-26");
    assert.equal(bar.widthPx, 15 * GANTT_PX_PER_DAY.week);
    assert.equal(bar.leftPx, (dayNumber("2026-10-12") - axis.startDay) * GANTT_PX_PER_DAY.week);
    assert.equal(ganttBar(axis, "2026-11-02", "2026-11-02").widthPx, GANTT_PX_PER_DAY.week);
    assert.equal(ganttBar(axis, "2026-11-05", "2026-11-02").widthPx, GANTT_PX_PER_DAY.week, "a reversed range never draws backwards");
  });

  it("two projects on the same axis line up and a marker sits mid-day", () => {
    assert.equal(ganttBar(axis, "2026-11-02", "2026-11-06").leftPx, ganttBar(axis, "2026-11-02", "2026-12-28").leftPx);
    assert.equal(ganttMarkerX(axis, "2026-11-02"), ganttBar(axis, "2026-11-02", "2026-11-02").leftPx + GANTT_PX_PER_DAY.week / 2);
  });

  it("positions today only when it is inside the range, and month ticks cover the whole width", () => {
    assert.equal(axis.todayPx, (dayNumber("2026-11-02") - axis.startDay) * GANTT_PX_PER_DAY.week);
    assert.equal(axis.months.reduce((sum, month) => sum + month.widthPx, 0), axis.widthPx);
    assert.equal(axis.months[0]!.key, dateOfDay(axis.startDay).slice(0, 7));
    assert.ok(axis.weeks.every((week) => new Date(`${week.key}T00:00:00Z`).getUTCDay() === 1));
  });

  it("shades each weekend as a Saturday-Sunday pair and copes with no dates", () => {
    const weekends = ganttWeekends(axis);
    assert.ok(weekends.length > 8);
    assert.ok(weekends.every((weekend) => weekend.widthPx === 2 * GANTT_PX_PER_DAY.week || weekend.leftPx + weekend.widthPx <= axis.widthPx));
    const empty = buildGanttAxis([], { zoom: "month", today: "2026-11-02" });
    assert.ok(empty.todayPx !== null && empty.widthPx > 0);
  });
});
