import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, Heading, MetaList, Notice, SectionCard, Text } from "@/platform/ui_engine";

import { ActivityList } from "../../../../_components/activity-list";
import { ChecklistTree } from "../../../../_components/checklist-tree";
import { PhaseStatusBadge } from "../../../../_components/phase-status";
import { PersonChip } from "../../../../_components/people";
import { pageSession } from "../../../../_components/session";
import { PhaseActions } from "./phase-actions";
import { RequirementsPanel } from "./requirements-panel";
import { DeliverablesPanel } from "./deliverables-panel";
import { RevisionHistory } from "./revision-history";

export const dynamic = "force-dynamic";

export default async function PhasePage({ params }: { params: Promise<{ projectId: string; phaseId: string }> }) {
  const { projectId, phaseId } = await params;
  const { grants } = await pageSession();
  const phase = await studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  });
  const [checklist, people, phaseRequirements, phaseDeliverablesResult] = await Promise.all([
    studioFlow.tasks.listChecklist({ grants, projectId, phaseId }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.phases.listRequirements({ grants, projectId, phaseId }),
    studioFlow.phases.listDeliverables({ grants, projectId, phaseId }),
  ]);
  const { items: phaseDeliverables, status: deliverableStatus } = phaseDeliverablesResult;
  const seatPerson = (await studioFlow.projects.resolvePeople({ grants, userIds: [phase.seatUserId] }))[0];
  const caps = studioFlow.phases.capabilities(grants);
  const canWork = phase.modifiable && caps.work;
  const canManage = hasPermission(grants, P.projectManage);

  return (
    <div className="grid gap-4">
      <SectionCard padded>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Heading level={2}>{phase.label}</Heading>
              <PhaseStatusBadge status={phase.status} waitingDays={phase.status === "PENDING" ? null : phase.waitingDays} />
              {phase.activeRevision ? <Badge title="Active revision">{phase.activeRevision.label}</Badge> : null}
              {phase.isLocked ? <Badge tone="success">Locked</Badge> : null}
            </div>
            <MetaList items={[
              <span key="seat" className="inline-flex items-center gap-1.5">{phase.seat === "drafter" ? "Drafter" : "Designer"}: <PersonChip person={seatPerson} /></span>,
              phase.allowParallel ? "Can run in parallel" : "Sequential",
            ]} />
          </div>
          <PhaseActions
            projectId={projectId}
            phaseId={phaseId}
            commands={phase.commands}
            blockers={phase.blockers}
            todoBlockers={phase.todoBlockers}
            canWork={caps.work}
            canReview={caps.review}
            canOverride={caps.override}
            activeRevision={phase.activeRevision?.label ?? null}
            openFeedback={phase.activeRevision?.activities.filter((a) => a.mode === "FEEDBACK" && !a.done).map((a) => a.content) ?? []}
          />
        </div>
        {phase.startBlockedReason ? <Notice className="mt-3" tone="neutral" title="Not yet">{phase.startBlockedReason}</Notice> : null}
        {phase.status !== "PENDING" && phase.blockers.total > 0 && !phase.isLocked ? (
          <Notice className="mt-3" tone="danger" title="Blockers">Finish {phase.blockers.reasons.join(", ")} before this phase can be approved.</Notice>
        ) : null}
      </SectionCard>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <SectionCard
          title={phase.activeRevision ? `Revision ${phase.activeRevision.label}` : "Revision work"}
          description="Client and reviewer feedback on this revision. Unresolved feedback becomes a to-do when the phase is sent back."
        >
          {phase.activeRevision ? (
            <ActivityList
              projectId={projectId}
              phaseId={phaseId}
              items={phase.activeRevision.activities}
              people={people}
              canEdit={canWork}
              emptyText="Nothing recorded for this revision"
            />
          ) : (
            <Text tone="secondary" size="sm">{phase.status === "PENDING" ? "Start the phase to open revision v1.0." : "This phase has no open revision."}</Text>
          )}
        </SectionCard>

        <SectionCard title="Phase checklist" description="Root items must be ticked before approval. Subtasks never block.">
          <ChecklistTree projectId={projectId} nodes={checklist} people={people} canEdit={phase.modifiable && hasPermission(grants, P.taskManage)} emptyText="No checklist for this phase" />
        </SectionCard>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 max-[900px]:grid-cols-1">
        <RequirementsPanel
          projectId={projectId}
          phaseId={phaseId}
          requirements={phaseRequirements}
          canWork={canWork}
          canManage={canManage}
        />
        <DeliverablesPanel
          projectId={projectId}
          phaseId={phaseId}
          deliverables={phaseDeliverables}
          status={deliverableStatus}
          canWork={canWork}
          canManage={canManage}
        />
      </div>

      {phase.history.length > 0 ? <RevisionHistory revisions={phase.history} /> : null}
    </div>
  );
}
