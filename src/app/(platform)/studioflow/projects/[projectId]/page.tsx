import { Suspense } from "react";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import {
  isPhaseFinished,
  phaseAccentDotClass,
  phaseStatusDisplay,
} from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import {
  Badge,
  Notice,
  PipelineStrip,
  SectionCard,
  Text,
} from "@/platform/ui_engine";

import { ActivityList } from "../../_components/activity-list";
import { ChecklistTree } from "../../_components/checklist-tree";
import { PhaseStatusBadge } from "../../_components/phase-status";
import { pageSession } from "../../_components/session";
import { DeliverablesPanel } from "./phases/[phaseId]/deliverables-panel";
import { PhaseActions } from "./phases/[phaseId]/phase-actions";
import { RevisionHistory } from "./phases/[phaseId]/revision-history";
import { ProjectTimeline } from "./project-timeline";

export const dynamic = "force-dynamic";

// ── Outer shell — renders immediately ─────────────────────────────────────────

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const [{ projectId }, sp] = await Promise.all([params, searchParams]);
  const { grants } = await pageSession();

  const [project, phases, people] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.projects.listAssignablePeople({ grants }),
  ]);

  const archived = project.archivedAt !== null;
  const activePhase = phases.find((p) =>
    p.status === "IN_PROGRESS" || p.status === "ON_REVIEW_INTERNAL" ||
    p.status === "APPROVED_INTERNAL" || p.status === "ON_REVIEW_CLIENT"
  ) ?? null;
  const selectedPhaseId = (sp.phase || null) ?? activePhase?.id ?? phases[0]?.id ?? null;

  const pipelineSteps = phases.map((phase) => {
    const display = phaseStatusDisplay(phase.status);
    const pipelineState = phase.status === "PENDING" ? "upcoming"
      : isPhaseFinished(phase.status) ? "done"
      : phase.blockers.total > 0 && !phase.isLocked ? "blocked"
      : "current";
    return {
      id: phase.id,
      label: phase.label,
      note: display.label,
      detail: phase.activeRevision ?? undefined,
      state: pipelineState as "done" | "current" | "upcoming" | "blocked",
      accentClass: phaseAccentDotClass(phase.definitionId),
      href: `?phase=${phase.id}`,
      selected: phase.id === selectedPhaseId,
    };
  });

  return (
    <div className="grid gap-4">
      {/* Pipeline tabs — always immediate, no hero card */}
      <SectionCard padded={false}>
        <PipelineStrip steps={pipelineSteps} label="Phase tabs" />
      </SectionCard>

      <ProjectTimeline
        startDate={project.timelineStartDate}
        openingDate={project.openingDate}
        phases={phases.map((phase) => ({ id: phase.id, definitionId: phase.definitionId, label: phase.label, status: phase.status }))}
      />

      {/* Canvas — suspends independently; key forces reset on phase switch */}
      {selectedPhaseId ? (
        <Suspense key={selectedPhaseId} fallback={<PhaseCanvasSkeleton />}>
          <PhaseCanvas
            projectId={projectId}
            phaseId={selectedPhaseId}
            people={people}
            archived={archived}
          />
        </Suspense>
      ) : (
        <SectionCard padded>
          <Text tone="secondary" size="sm">No phases found for this project.</Text>
        </SectionCard>
      )}
    </div>
  );
}

// ── Canvas — suspends here; shell above stays ──────────────────────────────────

type PersonItem = Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>[number];

