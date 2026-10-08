import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";

import { DeliverablesPanel } from "../projects/[projectId]/phases/[phaseId]/deliverables-panel";
import { PhasePanel } from "../projects/[projectId]/phase-panel";
import { CdList } from "./cd-list";
import { ReadOnlyNotice } from "./read-only-notice";
import { RequirementList, type RequirementNode } from "./requirement-list";
import { pageProjectAccess, pageSession } from "./session";

type PersonItem = Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>[number];

export async function PhaseCanvas({ projectId, phaseId, people, archived }: { projectId: string; phaseId: string; people: PersonItem[]; archived: boolean }) {
  const { grants } = await pageSession();
  const caps = studioFlow.phases.capabilities(grants);
  const access = await pageProjectAccess(projectId);
  const phase = await studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!phase) return <SectionCard padded><Text tone="secondary" size="sm">Phase not found.</Text></SectionCard>;

  const [deliverablesResult, cdItems, requirements] = await Promise.all([
    studioFlow.phases.listDeliverables({ grants, projectId, phaseId: phase.id }),
    phase.seat === "drafter" ? studioFlow.cdList.list({ grants, projectId, phaseId: phase.id }) : Promise.resolve(null),
    studioFlow.tasks.listChecklist({ grants, projectId }),
  ]);
  const phaseAccess = access.phases.find((item) => item.phaseId === phase.id);
  const canTransition = phaseAccess?.canTransition ?? false;
  const canContent = phaseAccess?.canEditContent ?? false;
  const canManage = hasPermission(grants, P.projectManage) && access.canEditProject;
  const canWork = phase.modifiable && caps.work && canContent;
  const canAct = canTransition && caps.work;
  const canTick = !archived && !access.completed && (access.override || access.isDesigner || access.isDrafter);
  const canEditRequirements = canTick && hasPermission(grants, P.taskManage);
  const current = phase.currentIteration;
  const toNodes = (rows: typeof requirements): RequirementNode[] => rows.map((item) => ({ id: item.id, label: item.label, isChecked: item.isChecked, children: item.children.map((child) => ({ id: child.id, label: child.label, isChecked: child.isChecked })) }));
  const phaseRequirements = requirements.filter((item) => item.phaseId === phase.id);
  const generalRequirements = requirements.filter((item) => item.phaseId === null);
  const completedPhaseRequirements = phaseRequirements.filter((item) => item.isChecked).length;
  const generalOpen = generalRequirements.filter((item) => !item.isChecked).length;

  return (
    <>
      {!archived && !access.completed && !canTransition && !canContent ? <ReadOnlyNotice scope={access.isDesigner || access.isDrafter ? "phase" : "project"} /> : null}
      <PhasePanel
        projectId={projectId}
        phase={{ id: phase.id, name: phase.label, status: phase.status, isSupervision: phase.isSupervision, canStart: phase.canStart }}
        current={current ? { id: current.id, name: current.shortName, state: current.state, waitingDays: current.waitingDays, choices: current.choices, answerChoices: current.answerChoices, note: current.note, images: current.images } : null}
        iterations={phase.iterations}
        note={phase.note}
        skippedReason={phase.skippedReason}
        startBlockedReason={phase.startBlockedReason}
        canAct={canAct}
        canSkip={canTransition && caps.review}
        canNote={canAct}
        canOverride={caps.override}
        archived={archived}
        aside={<>
          <SectionCard title="Requirements" count={`${completedPhaseRequirements}/${phaseRequirements.length}`}>
            <div className="grid gap-3">
              <RequirementList projectId={projectId} phaseId={phase.id} nodes={toNodes(phaseRequirements)} canTick={canTick} canEdit={canEditRequirements} emptyText="No requirements for this phase." />
              <details className="border-t border-line-subtle pt-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">Project-wide · {generalOpen} open</summary>
                <div className="pt-2"><RequirementList projectId={projectId} phaseId={null} nodes={toNodes(generalRequirements)} canTick={canTick} canEdit={canEditRequirements} emptyText="No project-wide requirements." /></div>
              </details>
              <Text as="p" size="sm" tone="tertiary">Reminders only; they never block a step.</Text>
            </div>
          </SectionCard>
          <DeliverablesPanel projectId={projectId} phaseId={phase.id} deliverables={deliverablesResult.items} status={deliverablesResult.status} canWork={canWork} canManage={canManage} />
        </>}
      >
        {cdItems ? <SectionCard title="Drawing list" description="The drawings this phase needs. Tick them off as they are drawn; it never blocks a step."><CdList projectId={projectId} phaseId={phase.id} items={cdItems} people={people} canEdit={canWork} /></SectionCard> : null}
      </PhasePanel>
    </>
  );
}
