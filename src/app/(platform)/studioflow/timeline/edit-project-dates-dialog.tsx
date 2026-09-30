"use client";

import { useState, type FormEvent } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input } from "@/platform/ui_engine";

import { setProjectDatesAction } from "../actions";
import { useCommand } from "../_components/use-command";
import type { TimelineProject } from "./timeline-directory";

/** The one place a project's overall schedule is set (owner, 2026-09-30): start and opening date. Phase dates are set from the bar. */
export function EditProjectDatesDialog({ project, onClose }: { project: TimelineProject; onClose: () => void }) {
  const { run, pending, error } = useCommand();
  const [form, setForm] = useState({ timelineStartDate: project.timelineStartDate, openingDate: project.openingDate ?? "" });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run("save", () => setProjectDatesAction({
      projectId: project.id,
      timelineStartDate: form.timelineStartDate || null,
      openingDate: form.openingDate || null,
    }));
    if (ok) onClose();
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
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending}>Save dates</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
