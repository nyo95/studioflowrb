import { dateOfDay, dayNumber } from "@/apps/studioflow/domain/gantt";
import { LEGACY_PHASE_DEFINITION_IDS as DEFS, type PhaseStatus } from "@/apps/studioflow/domain/phase";

import type { GanttBarData, GanttMarkerData, GanttRowData } from "../../../_components/gantt-chart";
import { phaseBarsAndMarkers } from "../../../_components/gantt-rows";

export type Intervals = { cdMall: number; cdFinal: number; gap: number; fitOutToHandover: number; handoverToOpening: number };
export type Plan = {
  fitOutStartDate: string | null;
  designHandoverDate: string | null;
  intervals: Intervals;
  overrides: Partial<Intervals> | null;
  milestones: { designFinal: string; cdMallStart: string; cdFinalStart: string; end: string; fitOutStart: string; handover: string; openingForecast: string } | null;
  endPlanned: string | null;
  endActual: string | null;
  suggestedFitOutStart: string | null;
  warnings: string[];
};
export type PhaseInput = { id: string; definitionId: string | null; label: string; status: PhaseStatus; plannedStartDate: string | null; plannedEndDate: string | null; manual: boolean };
export type ProjectInput = { id: string; name: string; client: { id: string; name: string } | null; openingDate: string | null; timelineStartDate: string; fitOutStartDate: string | null; designHandoverDate: string | null };

export const PLANNED_DEFINITIONS: ReadonlySet<string> = new Set([DEFS.design3d, DEFS.cd, DEFS.supervision]);

/** A lead-time field: empty = studio default (null), otherwise whole days 1–260 (CD Mall may be 0, as the server allows); NaN when invalid. */
export function parseLeadDays(key: keyof Intervals, text: string): number | null {
  const value = text.trim();
  if (value === "") return null;
  const n = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return n >= (key === "cdMall" ? 0 : 1) && n <= 260 ? n : Number.NaN;
}

const dayBefore = (date: string) => dateOfDay(dayNumber(date) - 1);

export function buildProjectTimelineRows(project: ProjectInput, phases: PhaseInput[], plan: Plan): GanttRowData[] {
  const m = plan.milestones;
  const markers: GanttMarkerData[] = [{ id: "start", date: project.timelineStartDate, label: "Start", tone: "milestone" }];
  const endDate = plan.endActual ?? plan.endPlanned;
  if (m) markers.push({ id: "design-final", date: m.designFinal, label: "Design Final", tone: "milestone" });
  if (endDate) markers.push({ id: "end", date: endDate, label: plan.endActual ? "END (CD done)" : "END (CD planned)", tone: "milestone" });
  if (project.fitOutStartDate) markers.push({ id: "fit-out", date: project.fitOutStartDate, label: "Fit Out Start", tone: "milestone" });
  if (m) markers.push({ id: "handover", date: m.handover, label: "Handover", tone: "milestone" });
  if (project.openingDate) markers.push({ id: "opening", date: project.openingDate, label: "Opening", tone: "opening" });
  if (m && (!project.openingDate || m.openingForecast > project.openingDate)) markers.push({ id: "forecast", date: m.openingForecast, label: "Opening (forecast)", tone: project.openingDate ? "warning" : "milestone" });

  const rows: GanttRowData[] = [{ id: "milestones", title: "Milestones", subtitle: "From the plan", bars: [], markers, emptyText: "Set Design Handover" }];
  for (const phase of phases) {
    const { bars, markers: own, undated } = phaseBarsAndMarkers([phase]);
    const planned = phase.definitionId !== null && PLANNED_DEFINITIONS.has(phase.definitionId);
    // Construction Drawing shows its two steps while its dates are still the plan's own; a zero-day CD Mall has no step to draw.
    const splitCd = phase.definitionId === DEFS.cd && m && !phase.manual && m.cdMallStart < m.cdFinalStart && phase.plannedStartDate === m.cdMallStart && phase.plannedEndDate === m.end;
    const finalBars: GanttBarData[] = splitCd && bars[0]
      ? [
          { ...bars[0], id: `${phase.id}:mall`, end: dayBefore(m.cdFinalStart), label: "CD Mall", title: `CD Mall (${m.cdMallStart} – ${dayBefore(m.cdFinalStart)})` },
          { ...bars[0], id: `${phase.id}:final`, start: m.cdFinalStart, label: "CD Final", title: `CD Final (${m.cdFinalStart} – ${m.end})` },
        ]
      : bars;
    rows.push({
      id: phase.id,
      title: phase.label,
      subtitle: phase.manual && planned ? "Dates set by hand" : planned && (finalBars.length > 0 || own.length > 0) ? "Dates from the plan" : undated ? "No dates" : undefined,
      bars: finalBars,
      markers: own,
      emptyText: planned ? "Set Design Handover in Timeline and apply the plan" : "Not part of the plan — no dates",
    });
  }
  return rows;
}
