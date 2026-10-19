"use client";

import { useMemo, useState } from "react";

import type { GanttZoom } from "@/apps/studioflow/domain/gantt";
import { FilterChip, SectionCard } from "@/platform/ui_engine";

import { GanttChart } from "../../../_components/gantt-chart";
import { buildProjectTimelineRows, type Plan, type PhaseInput, type ProjectInput } from "./project-timeline-rows";

/**
 * Read-only (owner, 2026-10-19): dates, lead times and Apply plan live only on the portfolio Timeline.
 * This project tab is a schedule view, never a jump point for changing dates.
 */
export function ProjectTimeline({ project, phases, plan, today }: { project: ProjectInput; phases: PhaseInput[]; plan: Plan; today: string }) {
  const [zoom, setZoom] = useState<GanttZoom>("week");
  const rows = useMemo(() => buildProjectTimelineRows(project, phases, plan), [project, phases, plan]);

  return (
    <SectionCard
      title="Timeline"
      description={plan.designHandoverDate ? `Every phase at its planned dates, calculated backward from Design Handover ${plan.designHandoverDate}.` : "Every phase at its planned dates. No Design Handover yet, so nothing is planned."}
      action={
        <div className="flex items-center gap-1.5">
          <FilterChip selected={zoom === "week"} onClick={() => setZoom("week")}>Week</FilterChip>
          <FilterChip selected={zoom === "month"} onClick={() => setZoom("month")}>Month</FilterChip>
        </div>
      }
      padded={false}
    >
      <GanttChart label={`${project.name} timeline`} rows={rows} today={today} zoom={zoom} />
    </SectionCard>
  );
}
