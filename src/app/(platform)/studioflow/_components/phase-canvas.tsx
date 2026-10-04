import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Notice, SectionCard, Text } from "@/platform/ui_engine";

import { DeliverablesPanel } from "../projects/[projectId]/phases/[phaseId]/deliverables-panel";
import { RevisionHistory } from "../projects/[projectId]/phases/[phaseId]/revision-history";
import { PhasePanel } from "../projects/[projectId]/phase-panel";
import { ActivityList } from "./activity-list";
import { CdList } from "./cd-list";
import { ChecklistTree } from "./checklist-tree";
import { ReadOnlyNotice } from "./read-only-notice";
import { pageProjectAccess, pageSession } from "./session";

type PersonItem = Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>[number];

/** One phase of a project: where it stands, the next step, its iterations, note, feedback, requirements, drawings and files. */
export async function PhaseCanvas({ projectId, phaseId, people, archived }: { projectId: string; phaseId: string; people: PersonItem[]; archived: boolean }) {
  const { grants } = await pageSession();
  const caps = studioFlow.phases.capabilities(grants);
  const access = await pageProjectAccess(projectId);

  const phase = await studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!phase) return <SectionCard padded><Text tone="secondary" size="sm">Phase not found.</Text></SectionCard>;

  const [checklist, deliverablesResult, cdItems] = await Promise.all([
    studioFlow.tasks.listChecklist({ grants, projectId, phaseId: phase.id }),
    studioFlow.phases.listDeliverables({ grants, projectId, phaseId: phase.id }),
    phase.seat === "drafter" ? studioFlow.cdList.list({ grants, projectId, phaseId: phase.id }) : Promise.resolve(null),
  ]);
  const phaseAccess = access.phases.find((item) => item.phaseId === phase.id);
  const canTransition = phaseAccess?.canTransition ?? false;
  const canContent = phaseAccess?.canEditContent ?? false;
  const canManage = hasPermission(grants, P.projectManage) && access.canEditProject;
  const canWork = phase.modifiable && caps.work && canContent;
  const canAct = canTransition && caps.work;
  const current = phase.currentIteration;
  const feedbackHistory = phase.history.filter((item) => item.activityCount > 0);

  return (
    <>
      {!archived && !access.completed && !canTransition && !canContent ? <ReadOnlyNotice scope={access.isDesigner || access.isDrafter ? "phase" : "project"} /> : null}
      {phase.startBlockedReason ? <Notice tone="neutral" title="Not yet">{phase.startBlockedReason}</Notice> : null}

      <PhasePanel
        projectId={projectId}
        phase={{ id: phase.id, name: phase.label, status: phase.status, isSupervision: phase.isSupervision, canStart: phase.canStart }}
        current={current ? { id: current.id, name: current.name, state: current.state, waitingDays: current.waitingDays, choices: current.choices } : null}
        iterations={phase.iterations}
        note={phase.note}
        canAct={canAct}
        canNote={canAct}
        canOverride={caps.override}
        archived={archived}
      />

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <SectionCard
          title={phase.activeRevision ? `Feedback on ${phase.activeRevision.name}` : "Client feedback"}
          description="What the client asked for on the iteration that is open. If you choose Revision, anything unresolved becomes a to-do in the next iteration."
        >
          {phase.activeRevision ? (
            <ActivityList
              projectId={projectId}
              phaseId={phase.id}
              items={phase.activeRevision.activities}
              people={people}
              canEdit={canWork}
              emptyText="Nothing recorded yet"
            />
          ) : (
            <Text tone="secondary" size="sm">{phase.status === "PENDING" ? "Start the phase to open the first iteration." : "There is no open iteration. Add one to record feedback."}</Text>
          )}
        </SectionCard>

        <SectionCard
          title="Requirements"
          description="Reminders for this phase. They never stop a step, stay here after the phase is done until ticked or dismissed."
        >
          <ChecklistTree
            projectId={projectId}
            phaseId={phase.id}
            nodes={checklist}
            people={people}
            canEdit={canWork && hasPermission(grants, P.taskManage)}
            canToggleOptional={caps.work && canContent}
            canDismiss={canAct && !archived}
            emptyText="No requirements for this phase"
          />
        </SectionCard>
      </div>

      {cdItems ? (
        <SectionCard title="Drawing list" description="The drawings this phase needs. Tick them off as they are drawn; it never blocks a step.">
          <div className="px-(--ui-section-px) py-3">
            <CdList projectId={projectId} phaseId={phase.id} items={cdItems} people={people} canEdit={canWork} />
          </div>
        </SectionCard>
      ) : null}

      <DeliverablesPanel
        projectId={projectId}
        phaseId={phase.id}
        deliverables={deliverablesResult.items}
        status={deliverablesResult.status}
        canWork={canWork}
        canManage={canManage}
      />

      {feedbackHistory.length > 0 ? <RevisionHistory revisions={feedbackHistory} /> : null}
    </>
  );
}
