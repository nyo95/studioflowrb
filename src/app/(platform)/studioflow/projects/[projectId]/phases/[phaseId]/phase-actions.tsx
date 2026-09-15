"use client";

import { useState } from "react";

import { PHASE_COMMAND_LABELS, type PhaseCommand } from "@/apps/studioflow/domain/phase";
import { Button, ButtonMenu, ConfirmDialog, Dialog, Field, FormActions, InlineError, Input, RadioGroup, Textarea, Tooltip } from "@/platform/ui_engine";

import { phaseCommandAction } from "../../../../actions";
import { useCommand } from "../../../../_components/use-command";

type Blockers = { total: number; reasons: string[] };

const PRIMARY_ORDER: PhaseCommand[] = ["activate", "approveClient", "approveInternal", "submitInternal", "submitClient", "completeSupervision", "reopen"];
const REVIEW: ReadonlySet<PhaseCommand> = new Set(["bypass", "approveInternal", "rejectInternal", "submitClient", "approveClient", "rejectClient", "reopen", "completeSupervision"]);
const NEEDS_FULL: ReadonlySet<PhaseCommand> = new Set(["approveInternal", "submitClient", "approveClient"]);

/**
 * Named actions instead of a state picker (contract §13.3). One primary
 * button; the rest sit in a menu. Disabled buttons explain why.
 */
