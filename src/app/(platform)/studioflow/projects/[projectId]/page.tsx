import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { LEGACY_PHASE_DEFINITION_IDS } from "@/apps/studioflow/domain/phase";
import { phaseStepPresentation } from "@/apps/studioflow/domain/phase-display";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";


import { PhaseCanvas } from "../../_components/phase-canvas";
import { pageSession } from "../../_components/session";
import { ProjectWorkspace } from "./_workspace-canvas/project-workspace";
import { PhaseTabs } from "./phase-tabs";

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
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.projects.listAssignablePeople({ grants }),
  ]);

  const archived = project.archivedAt !== null;
  const activePhase = phases.find((p) => p.status === "ACTIVE") ?? null;
  const selectedPhaseId = (sp.phase || null) ?? activePhase?.id ?? phases[0]?.id ?? null;

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

  return (
    <div className="grid gap-4">
      {/* One card: the phase tabs and the selected phase's workflow bar (owner, 2026-10-13). Switching a phase is a
          transition, so the old bar stays until the new one is ready and the canvas below is never reloaded. */}
      <SectionCard padded={false}>
        <PhaseTabs steps={pipelineSteps} selectedId={selectedPhaseId} />
        <div className="border-t border-line-subtle">
          {selectedPhaseId ? (
            <Suspense fallback={<PhaseBarSkeleton />}>
              <PhaseCanvas projectId={projectId} phaseId={selectedPhaseId} archived={archived} />
            </Suspense>
          ) : (
            <Text as="p" tone="secondary" size="sm" className="px-4 py-3">No phases found for this project.</Text>
          )}
        </div>
      </SectionCard>

      {/* One Workspace canvas for the whole project (board-first, owner 2026-10-13); the phase only sets context. */}
      <Suspense fallback={<SectionCard padded><SkeletonBlock className="h-[420px] w-full" /></SectionCard>}>
        <ProjectWorkspace projectId={projectId} selectedPhaseId={selectedPhaseId} people={people} archived={archived} status={project.status} />
      </Suspense>
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
