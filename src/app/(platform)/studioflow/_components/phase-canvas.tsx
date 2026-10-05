import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Notice, SectionCard, Text } from "@/platform/ui_engine";

import { DeliverablesPanel } from "../projects/[projectId]/phases/[phaseId]/deliverables-panel";
import { PhasePanel } from "../projects/[projectId]/phase-panel";
import { ClientNotes } from "./client-notes";
import { CdList } from "./cd-list";
import { ChecklistTree } from "./checklist-tree";
import { ReadOnlyNotice } from "./read-only-notice";
import { pageProjectAccess, pageSession } from "./session";

type PersonItem = Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>[number];

/** One phase of a project: where it stands, the next step, its iterations and their client notes, the pinned note, requirements, drawings and files. */
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

  return (
    <>
      {!archived && !access.completed && !canTransition && !canContent ? <ReadOnlyNotice scope={access.isDesigner || access.isDrafter ? "phase" : "project"} /> : null}
      {phase.startBlockedReason ? <Notice tone="neutral" title="Not yet">{phase.startBlockedReason}</Notice> : null}

      <PhasePanel
        projectId={projectId}
        phase={{ id: phase.id, name: phase.label, status: phase.status, isSupervision: phase.isSupervision, canStart: phase.canStart }}
        current={current ? { id: current.id, name: current.name, state: current.state, waitingDays: current.waitingDays, choices: current.choices, answerChoices: current.answerChoices, note: current.note } : null}
        iterations={phase.iterations}
        note={phase.note}
        canAct={canAct}
        canNote={canAct}
        canOverride={caps.override}
        archived={archived}
      >
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
          <ClientNotes
            projectId={projectId}
            phaseId={phase.id}
            current={current ? { id: current.id, name: current.name, note: current.note } : null}
            previous={phase.previousIteration ? { name: phase.previousIteration.name, note: phase.previousIteration.note } : null}
            phaseStatus={phase.status}
            canEdit={canAct && !archived}
          />
          <SectionCard
            title="Requirements"
            description="The standard checklist for this phase. Reminders only: they never stop a step or completing the project, and stay here after the phase is done until ticked or dismissed."
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
      </PhasePanel>

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
    </>
  );
}
