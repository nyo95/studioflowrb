"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { phaseAccentDotClass, phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { computePhaseSegments, resolveTimelineSpan } from "@/apps/studioflow/domain/timeline";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { EmptyState, FilterChip, Input, SectionCard, Select, TableToolbar, Text } from "@/platform/ui_engine";

import { EditPhaseDatesDialog } from "./edit-phase-dates-dialog";

export type TimelinePhase = { id: string; definitionId: string | null; label: string; status: PhaseStatus; plannedStartDate: string | null; plannedEndDate: string | null };
export type TimelineProject = {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
  openingDate: string | null;
  timelineStartDate: string;
  phases: TimelinePhase[];
};

const STATUS_OPTIONS = [["ALL", "All"], ["ACTIVE", "Active"], ["ON_HOLD", "On hold"], ["COMPLETED", "Completed"]] as const;

export function TimelineDirectory({
  projects,
  people,
  clients,
  filters,
  canManage,
  now,
}: {
  projects: TimelineProject[];
  people: Array<{ id: string; displayName: string }>;
  clients: Array<{ id: string; name: string }>;
  filters: { status: string; pic: string; client: string; from: string; to: string; archived: boolean };
  /** Captured once on the server and passed through, so the "today" marker matches between SSR and hydration instead of drifting with a fresh client-side `Date.now()`. */
  now: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<{ projectId: string; phase: TimelinePhase } | null>(null);

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
        <div className="grid gap-3">
          {projects.map((project) => (
            <TimelineRow key={project.id} project={project} canManage={canManage} now={now} onEditPhase={(phase) => setEditing({ projectId: project.id, phase })} />
          ))}
        </div>
      )}

      {editing ? (
        <EditPhaseDatesDialog projectId={editing.projectId} phase={editing.phase} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function TimelineRow({ project, canManage, now, onEditPhase }: { project: TimelineProject; canManage: boolean; now: number; onEditPhase: (phase: TimelinePhase) => void }) {
  if (project.phases.length === 0) return null;
  const span = resolveTimelineSpan(project.timelineStartDate, project.openingDate, { phases: project.phases, now });
  const segments = computePhaseSegments(span, project.phases);

  return (
    <SectionCard
      title={<Link href={STUDIOFLOW_ROUTES.project(project.id)} prefetch={false} className="no-underline hover:underline">{project.name}</Link>}
      description={project.client?.name ?? "No client"}
    >
      <div className="grid gap-2 px-(--ui-section-px) py-3">
        <div className="relative h-7 overflow-hidden rounded-control border border-line bg-surface-muted">
          {project.phases.map((phase, index) => {
            const segment = segments[index]!;
            const style = { left: `${segment.leftPct}%`, width: `${segment.widthPct}%` };
            const title = `${phase.label} — ${phaseStatusDisplay(phase.status).label}${segment.dated ? ` (${phase.plannedStartDate} – ${phase.plannedEndDate})` : " — no planned dates, click to set"}`;
            const tone = `${phaseAccentDotClass(phase.definitionId)} ${phase.status === "PENDING" ? "opacity-30" : "opacity-90"}`;
            return canManage ? (
              <button
                key={phase.id}
                type="button"
                title={title}
                aria-label={title}
                style={style}
                className={`absolute inset-y-0 cursor-pointer border-r border-surface p-0 last:border-r-0 hover:brightness-95 ${tone}`}
                onClick={() => onEditPhase(phase)}
              />
            ) : (
              <div key={phase.id} title={title} style={style} className={`absolute inset-y-0 border-r border-surface last:border-r-0 ${tone}`} />
            );
          })}
          {span.showTodayMarker ? <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${span.todayPct}%` }} aria-hidden="true" /> : null}
        </div>
        <div className="flex items-center justify-between">
          <Text tone="tertiary" size="sm">{project.timelineStartDate}</Text>
          <Text tone="tertiary" size="sm">{project.openingDate ?? "Ongoing"}</Text>
        </div>
      </div>
    </SectionCard>
  );
}
