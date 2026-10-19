import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";

import { PhaseDetailsAside } from "../projects/[projectId]/phase-details-aside";
import { RequirementList, type RequirementNode } from "./requirement-list";
import { pageProjectAccess, pageSession } from "./session";

/**
 * The selected phase's requirements beside the notes or the board (owner 2026-10-14, DESIGN.md §6.2): they
 * follow the phase chosen on the strip and stay in view while writing, instead of behind a "Phase details" drawer.
 */
export async function PhaseAside({ projectId, phaseId, archived }: { projectId: string; phaseId: string; archived: boolean }) {
  const { grants, userId } = await pageSession();
  const access = await pageProjectAccess(projectId);
  const phase = await studioFlow.phases.getPhaseDetail({ grants, actorId: userId, projectId, phaseId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!phase) return null;

  const requirements = await studioFlow.tasks.listChecklist({ grants, projectId });
  const canTick = !archived && !access.completed && (access.override || access.isDesigner || access.isDrafter);
  const canEditRequirements = canTick && hasPermission(grants, P.taskManage);
  const toNodes = (rows: typeof requirements): RequirementNode[] => rows.map((item) => ({ id: item.id, label: item.label, isChecked: item.isChecked, children: item.children.map((child) => ({ id: child.id, label: child.label, isChecked: child.isChecked })) }));
  const phaseRequirements = requirements.filter((item) => item.phaseId === phase.id);
  const generalRequirements = requirements.filter((item) => item.phaseId === null);
  const done = phaseRequirements.filter((item) => item.isChecked).length;
  const generalOpen = generalRequirements.filter((item) => !item.isChecked).length;
  const current = phase.currentIteration;

  return (
    <PhaseDetailsAside
      title={phase.label}
      subtitle={current ? current.shortName : null}
      summary={`Requirements ${done}/${phaseRequirements.length}`}
    >
      <SectionCard title="Requirements" count={`${done}/${phaseRequirements.length}`}>
        <div className="grid gap-3">
          <RequirementList projectId={projectId} phaseId={phase.id} nodes={toNodes(phaseRequirements)} canTick={canTick} canEdit={canEditRequirements} emptyText="No requirements for this phase." />
          <details className="border-t border-line-subtle pt-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">Project-wide · {generalOpen} open</summary>
            <div className="pt-2"><RequirementList projectId={projectId} phaseId={null} nodes={toNodes(generalRequirements)} canTick={canTick} canEdit={canEditRequirements} emptyText="No project-wide requirements." /></div>
          </details>
          <Text as="p" size="sm" tone="tertiary">Reminders only; they never block a step.</Text>
        </div>
      </SectionCard>
    </PhaseDetailsAside>
  );
}
