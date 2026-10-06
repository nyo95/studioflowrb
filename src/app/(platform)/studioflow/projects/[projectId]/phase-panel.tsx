"use client";

import { useEffect, useState, type ReactNode } from "react";

import { roundDisplayName } from "@/apps/studioflow/domain/phase-display";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, Button, ButtonMenu, Dialog, Field, FormActions, FormattedInstant, InlineError, Input, Notice, RadioGroup, RowActionMenu, SectionCard, Text, Textarea } from "@/platform/ui_engine";

import { IterationButtons, UndoBar, usePhaseCommands, VisitDialog, type IterationView, type PhaseView } from "../../_components/phase-commands";

type IterationRow = { id: string; name: string; state: IterationView["state"]; createdAt: Date; sentAt: Date | null; answeredAt: Date | null; doneAt: Date | null; visitDate: string | null; note: string | null };
const STATE_LABEL: Record<IterationView["state"], string> = { NOT_SENT: "In progress", SENT: "With client", ANSWERED: "Client answered", REVISED: "Revision asked", DONE: "Approved" };
const STATE_TONE: Record<IterationView["state"], "neutral" | "warning" | "success"> = { NOT_SENT: "neutral", SENT: "warning", ANSWERED: "success", REVISED: "neutral", DONE: "success" };

