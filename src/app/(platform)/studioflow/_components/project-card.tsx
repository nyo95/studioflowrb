"use client";

import { Check, ChevronDown, ChevronRight, StickyNote } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Badge, IconButton, InlineError, RowActionMenu, type RowActionItem } from "@/platform/ui_engine";

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
  requirements_waiting: number;
  phases: ProjectCardPhase[];
};

const STATE_LABEL: Record<IterationView["state"], string> = { NOT_SENT: "Not sent", SENT: "With client", ANSWERED: "Answered", REVISED: "Revised", DONE: "Done" };

function waitingText(days: number | null): string {
  if (days === null || days <= 0) return "With client · today";
  return `With client · ${days}d`;
}

/**
 * One project on the home page: identity, the viewer's work, then a quiet phase ledger.
 * Project completion is only ever the explicit menu action.
 */
export function ProjectCard({
  card,
  viewer,
  tasks,
  taskCount,
  defaultExpanded = true,
}: {
  card: ProjectCardData;
  viewer: { userId: string; canOverride: boolean };
  tasks?: ReactNode;
  taskCount?: number;
  defaultExpanded?: boolean;
}) {
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
  const completedPhases = card.phases.filter((phase) => phase.status === "DONE").length;

  const menu: RowActionItem[] = [
    { label: "Open project", onSelect: () => router.push(`/studioflow/projects/${card.id}`) },
    ...(canManage && !completed ? [{ label: "Mark as completed…", separatorBefore: true, onSelect: () => setConfirmComplete(true) }] : []),
    ...(canManage && completed ? [{ label: "Reopen project", separatorBefore: true, onSelect: () => void completion.run("reopen", () => projectCompletionAction(card.id, "reopen")) }] : []),
  ];

  return (
    <article className={`grid border-b border-line first:border-t ${expanded ? "gap-4 py-5" : "gap-0 py-3"}`} aria-label={card.name}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${card.name}`}
            onClick={() => setExpanded((current) => !current)}
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-action text-ink-tertiary hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          </button>
          <div className="min-w-0">
            <Link href={`/studioflow/projects/${card.id}`} className="text-base font-semibold text-ink hover:underline">{card.name}</Link>
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-ink-secondary">
              <span>{card.client?.name ?? "No client"}</span>
              {taskCount !== undefined ? <span>{taskCount} task{taskCount === 1 ? "" : "s"}</span> : null}
              <span>{completedPhases}/{card.phases.length} phases done</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {card.status === "ON_HOLD" ? <Badge tone="warning">On hold</Badge> : null}
          {completed ? <Badge tone="success"><Check className="h-3 w-3" aria-hidden="true" />Completed</Badge> : null}
          {card.requirements_waiting > 0 ? <span className="text-xs text-ink-secondary" title="Requirements are reminders. They never block a step or completing the project.">{card.requirements_waiting} requirement{card.requirements_waiting === 1 ? "" : "s"} waiting</span> : null}
          {card.dependents_review_suggested ? <Badge tone="warning" title="An earlier phase is active again while a later one is already done.">Check later phases</Badge> : null}
          <span className="relative inline-flex">
            <IconButton size="sm" variant="ghost" label="Pinned notes" icon={<StickyNote aria-hidden="true" />} onClick={() => setNotesOpen(true)} />
            {card.note_phases.length > 0 ? <span className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-warning" aria-hidden="true" /> : null}
          </span>
          <RowActionMenu items={menu} label="Project actions" pending={completion.pending} />
        </div>
      </header>

      {expanded && tasks ? <section className="border-t border-line pt-3">{tasks}</section> : null}

      {expanded ? <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-x-4 gap-y-3 border-t border-line pt-3">
        {card.phases.map((phase) => {
          const current = phase.current_iteration;
          const view: PhaseView = { id: phase.id, name: phase.name, status: phase.status, isSupervision: phase.is_supervision, canStart: phase.can_start };
          const iteration: IterationView | null = current ? { id: current.id, name: current.name, state: current.state, waitingDays: current.waiting_days, choices: current.available_choices, answerChoices: current.answer_choices, note: current.note } : null;
          const acting = !completed && projectActive && seatOwner(phase);
          return (
            <li
              key={phase.id}
              className={`grid content-start gap-1.5 border-l-2 py-1 pl-3 pr-2 ${phase.status === "PENDING" ? "border-line" : phase.status === "DONE" ? "border-success" : "border-ink"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <Link href={`/studioflow/projects/${card.id}?phase=${phase.id}`} className={`truncate text-sm font-medium hover:underline ${phase.status === "PENDING" ? "text-ink-tertiary" : "text-ink"}`}>{phase.name}</Link>
                {phase.has_note ? <StickyNote aria-label="Has a pinned note" className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" /> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
                {phase.status === "DONE" ? <span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" aria-hidden="true" />Done</span> : null}
                {phase.status === "PENDING" ? <span className="text-ink-tertiary">Not started</span> : null}
                {current ? (
                  <>
                    <Badge tone={current.state === "SENT" ? "warning" : current.state === "ANSWERED" ? "success" : "neutral"}>{current.name}</Badge>
                    <span className={current.state === "SENT" ? "text-warning" : ""}>{current.state === "SENT" ? waitingText(current.waiting_days) : phase.is_supervision && current.state === "NOT_SENT" ? "Visit planned" : STATE_LABEL[current.state]}</span>
                  </>
                ) : null}
                {phase.iteration_count > 1 ? <span className="text-ink-tertiary">{phase.iteration_count} in total</span> : null}
                {phase.is_supervision && phase.last_visit_days_ago !== null ? <span className="text-ink-tertiary">Last visit {phase.last_visit_days_ago === 0 ? "today" : `${phase.last_visit_days_ago}d ago`}</span> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <IterationButtons phase={view} current={iteration} commands={commands} canAct={acting} onNewVisit={() => setVisitPhaseId(phase.id)} />
              </div>
            </li>
          );
        })}
      </ol> : null}

      <UndoBar commands={commands} />
      {commands.error ? <InlineError>{commands.error}</InlineError> : null}
      {completion.error ? <InlineError>{completion.error}</InlineError> : null}

      <VisitDialog
        open={visitPhaseId !== null}
        onOpenChange={(open) => { if (!open) setVisitPhaseId(null); }}
        pending={visitPhaseId !== null && commands.isPending(`${visitPhaseId}:visit`)}
        error={commands.error}
        onSave={(visitDate, note) => commands.exec(`${visitPhaseId}:visit`, { command: "createVisit", phaseId: visitPhaseId!, visitDate, note }, "Site visit added")}
      />
      <PhaseNotesDialog projectId={card.id} open={notesOpen} onOpenChange={setNotesOpen} canEdit={canManage || card.phases.some(seatOwner)} />
      <ProjectCompletionDialog projectId={card.id} projectName={card.name} open={confirmComplete} onOpenChange={setConfirmComplete} />
    </article>
  );
}
