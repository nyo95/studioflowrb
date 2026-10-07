"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { GanttZoom } from "@/apps/studioflow/domain/gantt";
import type { PhaseStatus } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Button, EmptyState, FilterChip, Input, SectionCard, Select, TableToolbar, Text } from "@/platform/ui_engine";

import { GanttChart, type GanttRowData } from "../_components/gantt-chart";
import { phaseBarsAndMarkers } from "../_components/gantt-rows";
import { EditPhaseDatesDialog } from "./edit-phase-dates-dialog";
import { EditProjectDatesDialog } from "./edit-project-dates-dialog";

export type TimelinePhase = { id: string; definitionId: string | null; label: string; status: PhaseStatus; plannedStartDate: string | null; plannedEndDate: string | null };
export type TimelineProject = {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
  openingDate: string | null;
  timelineStartDate: string;
  fitOutStartDate: string | null;
  phases: TimelinePhase[];
};

const STATUS_OPTIONS = [["ALL", "All"], ["ACTIVE", "Active"], ["ON_HOLD", "On hold"], ["COMPLETED", "Completed"]] as const;

export function TimelineDirectory({
  projects,
  people,
  clients,
  filters,
  canManage,
  editable,
  now,
}: {
  projects: TimelineProject[];
  people: Array<{ id: string; displayName: string }>;
  clients: Array<{ id: string; name: string }>;
  filters: { status: string; pic: string; client: string; from: string; to: string; archived: boolean };
  /** Captured once on the server and passed through, so the "today" marker matches between SSR and hydration instead of drifting with a fresh client-side `Date.now()`. */
  now: number;
  canManage: boolean;
  /** Per project: may the viewer edit its dates, and which phases (PIC assignment). */
  editable: Record<string, { project: boolean; phaseIds: string[] }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<{ projectId: string; phase: TimelinePhase } | null>(null);
  const [editingProject, setEditingProject] = useState<TimelineProject | null>(null);
  const [zoom, setZoom] = useState<GanttZoom>("month");
  const today = new Date(now).toISOString().slice(0, 10);

  const rows: GanttRowData[] = projects.filter((project) => project.phases.length > 0).map((project) => {
    const phaseIds = editable[project.id]?.phaseIds ?? [];
    const { bars, markers, undated } = phaseBarsAndMarkers(project.phases, {
      onBarClick: canManage ? (phase) => { if (phaseIds.includes(phase.id)) setEditing({ projectId: project.id, phase }); } : undefined,
    });
    if (project.fitOutStartDate) markers.push({ id: `${project.id}:fit-out`, date: project.fitOutStartDate, label: "Fit Out Start", tone: "milestone" });
    if (project.openingDate) markers.push({ id: `${project.id}:opening`, date: project.openingDate, label: "Opening", tone: "opening" });
    const canEditDates = canManage && (editable[project.id]?.project ?? false);
    return {
      id: project.id,
      title: <Link href={STUDIOFLOW_ROUTES.projectTimeline(project.id)} prefetch={false} className="no-underline hover:underline">{project.name}</Link>,
      subtitle: `${project.client?.name ?? "No client"}${undated > 0 ? ` · ${undated} phase${undated === 1 ? "" : "s"} without dates` : ""}`,
      bars: canManage ? bars.map((bar) => (phaseIds.includes(bar.id) ? bar : { ...bar, onClick: undefined })) : bars,
      markers,
      span: project.openingDate ? { start: project.timelineStartDate, end: project.openingDate } : null,
      trailing: canEditDates ? <Button type="button" size="sm" variant="ghost" onClick={() => setEditingProject(project)}>Dates</Button> : null,
      emptyText: "No planned dates — open Dates",
    };
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="grid gap-3">
      <TableToolbar
        filters={
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map(([value, label]) => (
              <FilterChip
                key={value}
                selected={!filters.archived && filters.status === value}
                onClick={() => {
                  const next = new URLSearchParams(searchParams.toString());
                  next.delete("view");
                  value === "ALL" ? next.delete("status") : next.set("status", value);
                  router.replace(`${pathname}?${next}`);
                }}
              >
                {label}
              </FilterChip>
            ))}
            <FilterChip selected={filters.archived} onClick={() => setParam("view", filters.archived ? "" : "archived")}>Archived</FilterChip>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
            <FilterChip selected={zoom === "week"} onClick={() => setZoom("week")}>Week</FilterChip>
            <FilterChip selected={zoom === "month"} onClick={() => setZoom("month")}>Month</FilterChip>
            <div className="w-40 shrink-0">
              <Select aria-label="Designer / drafter" density="compact" value={filters.pic} onChange={(e) => setParam("pic", e.target.value)}>
                <option value="">Anyone</option>
                <option value="me">My projects</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </div>
            {clients.length > 0 ? (
              <div className="w-44 shrink-0">
                <Select aria-label="Client" density="compact" value={filters.client} onChange={(e) => setParam("client", e.target.value)}>
                  <option value="">Any client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <Input aria-label="From date" type="date" density="compact" className="w-36" value={filters.from} onChange={(e) => setParam("from", e.target.value)} />
              <Text tone="tertiary" size="sm">–</Text>
              <Input aria-label="To date" type="date" density="compact" className="w-36" value={filters.to} onChange={(e) => setParam("to", e.target.value)} />
            </div>
          </div>
        }
      />

      {projects.length === 0 ? (
        <SectionCard padded>
          <EmptyState title={filters.archived ? "No archived projects match" : "No projects match"} />
        </SectionCard>
      ) : (
        <SectionCard padded={false}>
          <GanttChart label="Project timeline" rows={rows} today={today} zoom={zoom} />
        </SectionCard>
      )}

      {editingProject ? <EditProjectDatesDialog project={editingProject} onClose={() => setEditingProject(null)} /> : null}

      {editing ? (
        <EditPhaseDatesDialog projectId={editing.projectId} phase={editing.phase} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
