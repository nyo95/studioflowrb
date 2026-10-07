"use client";

import { useEffect, useState } from "react";

import { currentDateOnly } from "@platform/utilities/date";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Button, Dialog, Field, FormActions, InlineError, Input, Textarea } from "@/platform/ui_engine";

import { phaseCommandAction, undoPhaseEventAction, type PhaseCommandInput, type PhaseCommandOutcome } from "../actions";
import { useCommand } from "./use-command";

/** The commands a person can give a phase from a card or from the phase page (everything except `projectId`). */
export type PhaseCommandBody = DistributiveOmit<PhaseCommandInput, "projectId">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

type Undo = { eventId: string; summary: string; expiresAt: number };

/**
 * Runs phase commands for one project and keeps the one undo the server still allows
 * (same person, latest change, five minutes). Cards and the phase page both use it.
 */
export function usePhaseCommands(projectId: string) {
  const command = useCommand();
  const [undo, setUndo] = useState<Undo | null>(null);

  const exec = (key: string, body: PhaseCommandBody, summary: string) =>
    command.run(
      key,
      () => phaseCommandAction({ ...body, projectId } as PhaseCommandInput),
      (data) => {
        const outcome = data as PhaseCommandOutcome;
        setUndo(outcome.undo ? { eventId: outcome.undo.eventId, summary, expiresAt: Date.parse(outcome.undo.expiresAt) } : null);
      },
    );

  const undoNow = () => {
    if (!undo) return Promise.resolve(false);
    return command.run("undo", () => undoPhaseEventAction({ projectId, eventId: undo.eventId }), () => setUndo(null));
  };

  return { exec, undo, undoNow, dismissUndo: () => setUndo(null), pending: command.pending, isPending: command.isPending, error: command.error, clearError: command.clearError };
}

export type PhaseCommands = ReturnType<typeof usePhaseCommands>;

/** "Saved · Undo (4:12)" for the few minutes the change can still be taken back. It disappears by itself. */
export function UndoBar({ commands }: { commands: PhaseCommands }) {
  const { undo } = commands;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!undo) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [undo]);
  useEffect(() => {
    if (undo && Date.now() >= undo.expiresAt) commands.dismissUndo();
  }, [now, undo, commands]);
  if (!undo || now >= undo.expiresAt) return null;
  const left = Math.max(0, Math.ceil((undo.expiresAt - now) / 1000));
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-muted px-3 py-1.5 text-sm text-ink-secondary">
      <span>{undo.summary}</span>
      <span className="flex items-center gap-1">
        <Button size="sm" variant="ghost" pending={commands.isPending("undo")} onClick={() => void commands.undoNow()}>
          Undo ({Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")})
        </Button>
        <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={commands.dismissUndo}>×</Button>
      </span>
    </div>
  );
}

export type IterationView = {
  id: string;
  name: string;
  state: "NOT_SENT" | "SENT" | "ANSWERED" | "REVISED" | "DONE";
  waitingDays: number | null;
  choices: readonly string[];
  /** The outcomes offered once the client has answered (Revision / Done, or Continue to CD Final on CD Mall). */
  answerChoices?: readonly string[];
  /** What the client said about this iteration. */
  note?: string | null;
};

export type PhaseView = { id: string; name: string; status: "PENDING" | "ACTIVE" | "DONE"; isSupervision: boolean; canStart: boolean };

/**
 * The buttons that move a phase forward from where it is now. Which ones exist is decided by the server's `choices`.
 * On Home several phases sit side by side, so only a decision after the client answered is a primary button. With
 * `lead` (the phase page's iteration card, the one place to act) the forward step is primary too.
 */
export function IterationButtons({
  phase,
  current,
  commands,
  canAct,
  onNewVisit,
  lead = false,
}: {
  phase: PhaseView;
  current: IterationView | null;
  commands: PhaseCommands;
  canAct: boolean;
  onNewVisit: () => void;
  lead?: boolean;
}) {
  const startVariant = lead ? "primary" : "secondary";
  const [answering, setAnswering] = useState(false);
  const base = { phaseId: phase.id };
  const run = (key: string, body: PhaseCommandBody, summary: string) => void commands.exec(`${phase.id}:${key}`, body, summary);
  const busy = (key: string) => commands.isPending(`${phase.id}:${key}`);

  if (!current) {
    if (phase.status === "PENDING") {
      if (!phase.canStart) return null;
      return canAct ? <Button size="sm" variant={startVariant} pending={busy("start")} onClick={() => phase.isSupervision ? onNewVisit() : run("start", { ...base, command: "addIteration" }, `${phase.name} started`)}>Start</Button> : null;
    }
    if (!canAct) return null;
    if (phase.isSupervision && phase.status === "ACTIVE") return <Button size="sm" variant={startVariant} onClick={onNewVisit}>New visit</Button>;
    if (!lead) return null;
    return <Button size="sm" variant="secondary" pending={busy("add")} onClick={() => phase.isSupervision ? onNewVisit() : run("add", { ...base, command: "addIteration" }, `New ${phase.name} iteration added`)}>+ New iteration</Button>;
  }

  if (!canAct) return null;
  const it = { ...base, iterationId: current.id };
  const known: Record<string, { label: string; primary?: boolean; run: () => void }> = {
    send: { label: "Send to client", primary: lead, run: () => run("send", { ...it, command: "sendIteration" }, `${current.name} sent to the client`) },
    record_answer: { label: "Client answered", primary: lead, run: () => setAnswering(true) },
    revision: { label: "Revision", run: () => run("revision", { ...it, command: "chooseOutcome", outcome: "REVISION" }, `${current.name} needs a revision`) },
    done: phase.isSupervision
      ? { label: "Done (handover)", primary: true, run: () => run("done", { ...it, command: "chooseVisit", outcome: "DONE" }, `${phase.name} done`) }
      : { label: "Done", primary: true, run: () => run("done", { ...it, command: "chooseOutcome", outcome: "DONE" }, `${current.name} done`) },
    continue_cd_final: { label: "Continue to CD Final", primary: true, run: () => run("continue", { ...it, command: "chooseOutcome", outcome: "CONTINUE_CD_FINAL" }, `${current.name} done, CD Final opened`) },
    // Closing a visit as "Next visit" goes straight on to planning the following one.
    next_visit: { label: "Next visit", run: () => void commands.exec(`${phase.id}:next`, { ...it, command: "chooseVisit", outcome: "NEXT_VISIT" }, `${current.name} closed`).then((ok) => { if (ok) onNewVisit(); }) },
  };
  return (
    <>
      {current.choices.map((choice) => {
        const item = known[choice];
        if (!item) return null;
        return <Button key={choice} size="sm" variant={item.primary ? "primary" : "secondary"} pending={busy(choice === "record_answer" ? "answer" : choice === "continue_cd_final" ? "continue" : choice === "next_visit" ? "next" : choice)} onClick={item.run}>{item.label}</Button>;
      })}
      {answering ? <ClientAnswerDialog phase={phase} iteration={current} commands={commands} onClose={() => setAnswering(false)} /> : null}
    </>
  );
}

