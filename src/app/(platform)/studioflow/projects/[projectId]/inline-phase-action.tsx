"use client";

import { useState } from "react";

import { PHASE_COMMAND_LABELS, type PhaseCommand } from "@/apps/studioflow/domain/phase";
import { Button, ButtonMenu, ConfirmDialog, Dialog, Field, FormActions, InlineError, Textarea } from "@/platform/ui_engine";

import { phaseCommandAction } from "../../actions";
import { useCommand } from "../../_components/use-command";

type Blockers = { total: number; reasons: string[] };

/** Subset of PhaseActions shown inline in the Overview phase card (V2-D9). */
export function InlinePhaseAction({
  projectId,
  phaseId,
  command,
  commands,
  blockers,
  todoBlockers,
  canWork,
  canReview,
  canOverride,
  activeRevision,
}: {
  projectId: string;
  phaseId: string;
  command: PhaseCommand;
  commands: PhaseCommand[];
  blockers: Blockers;
  todoBlockers: Blockers;
  canWork: boolean;
  canReview: boolean;
  canOverride: boolean;
  activeRevision: string | null;
}) {
  const { run, pending, error } = useCommand();
  const [confirm, setConfirm] = useState<PhaseCommand | null>(null);
  const [reasonFor, setReasonFor] = useState<"bypass" | "reopen" | null>(null);
  const [reason, setReason] = useState("");

  const REVIEW_PERMS: Set<PhaseCommand> = new Set([
    "bypass", "submitClient",
    "approveClient", "rejectClient", "reopen", "completeSupervision",
  ]);

  function canUse(cmd: PhaseCommand): boolean {
    if (REVIEW_PERMS.has(cmd)) return canReview;
    return canWork;
  }

  function isDisabled(cmd: PhaseCommand): boolean {
    if (!canUse(cmd)) return true;
    // Requirements are reminders only (WO-SF-ITER-01): they never block a step.
    return false;
  }

  function execute(cmd: PhaseCommand, extra?: Record<string, unknown>) {
    run(cmd, () =>
      phaseCommandAction({ command: cmd, projectId, phaseId, ...extra } as Parameters<typeof phaseCommandAction>[0])
    );
  }

  function handleClick(cmd: PhaseCommand) {
    if (cmd === "bypass" || cmd === "reopen") {
      setReasonFor(cmd as "bypass" | "reopen");
      setReason("");
      return;
    }
    if (cmd === "rejectClient" || cmd === "approveClient" || cmd === "completeSupervision") {
      setConfirm(cmd);
      return;
    }
    execute(cmd);
  }

  // Only show primary button + overflow menu for secondary commands
  const secondaryCommands = commands.slice(1);

  return (
    <>
      <div className="flex items-center gap-1.5 flex-none">
        <Button
          size="sm"
          variant={command === "activate" || command === "approveClient" ? "primary" : "secondary"}
          disabled={isDisabled(command) || pending}
          onClick={() => handleClick(command)}
          title={blockers.total > 0 ? `Still open: ${blockers.reasons.join(", ")}` : undefined}
        >
          {PHASE_COMMAND_LABELS[command]}
        </Button>

        {secondaryCommands.length > 0 ? (
          <ButtonMenu
            variant="ghost"
            label="More"
            items={secondaryCommands.map((cmd) => ({
              label: PHASE_COMMAND_LABELS[cmd],
              disabled: isDisabled(cmd) || pending,
              onSelect: () => handleClick(cmd),
            }))}
          />
        ) : null}
      </div>

      {error ? <InlineError className="mt-1">{error}</InlineError> : null}

      {/* Bypass / Reopen reason dialog */}
      <Dialog
        open={reasonFor !== null}
        onOpenChange={(open) => { if (!open) setReasonFor(null); }}
        title={reasonFor === "bypass" ? "Skip phase" : "Reopen phase"}
      >
        <Field label="Reason" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why…" rows={3} />
        </Field>
        <FormActions>
          <Button
            variant="primary"
            disabled={!reason.trim() || pending}
            onClick={() => {
              if (!reasonFor) return;
              if (reasonFor === "bypass") execute("bypass", { reason });
              else execute("reopen", { reason });
              setReasonFor(null);
            }}
          >
            Confirm
          </Button>
          <Button variant="ghost" onClick={() => setReasonFor(null)}>Cancel</Button>
        </FormActions>
      </Dialog>

      {/* Reject confirm */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title="Client requested changes"
        description="This opens the next iteration. Open feedback will become to-dos in it."
        confirmLabel="Send back"
        onConfirm={() => {
          if (confirm) execute(confirm);
          setConfirm(null);
        }}
      />
    </>
  );
}
