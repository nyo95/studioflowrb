"use client";

import { Button, DraftDialog, Field, FormActions, InlineError, Input } from "@/platform/ui_engine";

/** Presentation for the existing Master Data request step; callers retain policy and commands. */
export function RequestDeletionDialog({ open, onOpenChange, title, description, reason, onReasonChange, placeholder, pending, error, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  reason: string;
  onReasonChange: (value: string) => void;
  placeholder?: string;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return <DraftDialog open={open} onOpenChange={onOpenChange} title={title} description={description} pending={pending} watchedValue={reason}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); if (!pending) onSubmit(); }}>
      {error ? <InlineError>{error}</InlineError> : null}
      <Field label="Reason for deletion">
        <Input value={reason} onChange={event => onReasonChange(event.target.value)} placeholder={placeholder} />
      </Field>
      <FormActions>
        <Button data-dialog-cancel variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" variant="danger" pending={pending}>Submit deletion request</Button>
      </FormActions>
    </form>
  </DraftDialog>;
}
