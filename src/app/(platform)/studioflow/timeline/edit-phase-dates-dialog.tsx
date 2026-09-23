"use client";

import { useState, type FormEvent } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input } from "@/platform/ui_engine";

import { setPhasePlannedDatesAction } from "../actions";
import { useCommand } from "../_components/use-command";
import type { TimelinePhase } from "./timeline-directory";

/** Portfolio Timeline (owner, 2026-09-23): set/clear one phase's planned start/end. Clearing a field resets that phase back to the equal-width sequence fallback on the Gantt bar. */
export function EditPhaseDatesDialog({ projectId, phase, onClose }: { projectId: string; phase: TimelinePhase; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [form, setForm] = useState({ plannedStartDate: phase.plannedStartDate ?? "", plannedEndDate: phase.plannedEndDate ?? "" });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run("save", () => setPhasePlannedDatesAction({
      projectId,
      phaseId: phase.id,
      plannedStartDate: form.plannedStartDate || null,
      plannedEndDate: form.plannedEndDate || null,
    }));
    if (ok) onClose();
  };

  return (
    <DraftDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`${phase.label} — planned dates`}
      description="Drives this phase's position on the Gantt bar. Leave both blank to fall back to the equal-width sequence split."
      size="sm"
      pending={pending}
      watchedValue={JSON.stringify(form)}
    >
      <form className="grid gap-3.5" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3 max-[420px]:grid-cols-1">
          <Field label="Planned start">
            <Input type="date" value={form.plannedStartDate} onChange={(e) => setForm((f) => ({ ...f, plannedStartDate: e.target.value }))} />
          </Field>
          <Field label="Planned end">
            <Input type="date" value={form.plannedEndDate} onChange={(e) => setForm((f) => ({ ...f, plannedEndDate: e.target.value }))} />
          </Field>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending}>Save dates</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
