"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input, Notice, Text } from "@/platform/ui_engine";

import { applyProjectPlanAction, getProjectPlanEditorAction, resetPhasePlannedDatesAction, setFitOutStartAction, setPlanOverridesAction, setProjectDatesAction } from "../actions";
import { useCommand } from "../_components/use-command";
import { PLANNED_DEFINITIONS, type Intervals, type Plan } from "../projects/[projectId]/timeline/project-timeline-rows";
import type { TimelineProject } from "./timeline-directory";

type PlanResult = {
  written: string[];
  unchanged: string[];
  kept: string[];
  warnings: string[];
  milestones: { designFinal: string; cdMallStart: string; cdFinalStart: string; end: string; fitOutStart: string; handover: string; openingForecast: string };
};

type Editor = {
  plan: Plan;
  studioDefaults: Intervals;
  phases: Array<{ id: string; definitionId: string | null; label: string; plannedStartDate: string | null; plannedEndDate: string | null; manual: boolean }>;
};

const MILESTONES: Array<[keyof PlanResult["milestones"], string]> = [
  ["designFinal", "Design Final"],
  ["cdMallStart", "CD Mall starts"],
  ["cdFinalStart", "CD Final starts"],
  ["end", "END (CD done)"],
  ["fitOutStart", "Fit Out Start"],
  ["handover", "Handover"],
  ["openingForecast", "Opening (forecast)"],
];

const INTERVAL_FIELDS: Array<[keyof Intervals, string]> = [
  ["cdMall", "CD Mall"],
  ["cdFinal", "CD Final"],
  ["gap", "Gap before Fit Out"],
  ["fitOutToHandover", "Fit Out to Handover"],
  ["handoverToOpening", "Handover to Opening"],
];

const leadDraftOf = (overrides: Partial<Intervals> | null) =>
  Object.fromEntries(INTERVAL_FIELDS.map(([key]) => [key, overrides?.[key] !== undefined ? String(overrides[key]) : ""])) as Record<keyof Intervals, string>;

/**
 * The one place a project's schedule is set (owner, 2026-09-30; plan settings moved here from the project
 * Timeline tab, owner 2026-10-07): start, Fit Out Start, opening date, this project's lead times, the
 * plan's warnings and hand-set phase dates. The project's own Timeline tab only shows the result.
 */
