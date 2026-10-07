"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { GanttZoom } from "@/apps/studioflow/domain/gantt";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { FilterChip, SectionCard } from "@/platform/ui_engine";

import { GanttChart } from "../../../_components/gantt-chart";
import { buildProjectTimelineRows, type Plan, type PhaseInput, type ProjectInput } from "./project-timeline-rows";

/**
 * Read-only (owner, 2026-10-07): dates, lead times and Apply plan live in the "Dates & plan" dialog on the
 * studio Timeline; this tab only shows the result. Someone who may edit gets a link that opens that dialog.
 */
export function ProjectTimeline({ project, phases, plan, canEdit, today }: { project: ProjectInput; phases: PhaseInput[]; plan: Plan; canEdit: boolean; today: string }) {
  const [zoom, setZoom] = useState<GanttZoom>("week");
  const rows = useMemo(() => buildProjectTimelineRows(project, phases, plan), [project, phases, plan]);

  return (
    <SectionCard
      title="Timeline"
      description={plan.fitOutStartDate ? `Every phase at its planned dates, counted from Fit Out Start ${plan.fitOutStartDate} in working days.` : "Every phase at its planned dates. No Fit Out Start yet, so nothing is planned."}
      action={
        <div className="flex items-center gap-1.5">
          <FilterChip selected={zoom === "week"} onClick={() => setZoom("week")}>Week</FilterChip>
          <FilterChip selected={zoom === "month"} onClick={() => setZoom("month")}>Month</FilterChip>
          {canEdit ? (
            <Link
              href={`${STUDIOFLOW_ROUTES.timeline}?plan=${project.id}`}
              prefetch={false}
              className="inline-flex min-h-(--ui-control-height-sm) items-center rounded-control border border-line bg-surface px-2.5 text-xs font-medium text-ink no-underline hover:border-line-strong"
            >
              Edit dates and plan
            </Link>
          ) : null}
        </div>
      }
      padded={false}
    >
      <GanttChart label={`${project.name} timeline`} rows={rows} today={today} zoom={zoom} />
    </SectionCard>
  );
}
