import { AppError } from "@platform/core/errors";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";

import { PhasePanel } from "../projects/[projectId]/phase-panel";
import { ReadOnlyNotice } from "./read-only-notice";
import { pageProjectAccess, pageSession } from "./session";


/** The selected phase's workflow bar (round, state, steps). Its requirements and files are `PhaseAside`. */
export async function PhaseCanvas({ projectId, phaseId, archived }: { projectId: string; phaseId: string; archived: boolean }) {
  const { grants } = await pageSession();
  const caps = studioFlow.phases.capabilities(grants);
  const access = await pageProjectAccess(projectId);
  const phase = await studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!phase) return <SectionCard padded><Text tone="secondary" size="sm">Phase not found.</Text></SectionCard>;

  const phaseAccess = access.phases.find((item) => item.phaseId === phase.id);
  const canTransition = phaseAccess?.canTransition ?? false;
  const canContent = phaseAccess?.canEditContent ?? false;
  const canAct = canTransition && caps.work;
  const current = phase.currentIteration;

  return (
    <>
      {!archived && !access.completed && !canTransition && !canContent ? <div className="px-4 pt-3"><ReadOnlyNotice scope={access.isDesigner || access.isDrafter ? "phase" : "project"} /></div> : null}
      <PhasePanel
        projectId={projectId}
        phase={{ id: phase.id, name: phase.label, status: phase.status, isSupervision: phase.isSupervision, canStart: phase.canStart }}
        current={current ? { id: current.id, name: current.shortName, state: current.state, waitingDays: current.waitingDays, choices: current.choices, answerChoices: current.answerChoices, nextStepName: current.nextStepName } : null}
        iterations={phase.iterations}
        skippedReason={phase.skippedReason}
        startBlockedReason={phase.startBlockedReason}
        canAct={canAct}
        canSkip={canTransition && caps.review}
        canOverride={caps.override}
        archived={archived}
      />
    </>
  );
}
