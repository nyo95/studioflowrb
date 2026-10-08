"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, Button, ButtonMenu, Dialog, Field, FormActions, InlineError, Input, RadioGroup, SectionCard, Text, Textarea } from "@/platform/ui_engine";

import { NotesWorkspace, ITERATION_STATE_LABEL as STATE_LABEL, ITERATION_STATE_TONE as STATE_TONE, type IterationRow } from "./notes-workspace";
import { IterationButtons, UndoBar, usePhaseCommands, VisitDialog, type IterationView, type PhaseView } from "../../_components/phase-commands";


export function PhasePanel({ projectId, phase, current, iterations, note, skippedReason, startBlockedReason, canAct, canSkip, canNote, canOverride, archived, children, aside }: {
  projectId: string;
  phase: PhaseView;
  current: IterationView | null;
  iterations: IterationRow[];
  note: string | null;
  skippedReason: string | null;
  startBlockedReason: string | null;
  canAct: boolean;
  canSkip: boolean;
  canNote: boolean;
  canOverride: boolean;
  archived: boolean;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  const commands = usePhaseCommands(projectId);
  const { locale, timezone } = useDisplaySettings();
  const [visitOpen, setVisitOpen] = useState(false);
  const [renaming, setRenaming] = useState<IterationRow | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reset, setReset] = useState({ mode: "HARD_RESET_ACTIVE" as "HARD_RESET_ACTIVE" | "HARD_RESET_PENDING", iteration: "1", note: "" });
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [noteEditing, setNoteEditing] = useState(false);
  const acting = canAct && !archived;
  const currentRow = current ? iterations.find((item) => item.id === current.id) ?? null : null;
  const earlier = iterations.filter((item) => item.id !== current?.id);
  // A skip closes the open iteration as DONE; it must not read as the client's approval.
  const closedBySkipId = skippedReason ? earlier.reduce<IterationRow | null>((latest, item) => (!latest || new Date(item.createdAt) > new Date(latest.createdAt) ? item : latest), null)?.id ?? null : null;

  useEffect(() => {
    if (!renaming) return;
    const timer = window.setTimeout(() => { const field = document.getElementById("rename-iteration-name") as HTMLInputElement | null; field?.focus(); field?.select(); }, 80);
    return () => window.clearTimeout(timer);
  }, [renaming]);

  const openRename = (iteration: IterationRow) => { setRenaming(iteration); setRenameDraft(iteration.name); };
  const currentMenu = [
    ...(currentRow && acting ? [
      { label: "Rename iteration", onSelect: () => openRename(currentRow) },
      ...(currentRow.state === "NOT_SENT" ? [{ label: "Delete iteration (never sent)", danger: true, separatorBefore: true, onSelect: () => void commands.exec(`delete:${currentRow.id}`, { command: "deleteIteration", phaseId: phase.id, iterationId: currentRow.id }, `${currentRow.name} deleted`) }] : []),
    ] : []),
    ...((phase.status === "PENDING" || phase.status === "ACTIVE") && canSkip && !archived ? [{ label: "Skip this phase…", description: "Marks it done without work. A reason is recorded.", onSelect: () => { setReason(""); setSkipOpen(true); } }] : []),
    ...(canOverride && !archived ? [{ label: "Admin reset iterations…", description: "Rewrites the iteration history. Audited.", onSelect: () => setResetOpen(true) }] : []),
  ];
  const title = current ? current.name : "Current iteration";
  const nextStep = phase.status === "PENDING" ? (startBlockedReason ?? "Start this phase when work begins.")
    : phase.status === "DONE" ? (skippedReason ? `Skipped: ${skippedReason}` : `Done in ${iterations.length} iteration${iterations.length === 1 ? "" : "s"}.`)
      : current?.state === "SENT" ? "The client's notes go here once they reply."
        : current?.state === "ANSWERED" ? "Choose the outcome when the team is ready."
          : "Prepare this iteration, then send it to the client.";

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] items-start gap-4 max-[1100px]:grid-cols-1">
        <div className="grid min-w-0 gap-4">
          <SectionCard
            title={title}
            action={<div className="flex flex-wrap items-center gap-1.5"><IterationButtons phase={phase} current={current} commands={commands} canAct={acting} onNewVisit={() => setVisitOpen(true)} lead />{currentMenu.length > 0 ? <ButtonMenu label="More" variant="ghost" items={currentMenu} /> : null}</div>}
          >
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={phase.status === "DONE" ? "success" : current ? STATE_TONE[current.state] : "neutral"} title={skippedReason ?? undefined}>{phase.status === "PENDING" ? "Not started" : phase.status === "DONE" ? (skippedReason ? "Skipped" : "Done") : current ? STATE_LABEL[current.state] : "In progress"}</Badge>
                <Text tone="secondary" size="sm">{nextStep}</Text>
              </div>
              <UndoBar commands={commands} />
              {commands.error && !visitOpen && !renaming && !skipOpen && !resetOpen ? <InlineError>{commands.error}</InlineError> : null}
            </div>
          </SectionCard>

          <NotesWorkspace projectId={projectId} phaseId={phase.id} commands={commands} iterations={iterations} currentId={current?.id ?? null} closedBySkipId={closedBySkipId} pinned={note} canPin={canNote && !archived} canEdit={acting} locale={locale} timezone={timezone} onRename={openRename} />
          {children}
        </div>

        <aside className="grid min-w-0 gap-4">
          {aside}
        </aside>
      </div>

      <VisitDialog open={visitOpen} onOpenChange={setVisitOpen} pending={commands.isPending("visit")} error={commands.error} onSave={(visitDate, visitNote) => commands.exec("visit", { command: "createVisit", phaseId: phase.id, visitDate, note: visitNote }, "Site visit added")} />
      {renaming ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("rename")) setRenaming(null); }} title="Rename iteration"><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("rename", { command: "renameIteration", phaseId: phase.id, iterationId: renaming.id, name: renameDraft }, renameDraft.trim() ? `Renamed to ${renameDraft.trim()}` : `${renaming.shortName}: name reset`)) setRenaming(null); }}><Field label="Name" description="Leave it empty to use the project name with the phase letter and number."><Input id="rename-iteration-name" value={renameDraft} maxLength={200} onChange={(event) => setRenameDraft(event.target.value)} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setRenaming(null)} disabled={commands.isPending("rename")}>Cancel</Button><Button type="submit" variant="primary" pending={commands.isPending("rename")} disabled={renameDraft.trim() === renaming.name}>Save</Button></FormActions></form></Dialog> : null}
      {skipOpen ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("skip")) setSkipOpen(false); }} title="Skip this phase" description="The phase is marked done without work. A reason is recorded."><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("skip", { command: "bypass", phaseId: phase.id, reason }, `${phase.name} skipped`)) setSkipOpen(false); }}><Field label="Reason" required><Textarea rows={2} value={reason} maxLength={500} placeholder="e.g. Moodboard supplied by the client" onChange={(event) => setReason(event.target.value)} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setSkipOpen(false)} disabled={commands.isPending("skip")}>Cancel</Button><Button type="submit" variant="primary" pending={commands.isPending("skip")} disabled={!reason.trim()}>Skip phase</Button></FormActions></form></Dialog> : null}
      {resetOpen ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("reset")) setResetOpen(false); }} title="Reset iterations (admin)" description="Deletes every iteration and its client notes for this phase. A full snapshot is kept in History."><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("reset", { command: "override", phaseId: phase.id, mode: reset.mode, major: Number(reset.iteration), note: reset.note }, "Iterations reset")) setResetOpen(false); }}><RadioGroup label="Result" value={reset.mode} onValueChange={(value) => setReset({ ...reset, mode: value as typeof reset.mode })} options={[{ value: "HARD_RESET_ACTIVE", label: "Restart at an iteration number", description: "The phase goes back to active" }, { value: "HARD_RESET_PENDING", label: "Back to not started" }]} />{reset.mode === "HARD_RESET_ACTIVE" ? <Field label="Iteration number" required description="Whole number, e.g. 2"><Input value={reset.iteration} inputMode="numeric" pattern="\d+" onChange={(event) => setReset({ ...reset, iteration: event.target.value })} /></Field> : null}<Field label="Note" required><Textarea rows={2} value={reset.note} maxLength={1000} onChange={(event) => setReset({ ...reset, note: event.target.value })} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setResetOpen(false)} disabled={commands.isPending("reset")}>Cancel</Button><Button type="submit" variant="danger" pending={commands.isPending("reset")} disabled={!reset.note.trim()}>Reset iterations</Button></FormActions></form></Dialog> : null}
    </>
  );
}
