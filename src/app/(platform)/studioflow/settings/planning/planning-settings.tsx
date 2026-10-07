"use client";

import { useState } from "react";

import { Button, Field, FormActions, InlineError, Input, SectionCard, Text } from "@/platform/ui_engine";

import { addHolidayAction, removeHolidayAction, setPlanningDefaultsAction } from "../../actions";
import { useCommand } from "../../_components/use-command";

type Intervals = { cdMall: number; cdFinal: number; gap: number; fitOutToHandover: number; handoverToOpening: number };
type Holiday = { id: string; date: string; label: string };

const FIELDS: Array<[keyof Intervals, string, string]> = [
  ["cdMall", "CD Mall", "Working days to produce the CD Mall."],
  ["cdFinal", "CD Final", "Working days from CD Mall to CD Final."],
  ["gap", "Gap before Fit Out", "Working days between END (CD done) and Fit Out Start."],
  ["fitOutToHandover", "Fit Out to Handover", "Working days from Fit Out Start to Handover."],
  ["handoverToOpening", "Handover to Opening", "Working days from Handover to the opening date."],
];

const validDays = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 260;

/** Studio-wide planning lead times and the hand-entered holiday list (Monday to Friday are working days). A project may still override any interval. */
export function PlanningSettings({ intervals, holidays, canManage }: { intervals: Intervals; holidays: Holiday[]; canManage: boolean }) {
  const { run, pendingKey, error } = useCommand();
  const [draft, setDraft] = useState<Record<keyof Intervals, string>>(() => Object.fromEntries(FIELDS.map(([key]) => [key, String(intervals[key])])) as Record<keyof Intervals, string>);
  const [seen, setSeen] = useState(intervals);
  if (JSON.stringify(seen) !== JSON.stringify(intervals)) {
    setSeen(intervals);
    setDraft(Object.fromEntries(FIELDS.map(([key]) => [key, String(intervals[key])])) as Record<keyof Intervals, string>);
  }
  const allValid = FIELDS.every(([key]) => validDays(draft[key]));
  const dirty = FIELDS.some(([key]) => draft[key] !== String(intervals[key]));
  const [holiday, setHoliday] = useState({ date: "", label: "" });

  return (
    <div className="grid gap-4">
      <SectionCard title="Lead times" padded>
        <div className="grid gap-4">
          <Text size="sm" tone="secondary">Counted in working days, Monday to Friday, skipping the holidays below. A single project can override any of these from its own dates.</Text>
          <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
            {FIELDS.map(([key, label, description]) => (
              <Field key={key} label={label} description={description} error={draft[key] !== "" && !validDays(draft[key]) ? "Enter a whole number from 1 to 260." : undefined}>
                <Input type="number" inputMode="numeric" min={1} max={260} step={1} className="w-28" value={draft[key]} disabled={!canManage || pendingKey === "defaults"} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
              </Field>
            ))}
          </div>
          {canManage ? (
            <FormActions>
              <Button variant="primary" disabled={!allValid || !dirty} pending={pendingKey === "defaults"} onClick={() => void run("defaults", () => setPlanningDefaultsAction({ cdMall: Number(draft.cdMall), cdFinal: Number(draft.cdFinal), gap: Number(draft.gap), fitOutToHandover: Number(draft.fitOutToHandover), handoverToOpening: Number(draft.handoverToOpening) }))}>Save lead times</Button>
            </FormActions>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Holidays" count={holidays.length} padded>
        <div className="grid gap-3">
          <Text size="sm" tone="secondary">Public holidays and shared leave days are not working days. They are entered by hand.</Text>
          {holidays.length === 0 ? <Text size="sm" tone="tertiary">No holidays entered. Plans count weekends only.</Text> : (
            <div className="grid">
              {holidays.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 border-t border-line py-1.5">
                  <Text size="sm"><span className="font-ui-mono tabular-nums">{entry.date}</span> · {entry.label}</Text>
                  {canManage ? <Button size="sm" variant="ghost" pending={pendingKey === `remove:${entry.id}`} onClick={() => void run(`remove:${entry.id}`, () => removeHolidayAction(entry.id))}>Remove</Button> : null}
                </div>
              ))}
            </div>
          )}
          {canManage ? (
            <form
              className="flex flex-wrap items-end gap-3 border-t border-line pt-3"
              onSubmit={async (event) => { event.preventDefault(); if (await run("add", () => addHolidayAction({ date: holiday.date, label: holiday.label.trim() }))) setHoliday({ date: "", label: "" }); }}
            >
              <Field label="Date"><Input type="date" value={holiday.date} onChange={(event) => setHoliday((current) => ({ ...current, date: event.target.value }))} /></Field>
              <Field label="Name"><Input value={holiday.label} maxLength={120} placeholder="e.g. Nyepi" onChange={(event) => setHoliday((current) => ({ ...current, label: event.target.value }))} /></Field>
              <Button type="submit" variant="primary" disabled={!holiday.date || !holiday.label.trim()} pending={pendingKey === "add"}>Add holiday</Button>
            </form>
          ) : null}
        </div>
      </SectionCard>
      {error && pendingKey === null ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
