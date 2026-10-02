"use client";

import { useEffect, useState } from "react";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { Badge, Button, ButtonMenu, Dialog, Field, FormActions, FormattedInstant, InlineError, Input, RadioGroup, RowActionMenu, SectionCard, Text, Textarea } from "@/platform/ui_engine";

import { IterationButtons, UndoBar, usePhaseCommands, VisitDialog, type IterationView, type PhaseView } from "../../_components/phase-commands";

type IterationRow = {
  id: string;
  name: string;
  state: IterationView["state"];
  createdAt: Date;
  sentAt: Date | null;
  answeredAt: Date | null;
  doneAt: Date | null;
  visitDate: string | null;
  note: string | null;
  activityCount: number;
};

const STATE_LABEL: Record<IterationView["state"], string> = { NOT_SENT: "Not sent", SENT: "With client", ANSWERED: "Answered", REVISED: "Revised", DONE: "Done" };
const STATE_TONE: Record<IterationView["state"], "neutral" | "warning" | "success"> = { NOT_SENT: "neutral", SENT: "warning", ANSWERED: "success", REVISED: "neutral", DONE: "success" };

/**
 * The phase page's working strip: where the phase is, the one next step, the iterations so far (rename or delete an
 * unsent one), and the phase note. Everything goes through the same commands as the project card.
 */
