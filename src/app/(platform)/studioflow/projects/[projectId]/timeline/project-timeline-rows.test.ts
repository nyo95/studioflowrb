import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LEGACY_PHASE_DEFINITION_IDS as D } from "@/apps/studioflow/domain/phase";

import { buildProjectTimelineRows, type PhaseInput, type Plan, type ProjectInput } from "./project-timeline-rows";

const milestones = { designFinal: "2026-10-12", cdMallStart: "2026-10-12", cdFinalStart: "2026-10-19", end: "2026-10-26", fitOutStart: "2026-11-02", handover: "2026-12-28", openingForecast: "2027-01-11" };
const plan = (over: Partial<Plan> = {}): Plan => ({ fitOutStartDate: "2026-11-02", intervals: { cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 40, handoverToOpening: 10 }, overrides: null, milestones, endPlanned: "2026-10-26", endActual: null, suggestedFitOutStart: null, warnings: [], ...over });
const project: ProjectInput = { id: "p", name: "P", client: null, openingDate: "2027-01-11", timelineStartDate: "2026-09-14", fitOutStartDate: "2026-11-02" };
const phase = (id: string, def: string, label: string, start: string | null, end: string | null, manual = false): PhaseInput => ({ id, definitionId: def, label, status: "PENDING", plannedStartDate: start, plannedEndDate: end, manual });
const phases = (manual = false): PhaseInput[] => [
  phase("m", D.moodboard, "Moodboard", null, null),
  phase("d", D.design3d, "Design 3D", null, "2026-10-12"),
  phase("c", D.cd, "Construction Drawing", "2026-10-12", "2026-10-26", manual),
  phase("s", D.supervision, "Construction", "2026-11-02", "2026-12-28"),
];

describe("project timeline rows", () => {
  it("opens with a milestone row carrying every plan date and the real opening", () => {
    const rows = buildProjectTimelineRows(project, phases(), plan());
    assert.equal(rows[0]!.id, "milestones");
    assert.deepEqual(rows[0]!.markers!.map((marker) => marker.id), ["start", "design-final", "end", "fit-out", "handover", "opening"]);
  });

  it("splits Construction Drawing into CD Mall and CD Final while its dates are the plan's own", () => {
    const cd = buildProjectTimelineRows(project, phases(), plan()).find((row) => row.id === "c")!;
    assert.deepEqual(cd.bars.map((bar) => [bar.label, bar.start, bar.end]), [["CD Mall", "2026-10-12", "2026-10-18"], ["CD Final", "2026-10-19", "2026-10-26"]]);
    assert.equal(cd.subtitle, "Dates from the plan");
  });

  it("keeps one bar and says so when the dates were set by hand", () => {
    const cd = buildProjectTimelineRows(project, phases(true), plan()).find((row) => row.id === "c")!;
    assert.equal(cd.bars.length, 1);
    assert.equal(cd.subtitle, "Dates set by hand");
  });

  it("draws a phase with only an end date as a marker, and one with none as a quiet empty row", () => {
    const rows = buildProjectTimelineRows(project, phases(), plan());
    const design = rows.find((row) => row.id === "d")!;
    assert.equal(design.bars.length, 0);
    assert.equal(design.markers!.length, 1);
    const mood = rows.find((row) => row.id === "m")!;
    assert.deepEqual([mood.bars.length, mood.markers!.length, mood.subtitle], [0, 0, "No dates"]);
  });

  it("shows a forecast marker only when it lands after the opening date", () => {
    const fits = buildProjectTimelineRows(project, phases(), plan());
    assert.equal(fits[0]!.markers!.some((marker) => marker.id === "forecast"), false);
    const late = buildProjectTimelineRows({ ...project, openingDate: "2027-01-04" }, phases(), plan());
    assert.equal(late[0]!.markers!.find((marker) => marker.id === "forecast")?.tone, "warning");
    const noPlan = buildProjectTimelineRows({ ...project, fitOutStartDate: null }, phases(), plan({ fitOutStartDate: null, milestones: null, endPlanned: null }));
    assert.deepEqual(noPlan[0]!.markers!.map((marker) => marker.id), ["start", "opening"]);
  });

  it("marks END as actual once Construction Drawing is done", () => {
    const rows = buildProjectTimelineRows(project, phases(), plan({ endActual: "2026-10-20" }));
    const end = rows[0]!.markers!.find((marker) => marker.id === "end")!;
    assert.deepEqual([end.date, end.label], ["2026-10-20", "END (CD done)"]);
  });
});