export function EditProjectDatesDialog({ project, onClose }: { project: TimelineProject; onClose: () => void }) {
  const { run, pendingKey, error } = useCommand();
  const [form, setForm] = useState({ timelineStartDate: project.timelineStartDate, openingDate: project.openingDate ?? "", fitOutStartDate: project.fitOutStartDate ?? "" });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lead, setLead] = useState<Record<keyof Intervals, string>>(() => leadDraftOf(null));
  const [result, setResult] = useState<PlanResult | null>(null);
  const pending = pendingKey !== null;

  const receive = (response: Awaited<ReturnType<typeof getProjectPlanEditorAction>>) => {
    if (!response.ok) { setLoadError(response.error.safeMessage); return; }
    setEditor(response.data);
    setLead(leadDraftOf(response.data.plan.overrides));
  };
  const load = async () => receive(await getProjectPlanEditorAction(project.id));
  // Loaded once per open (the dialog unmounts on close); state is set in the promise callback, not the effect body.
  useEffect(() => {
    let live = true;
    void getProjectPlanEditorAction(project.id).then((response) => { if (live) receive(response); });
    return () => { live = false; };
  }, [project.id]);

  const parsed = (key: keyof Intervals) => (lead[key].trim() === "" ? null : /^\d+$/.test(lead[key].trim()) && Number(lead[key]) >= 1 && Number(lead[key]) <= 260 ? Number(lead[key]) : Number.NaN);
  const leadInvalid = INTERVAL_FIELDS.some(([key]) => Number.isNaN(parsed(key)));
  // Only a value that differs from the studio default is stored, so a later change of the default still reaches this project.
  const nextOverrides = editor
    ? Object.fromEntries(INTERVAL_FIELDS.flatMap(([key]) => { const value = parsed(key); return value !== null && !Number.isNaN(value) && value !== editor.studioDefaults[key] ? [[key, value]] : []; })) as Partial<Intervals>
    : {};
  const leadDirty = editor !== null && JSON.stringify(nextOverrides) !== JSON.stringify(editor.plan.overrides ?? {});
  const manualPlanned = (editor?.phases ?? []).filter((phase) => phase.manual && phase.definitionId !== null && PLANNED_DEFINITIONS.has(phase.definitionId));

  const saveAll = async () => {
    if (leadInvalid) return false;
    const dates = await run("save", () => setProjectDatesAction({ projectId: project.id, timelineStartDate: form.timelineStartDate || null, openingDate: form.openingDate || null }));
    if (!dates) return false;
    if (!(await run("fit-out", () => setFitOutStartAction({ projectId: project.id, fitOutStartDate: form.fitOutStartDate })))) return false;
    if (leadDirty && !(await run("overrides", () => setPlanOverridesAction({ projectId: project.id, overrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : null })))) return false;
    return true;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await saveAll()) onClose();
  };

  const onApply = async () => {
    if (!form.fitOutStartDate || !(await saveAll())) return;
    await run("apply", () => applyProjectPlanAction(project.id), (data) => setResult(data as PlanResult));
    await load();
  };

  const backToPlan = async (phaseId: string) => {
    if (await run(`reset:${phaseId}`, () => resetPhasePlannedDatesAction(project.id, phaseId))) await load();
  };

  return (
    <DraftDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`${project.name} — dates and plan`}
      description="The bar runs from the start to the opening date. Design dates are counted back from Fit Out Start in working days (Monday to Friday, skipping holidays); Handover and Opening forward."
      size="md"
      pending={pending}
      watchedValue={JSON.stringify({ form, leadDirty })}
    >
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-3 gap-3 max-[560px]:grid-cols-1">
          <Field label="Start">
            <Input type="date" value={form.timelineStartDate} onChange={(e) => setForm((f) => ({ ...f, timelineStartDate: e.target.value }))} />
          </Field>
          <Field label="Fit Out Start" description="When the contractor starts work from the CD drawings.">
            <Input type="date" value={form.fitOutStartDate} onChange={(e) => setForm((f) => ({ ...f, fitOutStartDate: e.target.value }))} />
          </Field>
          <Field label="Opening date">
            <Input type="date" value={form.openingDate} onChange={(e) => setForm((f) => ({ ...f, openingDate: e.target.value }))} />
          </Field>
        </div>

        {editor?.plan.suggestedFitOutStart && editor.plan.suggestedFitOutStart !== form.fitOutStartDate ? (
          <Notice tone="neutral" title="Suggested Fit Out Start">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Construction Drawing finished on {editor.plan.endActual}. Starting fit-out on {editor.plan.suggestedFitOutStart} leaves the usual gap.</span>
              <Button type="button" size="sm" onClick={() => setForm((f) => ({ ...f, fitOutStartDate: editor.plan.suggestedFitOutStart! }))}>Use {editor.plan.suggestedFitOutStart}</Button>
            </div>
          </Notice>
        ) : null}

        <div className="grid gap-2 border-t border-line pt-3">
          <Text size="sm" weight="semibold">Lead times for this project (working days)</Text>
          {loadError ? <InlineError>{loadError}</InlineError> : null}
          <div className="grid grid-cols-3 gap-3 max-[560px]:grid-cols-2">
            {INTERVAL_FIELDS.map(([key, label]) => (
              <Field key={key} label={label} description={editor ? `Studio default ${editor.studioDefaults[key]}` : "Loading…"} error={Number.isNaN(parsed(key)) ? "Whole number from 1 to 260, or empty." : undefined}>
                <Input type="number" inputMode="numeric" min={1} max={260} step={1} placeholder={editor ? String(editor.studioDefaults[key]) : ""} value={lead[key]} disabled={!editor || pending} onChange={(event) => setLead((current) => ({ ...current, [key]: event.target.value }))} />
              </Field>
            ))}
          </div>
          <Text size="sm" tone="tertiary">Empty means the studio default.</Text>
        </div>

        {manualPlanned.length > 0 ? (
          <div className="grid gap-1 border-t border-line pt-3">
            <Text size="sm" weight="semibold">Dates you set by hand</Text>
            {manualPlanned.map((phase) => (
              <div key={phase.id} className="flex items-center justify-between gap-3 border-t border-line-subtle py-1.5">
                <Text size="sm">{phase.label} · {phase.plannedStartDate ?? "?"} – {phase.plannedEndDate ?? "?"}</Text>
                <Button type="button" size="sm" variant="ghost" disabled={!editor?.plan.fitOutStartDate || pending} pending={pendingKey === `reset:${phase.id}`} onClick={() => void backToPlan(phase.id)}>Back to the plan</Button>
              </div>
            ))}
          </div>
        ) : null}

        {result ? <PlanSummary plan={result} /> : (editor?.plan.warnings ?? []).map((warning) => <Notice key={warning} tone="warning" title="Check this">{warning}</Notice>)}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="button" disabled={!form.fitOutStartDate || leadInvalid || pending} pending={pendingKey === "apply"} onClick={() => void onApply()}>Save and apply plan</Button>
          <Button type="submit" variant="primary" disabled={leadInvalid} pending={pendingKey === "save" || pendingKey === "fit-out" || pendingKey === "overrides"}>Save</Button>
        </FormActions>
        <Text size="sm" tone="tertiary">Apply plan writes the computed dates to Design 3D, Construction Drawing and Construction. Dates you set by hand are kept.</Text>
      </form>
    </DraftDialog>
  );
}

function PlanSummary({ plan }: { plan: PlanResult }) {
  const touched = plan.written.length;
  return (
    <div className="grid gap-2">
      <Notice tone="success" title={touched > 0 ? `Plan applied to ${touched} ${touched === 1 ? "phase" : "phases"}` : "Plan already up to date"}>
        {plan.kept.length > 0 ? `${plan.kept.length} ${plan.kept.length === 1 ? "phase keeps" : "phases keep"} the dates you set by hand.` : "Phase dates follow the plan."}
      </Notice>
      <div className="grid gap-0.5">
        {MILESTONES.map(([key, label]) => (
          <div key={key} className="flex items-baseline justify-between gap-3 border-t border-line py-1">
            <Text size="sm" tone="secondary">{label}</Text>
            <Text size="sm">{plan.milestones[key]}</Text>
          </div>
        ))}
      </div>
      {plan.warnings.map((warning) => <Notice key={warning} tone="warning" title="Check this">{warning}</Notice>)}
    </div>
  );
}