export function PhasePanel({
  projectId,
  phase,
  current,
  iterations,
  note,
  canAct,
  canNote,
  canOverride,
  archived,
}: {
  projectId: string;
  phase: PhaseView;
  current: IterationView | null;
  iterations: IterationRow[];
  note: string | null;
  canAct: boolean;
  canNote: boolean;
  canOverride: boolean;
  archived: boolean;
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
  const noteChanged = noteDraft.trim() !== (note ?? "").trim();
  const acting = canAct && !archived;

  // A dialog opened from a menu loses autofocus to the menu trigger; put the cursor in the name box ourselves.
  useEffect(() => {
    if (!renaming) return;
    const timer = window.setTimeout(() => {
      const field = document.getElementById("rename-iteration-name") as HTMLInputElement | null;
      field?.focus();
      field?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [renaming]);

  const menuItems = [
    ...(phase.status === "PENDING" && acting ? [{ label: "Skip this phase…", description: "Marks it done without work. A reason is recorded.", onSelect: () => { setReason(""); setSkipOpen(true); } }] : []),
    ...(canOverride && !archived ? [{ label: "Admin: reset iterations…", description: "Rewrites the iteration history. Audited.", onSelect: () => setResetOpen(true) }] : []),
  ];

  return (
    <div className="grid gap-4">
      <SectionCard padded>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {phase.status === "PENDING" ? <Badge>Not started</Badge> : null}
            {phase.status === "DONE" ? <Badge tone="success">Done</Badge> : null}
            {current ? (
              <>
                <Badge tone={STATE_TONE[current.state]}>{current.name}</Badge>
                <Text size="sm" tone="secondary">
                  {current.state === "SENT" ? `With the client${current.waitingDays !== null && current.waitingDays > 0 ? ` for ${current.waitingDays} day${current.waitingDays === 1 ? "" : "s"}` : " since today"}` : STATE_LABEL[current.state]}
                </Text>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <IterationButtons phase={phase} current={current} commands={commands} canAct={acting} onNewVisit={() => setVisitOpen(true)} />
            {menuItems.length > 0 ? <ButtonMenu label="More" variant="ghost" items={menuItems} /> : null}
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          <UndoBar commands={commands} />
          {commands.error && !visitOpen && !renaming && !skipOpen && !resetOpen ? <InlineError>{commands.error}</InlineError> : null}
        </div>
      </SectionCard>

      <SectionCard title="Iterations" count={iterations.length} description="Each one is what was sent to the client, in order.">
        {iterations.length === 0 ? (
          <div className="px-(--ui-section-px) py-3"><Text tone="secondary" size="sm">Nothing has been sent yet. {phase.status === "PENDING" ? "Start the phase to open the first iteration." : ""}</Text></div>
        ) : (
          <ul className="m-0 grid list-none gap-px p-0">
            {iterations.map((iteration) => {
              const actions = acting ? [
                { label: "Rename", onSelect: () => { setRenaming(iteration); setRenameDraft(iteration.name); } },
                ...(iteration.state === "NOT_SENT" ? [{ label: "Delete (never sent)", danger: true, separatorBefore: true, onSelect: () => void commands.exec(`delete:${iteration.id}`, { command: "deleteIteration", phaseId: phase.id, iterationId: iteration.id }, `${iteration.name} deleted`) }] : []),
              ] : [];
              return (
                <li key={iteration.id} className="flex flex-wrap items-center justify-between gap-2 px-(--ui-section-px) py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge tone={STATE_TONE[iteration.state]}>{iteration.name}</Badge>
                    <Text size="sm" tone="secondary">{STATE_LABEL[iteration.state]}</Text>
                    {iteration.visitDate ? <Text size="sm" tone="secondary">Visit {iteration.visitDate}</Text> : null}
                    <Text size="sm" tone="tertiary">
                      {iteration.sentAt ? <>sent <FormattedInstant value={iteration.sentAt} locale={locale} timeZone={timezone} /></> : <>created <FormattedInstant value={iteration.createdAt} locale={locale} timeZone={timezone} /></>}
                      {iteration.answeredAt ? <> · answered <FormattedInstant value={iteration.answeredAt} locale={locale} timeZone={timezone} /></> : null}
                      {iteration.doneAt ? <> · closed <FormattedInstant value={iteration.doneAt} locale={locale} timeZone={timezone} /></> : null}
                    </Text>
                    {iteration.activityCount > 0 ? <Text size="sm" tone="tertiary">{iteration.activityCount} feedback item{iteration.activityCount === 1 ? "" : "s"}</Text> : null}
                  </div>
                  {iteration.note ? <Text size="sm" tone="secondary" className="basis-full">{iteration.note}</Text> : null}
                  {actions.length > 0 ? <RowActionMenu items={actions} label={`${iteration.name} actions`} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Phase note" description="One short note for anything the next person should know.">
        <div className="grid gap-2 px-(--ui-section-px) py-3">
          <Textarea aria-label="Phase note" rows={3} maxLength={2000} value={noteDraft} disabled={!canNote || archived} placeholder={canNote ? "No note yet" : "No note"} onChange={(event) => setNoteDraft(event.target.value)} />
          {canNote && !archived && noteChanged ? (
            <div className="flex gap-2">
              <Button size="sm" variant="primary" pending={commands.isPending("note")} onClick={() => void commands.exec("note", { command: "setPhaseNote", phaseId: phase.id, note: noteDraft.trim() ? noteDraft.trim() : null }, "Note saved")}>Save note</Button>
              <Button size="sm" variant="ghost" onClick={() => setNoteDraft(note ?? "")}>Discard</Button>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <VisitDialog
        open={visitOpen}
        onOpenChange={setVisitOpen}
        pending={commands.isPending("visit")}
        error={commands.error}
        onSave={(visitDate, visitNote) => commands.exec("visit", { command: "createVisit", phaseId: phase.id, visitDate, note: visitNote }, "Site visit added")}
      />

      {renaming ? (
        <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("rename")) setRenaming(null); }} title="Rename iteration">
          <form className="grid gap-3" onSubmit={async (event) => {
            event.preventDefault();
            if (await commands.exec("rename", { command: "renameIteration", phaseId: phase.id, iterationId: renaming.id, name: renameDraft }, `Renamed to ${renameDraft.trim()}`)) setRenaming(null);
          }}>
            <Field label="Name" required><Input id="rename-iteration-name" value={renameDraft} maxLength={200} autoFocus onChange={(event) => setRenameDraft(event.target.value)} /></Field>
            {commands.error ? <InlineError>{commands.error}</InlineError> : null}
            <FormActions>
              <Button type="button" onClick={() => setRenaming(null)} disabled={commands.isPending("rename")}>Cancel</Button>
              <Button type="submit" variant="primary" pending={commands.isPending("rename")} disabled={!renameDraft.trim()}>Save</Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}

      {skipOpen ? (
        <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("skip")) setSkipOpen(false); }} title="Skip this phase" description="The phase is marked done without work. A reason is recorded.">
          <form className="grid gap-3" onSubmit={async (event) => {
            event.preventDefault();
            if (await commands.exec("skip", { command: "bypass", phaseId: phase.id, reason }, `${phase.name} skipped`)) setSkipOpen(false);
          }}>
            <Field label="Reason" required><Textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
            {commands.error ? <InlineError>{commands.error}</InlineError> : null}
            <FormActions>
              <Button type="button" onClick={() => setSkipOpen(false)} disabled={commands.isPending("skip")}>Cancel</Button>
              <Button type="submit" variant="primary" pending={commands.isPending("skip")} disabled={!reason.trim()}>Skip phase</Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}

      {resetOpen ? (
        <Dialog open onOpenChange={(open) => { if (!open && !commands.isPending("reset")) setResetOpen(false); }} title="Reset iterations (admin)" description="Deletes every iteration and its feedback for this phase. A full snapshot is kept in History.">
          <form className="grid gap-3" onSubmit={async (event) => {
            event.preventDefault();
            if (await commands.exec("reset", { command: "override", phaseId: phase.id, mode: reset.mode, major: Number(reset.iteration), note: reset.note }, "Iterations reset")) setResetOpen(false);
          }}>
            <RadioGroup
              label="Result"
              value={reset.mode}
              onValueChange={(value) => setReset({ ...reset, mode: value as typeof reset.mode })}
              options={[
                { value: "HARD_RESET_ACTIVE", label: "Restart at an iteration number", description: "The phase goes back to active" },
                { value: "HARD_RESET_PENDING", label: "Back to not started" },
              ]}
            />
            {reset.mode === "HARD_RESET_ACTIVE" ? (
              <Field label="Iteration number" required description="Whole number, e.g. 2"><Input value={reset.iteration} inputMode="numeric" pattern="\d+" onChange={(event) => setReset({ ...reset, iteration: event.target.value })} /></Field>
            ) : null}
            <Field label="Note" required><Textarea rows={2} value={reset.note} maxLength={1000} onChange={(event) => setReset({ ...reset, note: event.target.value })} /></Field>
            {commands.error ? <InlineError>{commands.error}</InlineError> : null}
            <FormActions>
              <Button type="button" onClick={() => setResetOpen(false)} disabled={commands.isPending("reset")}>Cancel</Button>
              <Button type="submit" variant="danger" pending={commands.isPending("reset")} disabled={!reset.note.trim()}>Reset iterations</Button>
            </FormActions>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
