import Link from "next/link";

import { hasPermission } from "@platform/core/rbac";
import { formatDateOnly } from "@platform/utilities/date";
import {
  isPhaseFinished,
  phaseAccentDotClass,
  phaseStatusDisplay,
} from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import {
  Badge,
  DescriptionItem,
  DescriptionList,
  Heading,
  MetricValue,
  PipelineStrip,
  SectionCard,
  Text,
} from "@/platform/ui_engine";

import { ChecklistTree } from "../../_components/checklist-tree";
import { PhaseStatusBadge } from "../../_components/phase-status";
import { PersonChip } from "../../_components/people";
import { pageSession } from "../../_components/session";
import { InlinePhaseAction } from "./inline-phase-action";

export const dynamic = "force-dynamic";

const PRIORITY_BADGE: Record<string, { label: string; tone: "neutral" | "warning" | "danger" }> = {
  NORMAL: { label: "Normal", tone: "neutral" },
  HIGH: { label: "High", tone: "warning" },
  URGENT: { label: "Urgent", tone: "danger" },
};

const STATUS_BADGE: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  ACTIVE: { label: "Active", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  ON_HOLD: { label: "On hold", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

/** V2-D9: Overview is the main workspace. Phase cards with inline actions. */
export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, phases, generalChecklist, people] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.tasks.listChecklist({ grants, projectId, phaseId: null }),
    studioFlow.projects.listAssignablePeople({ grants }),
  ]);
  const archived = project.archivedAt !== null;
  const caps = studioFlow.phases.capabilities(grants);

  // ── Stat derivations ──────────────────────────────────────────────────────
  const phaseDone = phases.filter((p) => isPhaseFinished(p.status)).length;
  const openChecklist = phases.reduce((n, p) => n + p.openRootChecklist, 0) + generalChecklist.filter((n) => !n.isChecked).length;
  const activePhase = phases.find((p) => p.status === "IN_PROGRESS" || p.status === "ON_REVIEW_INTERNAL" || p.status === "APPROVED_INTERNAL" || p.status === "ON_REVIEW_CLIENT") ?? null;
  const daysOpen = project.openingDate ? Math.floor((Date.now() - new Date(project.openingDate).getTime()) / 86_400_000) : null;

  // ── Pipeline strip ────────────────────────────────────────────────────────
  const pipelineSteps = phases.map((phase) => {
    const display = phaseStatusDisplay(phase.status);
    const pipelineState = phase.status === "PENDING"
      ? "upcoming"
      : isPhaseFinished(phase.status)
        ? "done"
        : phase.blockers.total > 0 && !phase.isLocked
          ? "blocked"
          : "current";
    return {
      id: phase.id,
      label: phase.label,
      note: display.label,
      detail: phase.activeRevision ?? undefined,
      state: pipelineState as "done" | "current" | "upcoming" | "blocked",
      accentClass: phaseAccentDotClass(phase.key),
      href: STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id),
    };
  });

  const priorityBadge = PRIORITY_BADGE[project.priority] ?? PRIORITY_BADGE.NORMAL;
  const statusBadge = STATUS_BADGE[project.status] ?? STATUS_BADGE.ACTIVE;

  return (
    <div className="grid gap-4">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <SectionCard padded={false}>
        <div className="px-4 pt-4 pb-3 grid gap-3">
          {/* Top row: name + status chips */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={3}>{project.readableName}</Heading>
                <Badge>{project.code}</Badge>
                <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
                {project.priority !== "NORMAL" ? <Badge tone={priorityBadge.tone}>{priorityBadge.label}</Badge> : null}
              </div>
              {project.client ? (
                <Text size="sm" tone="secondary">{project.client.name}</Text>
              ) : null}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Phases done" value={`${phaseDone} / ${phases.length}`} />
            <StatCard label="Open to-dos" value={String(openChecklist)} muted={openChecklist === 0} />
            {daysOpen !== null ? <StatCard label="Days open" value={String(daysOpen)} muted={false} /> : null}
            {activePhase ? (
              <StatCard label="Active phase" value={activePhase.label} />
            ) : phaseDone === phases.length ? (
              <StatCard label="Status" value="All done" muted />
            ) : null}
          </div>

          {/* Team row */}
          <div className="flex flex-wrap gap-4 text-sm">
            {people.filter((p) => p.id === project.designer.id || p.id === project.drafter.id).length > 0 ? (
              <>
                <span className="flex items-center gap-1.5 text-ink-secondary">
                  <span className="text-ink-tertiary text-xs">Designer</span>
                  <PersonChip person={{ id: project.designer.id, displayName: project.designer.displayName, active: project.designer.active }} />
                </span>
                <span className="flex items-center gap-1.5 text-ink-secondary">
                  <span className="text-ink-tertiary text-xs">Drafter</span>
                  <PersonChip person={{ id: project.drafter.id, displayName: project.drafter.displayName, active: project.drafter.active }} />
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Phase track */}
        <PipelineStrip steps={pipelineSteps} label="Phase progress" />
      </SectionCard>

      {/* ── Phase cards (V2-D9 main workspace) ──────────────────────────── */}
      <div className="grid gap-3">
        {phases.map((phase) => {
          const primaryCommand = phase.commands[0] ?? null;
          const isBlocked = phase.blockers.total > 0 && !phase.isLocked;
          const accentClass = phaseAccentDotClass(phase.key);

          return (
            <SectionCard key={phase.id} padded={false}>
              <div className="flex flex-wrap items-start gap-4 p-4">
                {/* Phase identity */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={`size-2.5 rounded-full flex-none ${accentClass}`} />
                  <div className="grid gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id)}
                        className="font-medium text-ink hover:underline underline-offset-2"
                      >
                        {phase.label}
                      </Link>
                      <PhaseStatusBadge
                        status={phase.status}
                        waitingDays={phase.status === "PENDING" ? null : phase.waitingDays}
                      />
                      {phase.activeRevision ? (
                        <Badge title="Active revision">{phase.activeRevision}</Badge>
                      ) : null}
                      {phase.isLocked ? <Badge tone="success">Locked</Badge> : null}
                      {phase.seat === "drafter" ? (
                        <Text size="sm" tone="secondary" meta>drafter</Text>
                      ) : null}
                    </div>

                    {/* Blockers or next step */}
                    {phase.startBlockedReason ? (
                      <Text size="sm" tone="secondary">{phase.startBlockedReason}</Text>
                    ) : isBlocked ? (
                      <span className="text-xs font-medium text-warning">
                        Waiting on: {phase.blockers.reasons.join(", ")}
                      </span>
                    ) : phase.openRootChecklist > 0 ? (
                      <Text size="sm" tone="secondary">
                        {phase.openRootChecklist} checklist item{phase.openRootChecklist === 1 ? "" : "s"} open
                      </Text>
                    ) : null}
                  </div>
                </div>

                {/* Inline primary action (V2-D9) */}
                {!archived && primaryCommand ? (
                  <InlinePhaseAction
                    projectId={projectId}
                    phaseId={phase.id}
                    command={primaryCommand}
                    commands={phase.commands}
                    blockers={phase.blockers}
                    todoBlockers={phase.todoBlockers}
                    canWork={caps.work}
                    canReview={caps.review}
                    canOverride={caps.override}
                    activeRevision={phase.activeRevision}
                  />
                ) : null}
              </div>

              {/* Phase-level checklist summary (open root items) */}
              {phase.openRootChecklist > 0 && phase.status !== "PENDING" && phase.status !== "COMPLETED" && phase.status !== "READY_FOR_NEXT" ? (
                <div className="border-t border-line-subtle px-4 py-2">
                  <Text size="sm" tone="secondary" meta>
                    <Link
                      href={STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id)}
                      className="hover:underline underline-offset-2"
                    >
                      View phase checklist →
                    </Link>
                  </Text>
                </div>
              ) : null}
            </SectionCard>
          );
        })}
      </div>

      {/* ── General todos (SfChecklistItem with phase_id null) ─────────────── */}
      <SectionCard
        title="General to-dos"
        description="Project-wide work items not tied to any phase."
      >
        <ChecklistTree
          projectId={projectId}
          nodes={generalChecklist}
          people={people}
          canEdit={!archived && hasPermission(grants, P.taskManage)}
          emptyText="No general to-dos"
        />
      </SectionCard>

      {/* ── Project details ─────────────────────────────────────────────── */}
      <SectionCard title="Details">
        <DescriptionList>
          <DescriptionItem label="Number">{project.code}</DescriptionItem>
          <DescriptionItem label="Type">{project.projectType}</DescriptionItem>
          <DescriptionItem label="Opening date">
            {project.openingDate ? formatDateOnly(project.openingDate) : "—"}
          </DescriptionItem>
          <DescriptionItem label="Area">{project.area ? `${project.area} m²` : "—"}</DescriptionItem>
          <DescriptionItem label="Client contact">{project.clientContact ?? "—"}</DescriptionItem>
          <DescriptionItem label="Site address">{project.address ?? "—"}</DescriptionItem>
        </DescriptionList>
      </SectionCard>
    </div>
  );
}

function StatCard({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5">
      <p className="text-xs text-ink-tertiary leading-none mb-1">{label}</p>
      <MetricValue size="sm" className={muted ? "text-ink-secondary" : undefined}>{value}</MetricValue>
    </div>
  );
}
