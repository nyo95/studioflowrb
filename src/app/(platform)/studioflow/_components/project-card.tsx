"use client";

import { Check, ChevronDown, ChevronRight, StickyNote } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { phaseStepPresentation } from "@/apps/studioflow/domain/phase-display";
import { Badge, IconButton, InlineError, PipelineStrip, RowActionMenu, SectionCard, type RowActionItem } from "@/platform/ui_engine";

import { projectCompletionAction } from "../actions";
import { IterationButtons, UndoBar, usePhaseCommands, VisitDialog, type IterationView, type PhaseView } from "./phase-commands";
import { PhaseNotesDialog } from "./phase-notes-dialog";
import { ProjectCompletionDialog } from "./project-completion";
import { useCommand } from "./use-command";

export type ProjectCardPhase = {
  id: string;
  name: string;
  status: "PENDING" | "ACTIVE" | "DONE";
  seat: "designer" | "drafter";
  is_supervision: boolean;
  can_start: boolean;
  has_note: boolean;
  iteration_count: number;
  last_visit_days_ago: number | null;
  current_iteration: { id: string; name: string; state: IterationView["state"]; waiting_days: number | null; available_choices: string[]; answer_choices: string[]; note: string | null } | null;
};

export type ProjectCardData = {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED";
  pic_ids: { designer: string; drafter: string };
  dependents_review_suggested: boolean;
  can_mark_completed: boolean;
  note_phases: string[];
  phases: ProjectCardPhase[];
};

export function ProjectCard({ card, viewer, defaultExpanded = true }: { card: ProjectCardData; viewer: { userId: string; canOverride: boolean }; defaultExpanded?: boolean }) {
  const router = useRouter();
  const commands = usePhaseCommands(card.id);
  const completion = useCommand();
  const [visitPhaseId, setVisitPhaseId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const completed = card.status === "COMPLETED";
  const isPic = viewer.userId === card.pic_ids.designer || viewer.userId === card.pic_ids.drafter;
  const projectActive = card.status === "ACTIVE";
  const seatOwner = (phase: ProjectCardPhase) => viewer.canOverride || viewer.userId === (phase.seat === "drafter" ? card.pic_ids.drafter : card.pic_ids.designer);
  const canManage = isPic || viewer.canOverride;
  const menu: RowActionItem[] = [
    { label: "Open project", onSelect: () => router.push(`/studioflow/projects/${card.id}`) },
    ...(canManage && !completed ? [{ label: "Mark as completed…", separatorBefore: true, onSelect: () => setConfirmComplete(true) }] : []),
    ...(canManage && completed ? [{ label: "Reopen project", separatorBefore: true, onSelect: () => void completion.run("reopen", () => projectCompletionAction(card.id, "reopen")) }] : []),
  ];
  const steps = card.phases.map((phase, index) => {
    const current = phase.current_iteration;
    const view: PhaseView = { id: phase.id, name: phase.name, status: phase.status, isSupervision: phase.is_supervision, canStart: phase.can_start };
    const iteration: IterationView | null = current ? { id: current.id, name: current.name, state: current.state, waitingDays: current.waiting_days, choices: current.available_choices, answerChoices: current.answer_choices, note: current.note } : null;
    const display = phaseStepPresentation({
      phaseName: phase.name,
      phaseStatus: phase.status,
      previousPhaseName: index > 0 ? card.phases[index - 1]!.name : null,
      canStart: phase.can_start,
      isSupervision: phase.is_supervision,
      iterationCount: phase.iteration_count,
      iteration: current ? { name: current.name, state: current.state, waitingDays: current.waiting_days } : null,
    });
    return {
      id: phase.id,
      label: phase.name,
      note: display.note,
      state: display.state,
      href: `/studioflow/projects/${card.id}?phase=${phase.id}`,
      action: <IterationButtons phase={view} current={iteration} commands={commands} canAct={!completed && projectActive && seatOwner(phase)} onNewVisit={() => setVisitPhaseId(phase.id)} />,
    };
  });

  return (
    /* min-w-0: as a grid item the card would otherwise grow to the phase strip's full width (640px on a
       375px phone) and push the whole page sideways; the strip scrolls inside the card instead. */
    <article aria-label={card.name} className="min-w-0">
      <SectionCard padded={false}>
        <header className="flex flex-wrap items-start justify-between gap-3 px-(--ui-section-px) py-3">
          <div className="flex min-w-0 items-start gap-2">
            <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${card.name}`} onClick={() => setExpanded((value) => !value)} className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-action text-ink-tertiary hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            </button>
            <div className="min-w-0">
              <Link href={`/studioflow/projects/${card.id}`} className="text-base font-semibold text-ink hover:underline">{card.name}</Link>
              <p className="m-0 text-sm text-ink-secondary">{card.client?.name ?? "No client"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {card.status === "ON_HOLD" ? <Badge tone="warning">On hold</Badge> : null}
            {completed ? <Badge tone="success"><Check className="h-3 w-3" aria-hidden="true" />Completed</Badge> : null}
            {card.dependents_review_suggested ? <Badge tone="warning" title="An earlier phase is active again while a later one is already done.">Check later phases</Badge> : null}
            <span className="relative inline-flex">
              <IconButton size="sm" variant="ghost" label="Pinned notes" icon={<StickyNote aria-hidden="true" />} onClick={() => setNotesOpen(true)} />
              {card.note_phases.length > 0 ? <span className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-warning" aria-hidden="true" /> : null}
            </span>
            <RowActionMenu items={menu} label="Project actions" pending={completion.pending} />
          </div>
        </header>
        {expanded ? <div className="border-t border-line-subtle"><PipelineStrip variant="track" steps={steps} label={`${card.name} phases`} /></div> : null}
        <div className="grid gap-2 px-(--ui-section-px)">
          <UndoBar commands={commands} />
          {commands.error ? <InlineError>{commands.error}</InlineError> : null}
          {completion.error ? <InlineError>{completion.error}</InlineError> : null}
        </div>
      </SectionCard>
      <VisitDialog open={visitPhaseId !== null} onOpenChange={(open) => { if (!open) setVisitPhaseId(null); }} pending={visitPhaseId !== null && commands.isPending(`${visitPhaseId}:visit`)} error={commands.error} onSave={(visitDate, note) => commands.exec(`${visitPhaseId}:visit`, { command: "createVisit", phaseId: visitPhaseId!, visitDate, note }, "Site visit added")} />
      <PhaseNotesDialog projectId={card.id} open={notesOpen} onOpenChange={setNotesOpen} canEdit={canManage || card.phases.some(seatOwner)} />
      <ProjectCompletionDialog projectId={card.id} projectName={card.name} open={confirmComplete} onOpenChange={setConfirmComplete} />
    </article>
  );
}
