import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { isModuleEnabled } from "@platform/core/modules";
import { hasPermission } from "@platform/core/rbac";
import { LEGACY_PHASE_DEFINITION_IDS } from "@/apps/studioflow/domain/phase";
import { phaseStepPresentation } from "@/apps/studioflow/domain/phase-display";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";


import { PhaseAside } from "../../_components/phase-aside";
import { PhaseCanvas } from "../../_components/phase-canvas";
import { canSeeProjectWorkSections, pageProjectAccess, pageSession } from "../../_components/session";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { ProjectNotes } from "./_notes-stream/project-notes";
import { ProjectWorkspace } from "./_workspace-canvas/project-workspace";
import { ConstructionDrawingWorkspace } from "./construction-drawing-workspace";
import { PhaseTabs } from "./phase-tabs";
import styles from "./phase-layout.module.css";

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
  const { grants, userId } = await pageSession();
  const access = await pageProjectAccess(projectId);
  if (!canSeeProjectWorkSections(access)) redirect(STUDIOFLOW_ROUTES.projectSchedule(projectId));

  const [project, allPhases, people, boardEnabled] = await Promise.all([
    studioFlow.projects.getProject({ grants, actorId: userId, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.projects.listAssignablePeople({ grants }),
    isModuleEnabled("workspace-board"),
  ]);

  // A Drafter-only PIC works only in Drafter-seat phases; Designer phases and their Notes/Workspace stay out of view.
  const phases = access.isDrafter && !access.isDesigner && !hasPermission(grants, P.projectManage)
    ? allPhases.filter((phase) => phase.seat === "drafter")
    : allPhases;

  const archived = project.archivedAt !== null;
  const activePhase = phases.find((p) => p.status === "ACTIVE") ?? null;
  const requestedPhase = sp.phase ? phases.find((phase) => phase.id === sp.phase) ?? null : null;
  const selectedPhaseId = requestedPhase?.id ?? activePhase?.id ?? phases[0]?.id ?? null;
  const selectedPhase = phases.find((phase) => phase.id === selectedPhaseId) ?? null;

  const pipelineSteps = phases.map((phase, index) => {
    const display = phaseStepPresentation({
      phaseName: phase.label,
      phaseStatus: phase.status,
      previousPhaseName: index > 0 ? phases[index - 1]!.label : null,
      canStart: phase.status === "PENDING" && !phase.startBlockedReason,
      isSupervision: phase.definitionId === LEGACY_PHASE_DEFINITION_IDS.supervision,
      skippedReason: phase.skippedReason,
      iteration: phase.iterationName && phase.iterationState ? { name: phase.iterationShortName ?? phase.iterationName, state: phase.iterationState, waitingDays: phase.waitingDays } : null,
    });
    return {
      id: phase.id,
      label: phase.label,
      note: display.note,
      state: display.state,
    };
  });

  // Record workspace (DESIGN.md §6.2): the page fills the window below the header and the notes keep their own scroll.
  return (
    <div data-fill-page className={`${styles.phasePage} flex flex-1 flex-col gap-4 xl:min-h-0`}>
      {/* One row (owner 2026-10-14, DESIGN.md §6.2): the phase strip, and at its right end the selected phase's round,
          state and primary step. Below 1280px the workflow wraps under the strip. Switching a phase is a transition,
          so the old bar stays until the new one is ready and the notes below are never reloaded. */}
      <SectionCard padded={false} className="shrink-0">
        <div className="flex flex-wrap items-stretch">
          <div className="min-w-0 flex-[1_1_40rem]">
            <PhaseTabs steps={pipelineSteps} selectedId={selectedPhaseId} />
          </div>
          <div className="flex min-w-0 flex-[1_1_100%] items-center border-t border-line-subtle xl:flex-[0_1_34rem] xl:border-l xl:border-t-0">
            <div className="min-w-0 flex-1">
              {selectedPhaseId ? (
                <Suspense fallback={<PhaseBarSkeleton />}>
                  <PhaseCanvas projectId={projectId} phaseId={selectedPhaseId} archived={archived} />
                </Suspense>
              ) : (
                <Text as="p" tone="secondary" size="sm" className="px-4 py-3">No phases found for this project.</Text>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Notes (or, with the Workspace board module on, the board) with the phase's requirements and files beside them.
          Both read the same notes; each column scrolls by itself. */}
      <div className="flex flex-1 gap-4 max-xl:flex-col xl:min-h-0">
        <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col gap-4 xl:min-h-0">
          <Suspense fallback={<SectionCard padded><SkeletonBlock className="h-[420px] w-full" /></SectionCard>}>
            {selectedPhase?.seat === "drafter"
              ? <ConstructionDrawingWorkspace projectId={projectId} phaseId={selectedPhase.id} archived={archived} status={project.status} />
              : boardEnabled
              ? <ProjectWorkspace projectId={projectId} projectName={project.name} selectedPhaseId={selectedPhaseId} people={people} archived={archived} status={project.status} />
              : <ProjectNotes projectId={projectId} projectName={project.name} team={{ designer: project.designer, drafter: project.drafter }} selectedPhaseId={selectedPhaseId} people={people} archived={archived} status={project.status} />}
          </Suspense>
        </div>
        {selectedPhaseId ? <Suspense fallback={null}><PhaseAside projectId={projectId} phaseId={selectedPhaseId} archived={archived} /></Suspense> : null}
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} />;
}

function PhaseBarSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex gap-2">
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-5 w-16" />
      </div>
      <SkeletonBlock className="h-8 w-56" />
    </div>
  );
}
