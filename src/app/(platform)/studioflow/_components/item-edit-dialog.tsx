"use client";

import { useState } from "react";

import { Button, DraftDialog, Field, FormActions, InlineError, Input, Select, Textarea } from "@/platform/ui_engine";

import { PersonSelect, type Person } from "./people";

export type ItemEditValues = { label: string; priority?: number; dueDate: string | null; assigneeId: string | null };

/** One editor for activities and checklist items (priority only for checklist). Render with a `key` per item. */
export function ItemEditDialog({
  open,
  onOpenChange,
  title,
  initial,
  people,
  showPriority,
  pending,
  error,
  onSave,
  maxLength = 2000,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: ItemEditValues;
  people: readonly Person[];
  showPriority: boolean;
  pending: boolean;
  error: string | null;
  onSave: (values: ItemEditValues) => void;
  /** Checklist labels are capped at 200 characters; activity text at 2000. */
  maxLength?: number;
}) {
  const [values, setValues] = useState(initial);
  return (
    <DraftDialog open={open} onOpenChange={onOpenChange} title={title} pending={pending} watchedValue={JSON.stringify(values)}>
      <form
        className="grid gap-3.5"
        onSubmit={(event) => { event.preventDefault(); onSave(values); }}
      >
        <Field label="Text" required>
          <Textarea rows={2} value={values.label} maxLength={maxLength} onChange={(e) => setValues({ ...values, label: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <Field label="Due date">
            <Input type="date" value={values.dueDate ?? ""} onChange={(e) => setValues({ ...values, dueDate: e.target.value || null })} />
          </Field>
          {showPriority ? (
            <Field label="Priority">
              <Select value={String(values.priority ?? 4)} onChange={(e) => setValues({ ...values, priority: Number(e.target.value) })}>
                <option value="1">P1 — highest</option>
                <option value="2">P2</option>
                <option value="3">P3</option>
                <option value="4">No priority</option>
              </Select>
            </Field>
          ) : null}
          <Field label="Assignee">
            <PersonSelect people={people} value={values.assigneeId} onChange={(assigneeId) => setValues({ ...values, assigneeId })} />
          </Field>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" data-dialog-cancel>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending}>Save</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
