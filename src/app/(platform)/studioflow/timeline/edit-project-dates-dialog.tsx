"use client";

import { useState, type FormEvent } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input, Notice, Text } from "@/platform/ui_engine";

import { applyProjectPlanAction, setFitOutStartAction, setProjectDatesAction } from "../actions";
import { useCommand } from "../_components/use-command";
import type { TimelineProject } from "./timeline-directory";

type PlanResult = {
  written: string[];
  unchanged: string[];
  kept: string[];
  warnings: string[];
  milestones: { designFinal: string; cdMallStart: string; cdFinalStart: string; end: string; fitOutStart: string; handover: string; openingForecast: string };
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

/** The one place a project's overall schedule is set (owner, 2026-09-30): start, Fit Out Start and opening date. Phase dates are set from the bar. */
export function EditProjectDatesDialog({ project, onClose }: { project: TimelineProject; onClose: () => void }) {
  const { run, pendingKey, error } = useCommand();
  const [form, setForm] = useState({ timelineStartDate: project.timelineStartDate, openingDate: project.openingDate ?? "", fitOutStartDate: project.fitOutStartDate ?? "" });
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const pending = pendingKey !== null;

  const saveAll = async () => {
    const dates = await run("save", () => setProjectDatesAction({ projectId: project.id, timelineStartDate: form.timelineStartDate || null, openingDate: form.openingDate || null }));
    if (!dates) return false;
    return run("fit-out", () => setFitOutStartAction({ projectId: project.id, fitOutStartDate: form.fitOutStartDate }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (await saveAll()) onClose();
  };

  const onApply = async () => {
    if (!form.fitOutStartDate || !(await saveAll())) return;
    await run("apply", () => applyProjectPlanAction(project.id), (data) => setPlan(data as PlanResult));
  };

  return (
    <DraftDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`${project.name} — project dates`}
      description="The bar runs from the start to the opening date. Clear the start to use the day the project was added; clear the opening date if it is still open-ended."
      size="sm"
      pending={pending}
      watchedValue={JSON.stringify(form)}
    >
      <form className="grid gap-3.5" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3 max-[420px]:grid-cols-1">
          <Field label="Start">
            <Input type="date" value={form.timelineStartDate} onChange={(e) => setForm((f) => ({ ...f, timelineStartDate: e.target.value }))} />
          </Field>
          <Field label="Opening date">
            <Input type="date" value={form.openingDate} onChange={(e) => setForm((f) => ({ ...f, openingDate: e.target.value }))} />
          </Field>
        </div>
        <Field label="Fit Out Start" description="When the contractor starts work from the CD drawings. Design dates are counted back from it; Handover and Opening forward.">
          <Input type="date" value={form.fitOutStartDate} onChange={(e) => setForm((f) => ({ ...f, fitOutStartDate: e.target.value }))} />
        </Field>
        {plan ? <PlanSummary plan={plan} /> : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="button" disabled={!form.fitOutStartDate || pending} pending={pendingKey === "apply"} onClick={() => void onApply()}>Save and apply plan</Button>
          <Button type="submit" variant="primary" pending={pendingKey === "save" || pendingKey === "fit-out"}>Save dates</Button>
        </FormActions>
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