export function PhasePanel({ projectId, phase, current, previous, iterations, note, skippedReason, startBlockedReason, canAct, canSkip, canNote, canOverride, archived, children, aside }: {
  projectId: string;
  phase: PhaseView;
  current: IterationView | null;
  previous: { name: string; note: string | null } | null;
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
  const [notesFor, setNotesFor] = useState<IterationRow | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
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

  useEffect(() => {
    if (!renaming) return;
    const timer = window.setTimeout(() => { const field = document.getElementById("rename-iteration-name") as HTMLInputElement | null; field?.focus(); field?.select(); }, 80);
    return () => window.clearTimeout(timer);
  }, [renaming]);

  const openRename = (iteration: IterationRow) => { setRenaming(iteration); setRenameDraft(iteration.name); };
  const openNotes = (iteration: IterationRow) => { setNotesFor(iteration); setNotesDraft(iteration.note ?? ""); };
  const currentMenu = [
    ...(currentRow && acting ? [
      { label: "Rename round", onSelect: () => openRename(currentRow) },
      ...(currentRow.state !== "SENT" ? [{ label: currentRow.note ? "Edit client notes" : "Add client notes", onSelect: () => openNotes(currentRow) }] : []),
      ...(currentRow.state === "NOT_SENT" ? [{ label: "Delete round (never sent)", danger: true, separatorBefore: true, onSelect: () => void commands.exec(`delete:${currentRow.id}`, { command: "deleteIteration", phaseId: phase.id, iterationId: currentRow.id }, `${currentRow.name} deleted`) }] : []),
    ] : []),
    ...((phase.status === "PENDING" || phase.status === "ACTIVE") && canSkip && !archived ? [{ label: "Skip this phase…", description: "Marks it done without work. A reason is recorded.", onSelect: () => { setReason(""); setSkipOpen(true); } }] : []),
    ...(canOverride && !archived ? [{ label: "Admin reset rounds…", description: "Rewrites the round history. Audited.", onSelect: () => setResetOpen(true) }] : []),
  ];
  const title = current ? roundDisplayName(phase.name, current.name) : "Current round";
  const nextStep = phase.status === "PENDING" ? (startBlockedReason ?? "Start this phase when work begins.")
    : phase.status === "DONE" ? (skippedReason ? `Skipped: ${skippedReason}` : `Done in ${iterations.length} round${iterations.length === 1 ? "" : "s"}.`)
      : current?.state === "SENT" ? "The client's notes go here once they reply."
        : current?.state === "ANSWERED" ? "Choose the outcome when the team is ready."
          : "Prepare this round, then send it to the client.";

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
              {current?.state === "NOT_SENT" && previous?.note ? <Notice tone="neutral" title={`Brief from ${roundDisplayName(phase.name, previous.name)}`}><span className="whitespace-pre-line">{previous.note}</span></Notice> : null}
              {current?.state === "ANSWERED" ? <Text as="p" tone={current.note ? "secondary" : "tertiary"} size="sm" className="whitespace-pre-line">{current.note ?? "No client notes recorded."}</Text> : null}
              <UndoBar commands={commands} />
              {commands.error && !visitOpen && !renaming && !notesFor && !skipOpen && !resetOpen ? <InlineError>{commands.error}</InlineError> : null}
            </div>
          </SectionCard>

          {earlier.length > 0 ? <SectionCard title="Earlier rounds" count={earlier.length} padded={false}>
            <ul className="m-0 grid list-none divide-y divide-line-subtle p-0">
              {earlier.map((iteration) => {
                const actions = acting ? [{ label: iteration.note ? "Edit client notes" : "Add client notes", onSelect: () => openNotes(iteration) }, { label: "Rename round", onSelect: () => openRename(iteration) }] : [];
                const outcome = iteration.visitDate ? `Visit ${iteration.visitDate}` : iteration.state === "DONE" ? "Approved" : iteration.state === "REVISED" ? "Revision asked" : "Closed";
                return <li key={iteration.id} className="grid gap-2 px-(--ui-section-px) py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid gap-1">
                      <div className="flex flex-wrap items-center gap-2"><Text weight="semibold">{roundDisplayName(phase.name, iteration.name)}</Text><Badge tone={STATE_TONE[iteration.state]}>{outcome}</Badge></div>
                      <Text size="sm" tone="tertiary">{iteration.sentAt ? <>sent <FormattedInstant value={iteration.sentAt} locale={locale} timeZone={timezone} /></> : <>created <FormattedInstant value={iteration.createdAt} locale={locale} timeZone={timezone} /></>}{iteration.answeredAt ? <> · answered <FormattedInstant value={iteration.answeredAt} locale={locale} timeZone={timezone} /></> : null}</Text>
                    </div>
                    {actions.length > 0 ? <RowActionMenu items={actions} label={`${iteration.name} actions`} /> : null}
                  </div>
                  <Text as="p" size="sm" tone={iteration.note ? "secondary" : "tertiary"} className="whitespace-pre-line">{iteration.note ?? "No client notes recorded."}</Text>
                </li>;
              })}
            </ul>
          </SectionCard> : null}
          {children}
        </div>

        <aside className="grid min-w-0 gap-4">
          <SectionCard title="Pinned note" action={canNote && !archived && !noteEditing ? <Button size="sm" variant="ghost" onClick={() => setNoteEditing(true)}>Edit</Button> : null}>
            {noteEditing ? <div className="grid gap-2"><Textarea aria-label="Pinned note" rows={4} maxLength={2000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /><div className="flex gap-2"><Button size="sm" variant="primary" pending={commands.isPending("note")} onClick={async () => { if (await commands.exec("note", { command: "setPhaseNote", phaseId: phase.id, note: noteDraft.trim() || null }, "Pinned note saved")) setNoteEditing(false); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => { setNoteDraft(note ?? ""); setNoteEditing(false); }}>Discard</Button></div></div> : <Text as="p" size="sm" tone={note ? "secondary" : "tertiary"} className="whitespace-pre-line">{note ?? "No pinned note."}</Text>}
          </SectionCard>
          {aside}
        </aside>
      </div>

      <VisitDialog open={visitOpen} onOpenChange={setVisitOpen} pending={commands.isPending("visit")} error={commands.error} onSave={(visitDate, visitNote) => commands.exec("visit", { command: "createVisit", phaseId: phase.id, visitDate, note: visitNote }, "Site visit added")} />
      {notesFor ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("iteration-notes")) setNotesFor(null); }} title={`${roundDisplayName(phase.name, notesFor.name)}: client notes`} description="What the client said about this round."><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("iteration-notes", { command: "setIterationNote", phaseId: phase.id, iterationId: notesFor.id, note: notesDraft.trim() || null }, `${notesFor.name}: notes saved`)) setNotesFor(null); }}><Field label="Client notes"><Textarea rows={6} maxLength={4000} value={notesDraft} autoFocus onChange={(event) => setNotesDraft(event.target.value)} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setNotesFor(null)} disabled={commands.isPending("iteration-notes")}>Cancel</Button><Button type="submit" variant="primary" pending={commands.isPending("iteration-notes")}>Save notes</Button></FormActions></form></Dialog> : null}
      {renaming ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("rename")) setRenaming(null); }} title="Rename round"><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("rename", { command: "renameIteration", phaseId: phase.id, iterationId: renaming.id, name: renameDraft }, `Renamed to ${renameDraft.trim()}`)) setRenaming(null); }}><Field label="Name" required><Input id="rename-iteration-name" value={renameDraft} maxLength={200} onChange={(event) => setRenameDraft(event.target.value)} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setRenaming(null)} disabled={commands.isPending("rename")}>Cancel</Button><Button type="submit" variant="primary" pending={commands.isPending("rename")} disabled={!renameDraft.trim()}>Save</Button></FormActions></form></Dialog> : null}
      {skipOpen ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("skip")) setSkipOpen(false); }} title="Skip this phase" description="The phase is marked done without work. A reason is recorded."><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("skip", { command: "bypass", phaseId: phase.id, reason }, `${phase.name} skipped`)) setSkipOpen(false); }}><Field label="Reason" required><Textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setSkipOpen(false)} disabled={commands.isPending("skip")}>Cancel</Button><Button type="submit" variant="primary" pending={commands.isPending("skip")} disabled={!reason.trim()}>Skip phase</Button></FormActions></form></Dialog> : null}
      {resetOpen ? <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("reset")) setResetOpen(false); }} title="Reset rounds (admin)" description="Deletes every round and its client notes for this phase. A full snapshot is kept in History."><form className="grid gap-3" onSubmit={async (event) => { event.preventDefault(); if (await commands.exec("reset", { command: "override", phaseId: phase.id, mode: reset.mode, major: Number(reset.iteration), note: reset.note }, "Rounds reset")) setResetOpen(false); }}><RadioGroup label="Result" value={reset.mode} onValueChange={(value) => setReset({ ...reset, mode: value as typeof reset.mode })} options={[{ value: "HARD_RESET_ACTIVE", label: "Restart at a round number", description: "The phase goes back to active" }, { value: "HARD_RESET_PENDING", label: "Back to not started" }]} />{reset.mode === "HARD_RESET_ACTIVE" ? <Field label="Round number" required description="Whole number, e.g. 2"><Input value={reset.iteration} inputMode="numeric" pattern="\d+" onChange={(event) => setReset({ ...reset, iteration: event.target.value })} /></Field> : null}<Field label="Note" required><Textarea rows={2} value={reset.note} maxLength={1000} onChange={(event) => setReset({ ...reset, note: event.target.value })} /></Field>{commands.error ? <InlineError>{commands.error}</InlineError> : null}<FormActions><Button type="button" onClick={() => setResetOpen(false)} disabled={commands.isPending("reset")}>Cancel</Button><Button type="submit" variant="danger" pending={commands.isPending("reset")} disabled={!reset.note.trim()}>Reset rounds</Button></FormActions></form></Dialog> : null}
    </>
  );
}