async function PhaseCanvas({
  projectId,
  phaseId,
  people,
  archived,
}: {
  projectId: string;
  phaseId: string;
  people: PersonItem[];
  archived: boolean;
}) {
  const { grants } = await pageSession();
  const caps = studioFlow.phases.capabilities(grants);

  const phaseDetail = await studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!phaseDetail) return <SectionCard padded><Text tone="secondary" size="sm">Phase not found.</Text></SectionCard>;

  const [checklist, deliverablesResult] = await Promise.all([
    studioFlow.tasks.listChecklist({ grants, projectId, phaseId: phaseDetail.id }),
    studioFlow.phases.listDeliverables({ grants, projectId, phaseId: phaseDetail.id }),
  ]);
  const { items: phaseDeliverables, status: deliverableStatus } = deliverablesResult;
  const canManage = hasPermission(grants, P.projectManage);

  return (
    <>
      {/* Phase actions */}
      <SectionCard padded>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PhaseStatusBadge status={phaseDetail.status} waitingDays={phaseDetail.status === "PENDING" ? null : phaseDetail.waitingDays} />
            {phaseDetail.activeRevision ? <Badge title="Active revision">{phaseDetail.activeRevision.label}</Badge> : null}
            {phaseDetail.isLocked ? <Badge tone="success">Locked</Badge> : null}
            {phaseDetail.seat === "drafter" ? <Text size="sm" tone="secondary" meta>drafter</Text> : null}
          </div>
          {!archived ? (
            <PhaseActions
              projectId={projectId}
              phaseId={phaseDetail.id}
              commands={phaseDetail.commands}
              blockers={phaseDetail.blockers}
              todoBlockers={phaseDetail.todoBlockers}
              canWork={caps.work}
              canReview={caps.review}
              canOverride={caps.override}
              activeRevision={phaseDetail.activeRevision?.label ?? null}
              openFeedback={phaseDetail.activeRevision?.activities.filter((a) => a.mode === "FEEDBACK" && !a.done).map((a) => a.content) ?? []}
            />
          ) : null}
        </div>
        {phaseDetail.startBlockedReason ? <Notice className="mt-3" tone="neutral" title="Not yet">{phaseDetail.startBlockedReason}</Notice> : null}
        {phaseDetail.status !== "PENDING" && phaseDetail.blockers.total > 0 && !phaseDetail.isLocked ? (
          <Notice className="mt-3" tone="danger" title="Blockers">Finish {phaseDetail.blockers.reasons.join(", ")} before this phase can be approved.</Notice>
        ) : null}
      </SectionCard>

      {/* Revision + Checklist */}
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <SectionCard
          title={phaseDetail.activeRevision ? `Revision ${phaseDetail.activeRevision.label}` : "Revision work"}
          description="Client and reviewer feedback on this revision. Unresolved feedback becomes a to-do when the phase is sent back."
        >
          {phaseDetail.activeRevision ? (
            <ActivityList
              projectId={projectId}
              phaseId={phaseDetail.id}
              items={phaseDetail.activeRevision.activities}
              people={people}
              canEdit={phaseDetail.modifiable && caps.work}
              emptyText="Nothing recorded for this revision"
            />
          ) : (
            <Text tone="secondary" size="sm">
              {phaseDetail.status === "PENDING" ? "Start the phase to open revision v1.0." : "This phase has no open revision."}
            </Text>
          )}
        </SectionCard>

        <SectionCard
          title="Phase checklist"
          description="Ticked items gate approval. Items marked Optional are warnings only. Subtasks never block."
        >
          <ChecklistTree
            projectId={projectId}
            phaseId={phaseDetail.id}
            nodes={checklist}
            people={people}
            canEdit={phaseDetail.modifiable && hasPermission(grants, P.taskManage)}
            canToggleOptional={phaseDetail.modifiable && caps.work}
            emptyText="No checklist for this phase"
          />
        </SectionCard>
      </div>

      {/* Deliverables */}
      <DeliverablesPanel
        projectId={projectId}
        phaseId={phaseDetail.id}
        deliverables={phaseDeliverables}
        status={deliverableStatus}
        canWork={phaseDetail.modifiable && caps.work}
        canManage={canManage}
      />

      {phaseDetail.history.length > 0 ? <RevisionHistory revisions={phaseDetail.history} /> : null}
    </>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} />;
}

function PhaseCanvasSkeleton() {
  return (
    <div className="grid gap-4">
      <SectionCard padded>
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-12" />
          </div>
          <SkeletonBlock className="h-8 w-40" />
        </div>
      </SectionCard>
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <SectionCard title="Revision work" padded>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-4 w-2/3" />
          </div>
        </SectionCard>
        <SectionCard title="Phase checklist" padded>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

