"use client";

import { useEffect, useState } from "react";

import { Button, Dialog, Field, InlineError, Notice, Text, Textarea } from "@/platform/ui_engine";

import { projectCompletionAction, projectCompletionReadinessAction } from "../actions";
import { useCommand } from "./use-command";

type Readiness = {
  unfinishedPhases: Array<{ id: string; name: string }>;
  openReminders: number;
  ready: boolean;
  canChange: boolean;
  canOverride: boolean;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * The one confirmation for completing a project (owner, 2026-10-04/05). It reads what the server would check
 * before asking: unfinished phases block completion; open requirements are only reminders and are listed,
 * not enforced. A project manager may complete a blocked project with a written
 * reason, which the server records in the history. A completed project is read-only until it is reopened.
 */
export function ProjectCompletionDialog({ projectId, projectName, open, onOpenChange }: { projectId: string; projectName: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const command = useCommand();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void projectCompletionReadinessAction(projectId).then((result) => {
      if (cancelled) return;
      if (result.ok) { setReadiness(result.data); setLoadError(null); }
      else setLoadError(result.error.safeMessage);
    }).catch(() => { if (!cancelled) setLoadError("Could not check this project. Try again."); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  const close = (next: boolean) => {
    if (command.pending) return;
    if (!next) { setReadiness(null); setLoadError(null); setReason(""); command.clearError(); }
    onOpenChange(next);
  };

  const blocked = readiness !== null && !readiness.ready;
  const canSubmit = readiness !== null && readiness.canChange && (!blocked || (readiness.canOverride && reason.trim().length > 0));
  const submit = async () => {
    if (!canSubmit) return;
    const ok = await command.run("complete", () => projectCompletionAction(projectId, "complete", blocked ? reason.trim() : undefined));
    if (ok) close(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Complete ${projectName}?`}
      description="A completed project becomes read-only. Reopen it any time to make changes again."
      dismissible={!command.pending}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => close(false)} disabled={command.pending}>Cancel</Button>
          <Button variant="primary" pending={command.isPending("complete")} disabled={!canSubmit} onClick={() => void submit()}>
            {blocked ? "Complete anyway" : "Mark as completed"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        {readiness === null && !loadError ? <Text tone="secondary" size="sm">Checking the project…</Text> : null}
        {loadError ? <InlineError>{loadError}</InlineError> : null}
        {readiness ? (
          <>
            {readiness.ready ? (
              <Notice tone="success" title="Ready">Every phase is done.</Notice>
            ) : (
              <Notice tone="warning" title="Not finished yet">
                <span className="grid gap-1">
                  {readiness.unfinishedPhases.length > 0 ? <span>Phases not done: {readiness.unfinishedPhases.map((phase) => phase.name).join(", ")}.</span> : null}
                </span>
              </Notice>
            )}
            {readiness.openReminders > 0 ? (
              <Text tone="secondary" size="sm">
                {plural(readiness.openReminders, "requirement or to-do", "requirements or to-dos")} not ticked. They are reminders, so they do not stop completion and stay on the project as they are.
              </Text>
            ) : null}
            {!readiness.canChange ? <Text tone="secondary" size="sm">Only the project&apos;s designer or drafter can complete it.</Text> : null}
            {blocked && readiness.canChange && readiness.canOverride ? (
              <Field label="Reason to complete anyway" required description="Kept in the project history.">
                <Textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Client accepted the handover without the last revision" />
              </Field>
            ) : null}
            {blocked && readiness.canChange && !readiness.canOverride ? <Text tone="secondary" size="sm">Finish the phases above first, or ask a project manager to complete it with a reason.</Text> : null}
          </>
        ) : null}
        {command.error ? <InlineError>{command.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}
