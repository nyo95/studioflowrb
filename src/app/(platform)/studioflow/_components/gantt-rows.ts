import { phaseAccentDotClass, phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";

import type { GanttBarData, GanttMarkerData } from "./gantt-chart";

export type GanttPhaseInput = {
  id: string;
  definitionId: string | null;
  label: string;
  status: PhaseStatus;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
};

const BAR_STATE: Record<PhaseStatus, GanttBarData["state"]> = { DONE: "done", ACTIVE: "active", PENDING: "pending" };

/**
 * One bar per phase that has BOTH planned dates; a phase with only one date becomes a marker, and a phase with
 * none is simply not drawn (the old equal-width stand-in implied dates that nobody had set).
 */
export function phaseBarsAndMarkers(phases: readonly GanttPhaseInput[], options: { onBarClick?: (phase: GanttPhaseInput) => void } = {}): { bars: GanttBarData[]; markers: GanttMarkerData[]; undated: number } {
  const bars: GanttBarData[] = [];
  const markers: GanttMarkerData[] = [];
  let undated = 0;
  for (const phase of phases) {
    const status = phaseStatusDisplay(phase.status).label;
    if (phase.plannedStartDate && phase.plannedEndDate) {
      bars.push({
        id: phase.id,
        start: phase.plannedStartDate,
        end: phase.plannedEndDate,
        accentClass: phaseAccentDotClass(phase.definitionId),
        state: BAR_STATE[phase.status],
        label: phase.label,
        title: `${phase.label} — ${status} (${phase.plannedStartDate} – ${phase.plannedEndDate})`,
        onClick: options.onBarClick ? () => options.onBarClick!(phase) : undefined,
      });
    } else if (phase.plannedEndDate || phase.plannedStartDate) {
      markers.push({ id: phase.id, date: (phase.plannedEndDate ?? phase.plannedStartDate)!, label: `${phase.label} ${phase.plannedEndDate ? "ends" : "starts"}`, tone: "milestone" });
    } else {
      undated += 1;
    }
  }
  return { bars, markers, undated };
}