export function PhaseActions({
  projectId,
  phaseId,
  commands,
  blockers,
  todoBlockers,
  canWork,
  canReview,
  canOverride,
  activeRevision,
  openFeedback,
}: {
  projectId: string;
  phaseId: string;
  commands: PhaseCommand[];
  blockers: Blockers;
  todoBlockers: Blockers;
  canWork: boolean;
  canReview: boolean;
  canOverride: boolean;
  activeRevision: string | null;
  openFeedback: string[];
}) {
  const { run, pending, error } = useCommand();
  const [confirm, setConfirm] = useState<PhaseCommand | null>(null);
  const [reasonFor, setReasonFor] = useState<"bypass" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const [intent, setIntent] = useState<"INTERNAL" | "CLIENT">("CLIENT");
  const [override, setOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ mode: "HARD_RESET_ACTIVE" as "HARD_RESET_ACTIVE" | "HARD_RESET_PENDING", version: "1.0", note: "" });

  const allowed = (command: PhaseCommand) => (REVIEW.has(command) ? canReview : canWork);
  const disabledReason = (command: PhaseCommand): string | null => {
    if (!allowed(command)) return "Your role cannot do this.";
    if (NEEDS_FULL.has(command) && blockers.total > 0) return `Finish ${blockers.reasons.join(", ")} first.`;
    if (command === "submitInternal" && todoBlockers.total > 0) return `Finish ${todoBlockers.reasons.join(", ")} first.`;
    return null;
  };

  const exec = (command: PhaseCommand, extra: Record<string, unknown> = {}) =>
    run(command, () => phaseCommandAction({ command, projectId, phaseId, ...extra } as Parameters<typeof phaseCommandAction>[0]));

  const start = (command: PhaseCommand) => {
    if (command === "bypass" || command === "reopen") { setReason(""); setReasonFor(command); return; }
    if (command === "rejectInternal" || command === "rejectClient" || command === "approveClient" || command === "completeSupervision") { setConfirm(command); return; }
    void exec(command);
  };

  const primary = PRIMARY_ORDER.find((c) => commands.includes(c));
  const secondary = commands.filter((c) => c !== primary);
  const primaryReason = primary ? disabledReason(primary) : null;

  const confirmCopy: Partial<Record<PhaseCommand, { title: string; description: string; label: string; tone?: "danger" }>> = {
    rejectInternal: { title: "Send back for changes", description: `${activeRevision ?? "The revision"} closes and a new minor revision opens. ${openFeedback.length} open feedback point(s) become to-dos${openFeedback.length ? `: ${openFeedback.slice(0, 5).join("; ")}${openFeedback.length > 5 ? "…" : ""}` : "."}`, label: "Send back" },
    rejectClient: { title: "Client asked for changes", description: `${activeRevision ?? "The revision"} closes and a new major revision opens. ${openFeedback.length} open feedback point(s) become to-dos${openFeedback.length ? `: ${openFeedback.slice(0, 5).join("; ")}${openFeedback.length > 5 ? "…" : ""}` : ". Record the client's points as feedback first."}`, label: "Open next revision" },
    approveClient: { title: "Client approved", description: "The phase is approved and locked. If it is the last phase, the project is marked completed.", label: "Approve phase" },
    completeSupervision: { title: "Finish supervision", description: "Supervision closes and the project is marked completed.", label: "Finish" },
  };

  return (
    <div className="grid justify-items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {primary ? (
          primaryReason ? (
            <Tooltip content={primaryReason}>
              <span tabIndex={0}><Button variant="primary" disabled>{PHASE_COMMAND_LABELS[primary]}</Button></span>
            </Tooltip>
          ) : (
            <Button variant="primary" pending={pending} onClick={() => start(primary)}>{PHASE_COMMAND_LABELS[primary]}</Button>
          )
        ) : null}
        {secondary.length > 0 || canOverride ? (
          <ButtonMenu
            label="More actions"
            variant="secondary"
            items={[
              ...secondary.map((command) => ({
                label: PHASE_COMMAND_LABELS[command],
                description: disabledReason(command) ?? undefined,
                disabled: disabledReason(command) !== null,
                onSelect: () => start(command),
              })),
              ...(canOverride ? [{ label: "Admin: reset revisions…", description: "Rewrites revision history. Audited.", onSelect: () => setOverride(true) }] : []),
            ]}
          />
        ) : null}
      </div>
      {error && !confirm && !reasonFor && !override ? <InlineError>{error}</InlineError> : null}

      {confirm && confirmCopy[confirm] ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setConfirm(null); }}
          title={confirmCopy[confirm]!.title}
          description={confirmCopy[confirm]!.description}
          confirmLabel={confirmCopy[confirm]!.label}
          pending={pending}
          error={error}
          onConfirm={async () => { if (await exec(confirm)) setConfirm(null); }}
        />
      ) : null}

      {reasonFor ? (
        <Dialog open onOpenChange={(open) => { if (!open && !pending) setReasonFor(null); }} title={reasonFor === "bypass" ? "Skip this phase" : "Reopen phase"} description={reasonFor === "bypass" ? "The phase is marked approved without work. A reason is recorded." : "Work resumes in a new revision. A reason is recorded."}>
          <form className="grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const ok = await exec(reasonFor, reasonFor === "reopen" ? { reason, intent } : { reason });
            if (ok) setReasonFor(null);
          }}>
            {reasonFor === "reopen" ? (
              <RadioGroup
                label="Why is it reopening?"
                value={intent}
                onValueChange={(v) => setIntent(v as "INTERNAL" | "CLIENT")}
                options={[
                  { value: "CLIENT", label: "Client asked for changes", description: "Opens the next major revision (v2.0, v3.0…)" },
                  { value: "INTERNAL", label: "Internal correction", description: "Opens the next minor revision (v1.1, v1.2…)" },
                ]}
              />
            ) : null}
            <Field label="Reason" required><Textarea rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
            {error ? <InlineError>{error}</InlineError> : null}
            <FormActions>
              <Button type="button" onClick={() => setReasonFor(null)} disabled={pending}>Cancel</Button>
              <Button type="submit" variant="primary" pending={pending} disabled={!reason.trim()}>{reasonFor === "bypass" ? "Skip phase" : "Reopen"}</Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}

      {override ? (
        <Dialog open onOpenChange={(open) => { if (!open && !pending) setOverride(false); }} title="Reset revisions (admin)" description="Deletes every revision and its items for this phase. A full snapshot is kept in History.">
          <form className="grid gap-3" onSubmit={async (e) => {
            e.preventDefault();
            const [major, minor] = overrideForm.version.split(".").map((part) => Number(part));
            const ok = await exec("override" as PhaseCommand, { mode: overrideForm.mode, major, minor, note: overrideForm.note });
            if (ok) setOverride(false);
          }}>
            <RadioGroup
              label="Result"
              value={overrideForm.mode}
              onValueChange={(v) => setOverrideForm({ ...overrideForm, mode: v as typeof overrideForm.mode })}
              options={[
                { value: "HARD_RESET_ACTIVE", label: "Restart at a revision", description: "Phase goes back to Working" },
                { value: "HARD_RESET_PENDING", label: "Back to not started" },
              ]}
            />
            {overrideForm.mode === "HARD_RESET_ACTIVE" ? (
              <Field label="Revision" required description="Major.minor, e.g. 2.0">
                <Input value={overrideForm.version} pattern="\d+\.\d+" onChange={(e) => setOverrideForm({ ...overrideForm, version: e.target.value })} />
              </Field>
            ) : null}
            <Field label="Note" required><Textarea rows={2} value={overrideForm.note} maxLength={1000} onChange={(e) => setOverrideForm({ ...overrideForm, note: e.target.value })} /></Field>
            {error ? <InlineError>{error}</InlineError> : null}
            <FormActions>
              <Button type="button" onClick={() => setOverride(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" variant="danger" pending={pending} disabled={!overrideForm.note.trim()}>Reset revisions</Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
