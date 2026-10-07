"use client";

import { useMemo, useState } from "react";

import type { GanttZoom } from "@/apps/studioflow/domain/gantt";
import { LEGACY_PHASE_DEFINITION_IDS as DEFS } from "@/apps/studioflow/domain/phase";
import { Button, Field, FilterChip, Input, Notice, SectionCard, Text } from "@/platform/ui_engine";

import { applyProjectPlanAction, resetPhasePlannedDatesAction, setFitOutStartAction, setPlanOverridesAction } from "../../../actions";
import { GanttChart } from "../../../_components/gantt-chart";
import { buildProjectTimelineRows, PLANNED_DEFINITIONS, type Intervals, type Plan, type PhaseInput, type ProjectInput } from "./project-timeline-rows";
import { useCommand } from "../../../_components/use-command";
import { EditProjectDatesDialog } from "../../../timeline/edit-project-dates-dialog";


const INTERVAL_FIELDS: Array<[keyof Intervals, string]> = [
  ["cdMall", "CD Mall"],
  ["cdFinal", "CD Final"],
  ["gap", "Gap before Fit Out"],
  ["fitOutToHandover", "Fit Out to Handover"],
  ["handoverToOpening", "Handover to Opening"],
];

export function ProjectTimeline({ project, phases, plan, studioDefaults, canEdit, today }: { project: ProjectInput; phases: PhaseInput[]; plan: Plan; studioDefaults: Intervals; canEdit: boolean; today: string }) {
  const [zoom, setZoom] = useState<GanttZoom>("week");
  const [datesOpen, setDatesOpen] = useState(false);

  const rows = useMemo(() => buildProjectTimelineRows(project, phases, plan), [project, phases, plan]);

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Timeline"
        description="Every phase at its planned dates, with the milestones that tie the design to the fit-out."
        action={
          <div className="flex items-center gap-1.5">
            <FilterChip selected={zoom === "week"} onClick={() => setZoom("week")}>Week</FilterChip>
            <FilterChip selected={zoom === "month"} onClick={() => setZoom("month")}>Month</FilterChip>
            {canEdit ? <Button size="sm" onClick={() => setDatesOpen(true)}>Project dates</Button> : null}
          </div>
        }
        padded={false}
      >
        <GanttChart label={`${project.name} timeline`} rows={rows} today={today} zoom={zoom} />
      </SectionCard>

      <PlanPanel project={project} phases={phases} plan={plan} studioDefaults={studioDefaults} canEdit={canEdit} />

      {datesOpen ? (
        <EditProjectDatesDialog
          project={{ ...project, phases: phases.map((phase) => ({ id: phase.id, definitionId: phase.definitionId, label: phase.label, status: phase.status, plannedStartDate: phase.plannedStartDate, plannedEndDate: phase.plannedEndDate })) }}
          onClose={() => setDatesOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PlanPanel({ project, phases, plan, studioDefaults, canEdit }: { project: ProjectInput; phases: PhaseInput[]; plan: Plan; studioDefaults: Intervals; canEdit: boolean }) {
  const { run, pendingKey, error } = useCommand();
  const [draft, setDraft] = useState<Record<keyof Intervals, string>>(() => Object.fromEntries(INTERVAL_FIELDS.map(([key]) => [key, plan.overrides?.[key] !== undefined ? String(plan.overrides[key]) : ""])) as Record<keyof Intervals, string>);
  const [seen, setSeen] = useState(plan.overrides);
  if (JSON.stringify(seen) !== JSON.stringify(plan.overrides)) {
    setSeen(plan.overrides);
    setDraft(Object.fromEntries(INTERVAL_FIELDS.map(([key]) => [key, plan.overrides?.[key] !== undefined ? String(plan.overrides[key]) : ""])) as Record<keyof Intervals, string>);
  }
  const [applied, setApplied] = useState<{ written: number; kept: number } | null>(null);

  const parsed = (key: keyof Intervals) => (draft[key].trim() === "" ? null : /^\d+$/.test(draft[key].trim()) && Number(draft[key]) >= 1 && Number(draft[key]) <= 260 ? Number(draft[key]) : Number.NaN);
  const invalid = INTERVAL_FIELDS.some(([key]) => Number.isNaN(parsed(key)));
  // Only a value that differs from the studio default is stored, so a later change of the default still reaches this project.
  const nextOverrides = Object.fromEntries(INTERVAL_FIELDS.flatMap(([key]) => { const value = parsed(key); return value !== null && !Number.isNaN(value) && value !== studioDefaults[key] ? [[key, value]] : []; })) as Partial<Intervals>;
  const dirty = JSON.stringify(nextOverrides) !== JSON.stringify(plan.overrides ?? {});
  const manualPlanned = phases.filter((phase) => phase.manual && phase.definitionId !== null && PLANNED_DEFINITIONS.has(phase.definitionId));

  return (
    <SectionCard title="Plan" description={plan.fitOutStartDate ? `Counted from Fit Out Start ${plan.fitOutStartDate}, Monday to Friday, skipping holidays.` : "Set a Fit Out Start to plan this project."} padded>
      <div className="grid gap-4">
        {plan.warnings.map((warning) => <Notice key={warning} tone="warning" title="Check this">{warning}</Notice>)}

        {plan.suggestedFitOutStart && canEdit ? (
          <Notice tone="neutral" title="Suggested Fit Out Start">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Construction Drawing finished on {plan.endActual}. Starting fit-out on {plan.suggestedFitOutStart} leaves the usual gap.</span>
              <Button size="sm" pending={pendingKey === "suggest"} onClick={() => void run("suggest", () => setFitOutStartAction({ projectId: project.id, fitOutStartDate: plan.suggestedFitOutStart! }))}>Use {plan.suggestedFitOutStart}</Button>
            </div>
          </Notice>
        ) : null}

        <div className="grid gap-2">
          <Text size="sm" weight="semibold">Lead times for this project (working days)</Text>
          <div className="grid grid-cols-3 gap-3 max-[820px]:grid-cols-2 max-[520px]:grid-cols-1">
            {INTERVAL_FIELDS.map(([key, label]) => (
              <Field key={key} label={label} description={`Studio default ${studioDefaults[key]}${plan.overrides?.[key] !== undefined ? ` · this project ${plan.overrides[key]}` : ""}`} error={Number.isNaN(parsed(key)) ? "Whole number from 1 to 260, or empty." : undefined}>
                <Input type="number" inputMode="numeric" min={1} max={260} step={1} className="w-28" placeholder={String(studioDefaults[key])} value={draft[key]} disabled={!canEdit || pendingKey === "overrides"} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
              </Field>
            ))}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={invalid || !dirty} pending={pendingKey === "overrides"} onClick={() => void run("overrides", () => setPlanOverridesAction({ projectId: project.id, overrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : null }))}>Save lead times</Button>
              <Text size="sm" tone="tertiary">Empty means the studio default.</Text>
            </div>
          ) : null}
        </div>

        {manualPlanned.length > 0 ? (
          <div className="grid gap-1">
            <Text size="sm" weight="semibold">Dates you set by hand</Text>
            {manualPlanned.map((phase) => (
              <div key={phase.id} className="flex items-center justify-between gap-3 border-t border-line py-1.5">
                <Text size="sm">{phase.label} · {phase.plannedStartDate ?? "?"} – {phase.plannedEndDate ?? "?"}</Text>
                {canEdit ? <Button size="sm" variant="ghost" disabled={!plan.fitOutStartDate} pending={pendingKey === `reset:${phase.id}`} onClick={() => void run(`reset:${phase.id}`, () => resetPhasePlannedDatesAction(project.id, phase.id))}>Back to the plan</Button> : null}
              </div>
            ))}
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <Button variant="primary" disabled={!plan.fitOutStartDate} pending={pendingKey === "apply"} onClick={() => void run("apply", () => applyProjectPlanAction(project.id), (data) => { const result = data as { written: string[]; kept: string[] }; setApplied({ written: result.written.length, kept: result.kept.length }); })}>Apply plan</Button>
            <Text size="sm" tone="secondary">
              {applied ? (applied.written > 0 ? `Updated ${applied.written} ${applied.written === 1 ? "phase" : "phases"}.` : "Phase dates already follow the plan.") + (applied.kept > 0 ? ` ${applied.kept} kept your own dates.` : "") : "Writes the computed dates to Design 3D, Construction Drawing and Construction. Dates you set by hand are kept."}
            </Text>
          </div>
        ) : null}
        {error && pendingKey === null ? <Notice tone="danger" title="Could not save">{error}</Notice> : null}
      </div>
    </SectionCard>
  );
}
