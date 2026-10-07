import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { LEGACY_PHASE_DEFINITION_IDS } from "@/apps/studioflow/domain/phase";
import { phaseStepPresentation } from "@/apps/studioflow/domain/phase-display";
import { studioFlow } from "@/apps/studioflow/runtime";
import {
  PipelineStrip,
  SectionCard,
  Text,
} from "@/platform/ui_engine";


import { PhaseCanvas } from "../../_components/phase-canvas";
import { pageSession } from "../../_components/session";

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
      iteration: phase.iterationName && phase.iterationState ? { name: phase.iterationName, state: phase.iterationState, waitingDays: phase.waitingDays } : null,
    });
    return {
      id: phase.id,
      label: phase.label,
      note: display.note,
      state: display.state,
      href: `?phase=${phase.id}`,
      selected: phase.id === selectedPhaseId,
    };
  });

  return (
    <div className="grid gap-4">
      {/* Pipeline tabs — always immediate, no hero card */}
      <SectionCard padded={false}>
        <PipelineStrip variant="track" steps={pipelineSteps} label="Phase tabs" />
      </SectionCard>

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
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] items-start gap-4 max-[1100px]:grid-cols-1">
        <SectionCard title="Earlier iterations" padded>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        </SectionCard>
        <SectionCard title="Requirements" padded>
          <div className="grid gap-2">
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