const OUTCOME: Record<string, { label: string; outcome: "REVISION" | "DONE" | "CONTINUE_CD_FINAL"; primary?: boolean; summary: (name: string) => string }> = {
  revision: { label: "Revision", outcome: "REVISION", summary: (name) => `${name} needs a revision` },
  done: { label: "OK – done", outcome: "DONE", primary: true, summary: (name) => `${name} done` },
  continue_cd_final: { label: "Continue to CD Final", outcome: "CONTINUE_CD_FINAL", primary: true, summary: (name) => `${name} done, CD Final opened` },
};

/**
 * "Client answered" (owner, 2026-10-05): what the client said is the iteration's notes, written here in one box,
 * then the outcome — OK, or a Revision whose next iteration shows these notes as its brief. "Decide later" keeps the
 * answer and the notes and leaves the choice on the card.
 */
export function ClientAnswerDialog({ phase, iteration, commands, onClose }: { phase: PhaseView; iteration: IterationView; commands: PhaseCommands; onClose: () => void }) {
  const [note, setNote] = useState(iteration.note ?? "");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const choices = (iteration.answerChoices ?? ["revision", "done"]).filter((choice) => OUTCOME[choice]);
  const it = { phaseId: phase.id, iterationId: iteration.id };
  const answer = async (choice: string | null) => {
    setBusyKey(choice ?? "later");
    try {
      const answered = await commands.exec(`${phase.id}:answer`, { ...it, command: "recordClientAnswer", note: note.trim() ? note.trim() : null }, `${iteration.name}: client answered`);
      if (!answered) return;
      if (choice) {
        const picked = OUTCOME[choice]!;
        if (!(await commands.exec(`${phase.id}:${choice}`, { ...it, command: "chooseOutcome", outcome: picked.outcome }, picked.summary(iteration.name)))) return;
      }
      onClose();
    } finally {
      setBusyKey(null);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busyKey) onClose(); }}
      title={`${iteration.name}: the client answered`}
      description="Write what the client said. If you choose Revision, the next iteration shows these notes as its brief."
      dismissible={!busyKey}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={Boolean(busyKey)} onClick={() => void answer(null)} pending={busyKey === "later"}>Save, decide later</Button>
          {choices.map((choice) => (
            <Button key={choice} variant={OUTCOME[choice]!.primary ? "primary" : "secondary"} disabled={Boolean(busyKey)} pending={busyKey === choice} onClick={() => void answer(choice)}>{OUTCOME[choice]!.label}</Button>
          ))}
        </div>
      }
    >
      <div className="grid gap-3">
        <Field label="Client notes" description="One point per line is easiest to read later.">
          <Textarea rows={6} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={"e.g.\n- Warmer palette for the lounge\n- Keep the marble at reception"} autoFocus />
        </Field>
        {commands.error ? <InlineError>{commands.error}</InlineError> : null}
      </div>
    </Dialog>
  );
}

/** Date and optional note for a supervision site visit. */
export function VisitDialog({ open, onOpenChange, onSave, pending, error }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (visitDate: string, note: string | null) => Promise<boolean>; pending: boolean; error: string | null }) {
  const { timezone } = useDisplaySettings();
  const [date, setDate] = useState(() => currentDateOnly({ timeZone: timezone }));
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }} title="New site visit" description="Record the day of the visit. Close it with “Next visit” or “Done (handover)” when it has happened.">
      <form className="grid gap-3" onSubmit={async (event) => {
        event.preventDefault();
        if (await onSave(date, note.trim() || null)) { setNote(""); onOpenChange(false); }
      }}>
        <Field label="Visit date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note"><Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!date}>Save visit</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
