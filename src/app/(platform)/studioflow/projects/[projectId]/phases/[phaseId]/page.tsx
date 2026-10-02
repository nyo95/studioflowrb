import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { studioFlow } from "@/apps/studioflow/runtime";

import { PhaseCanvas } from "../../../../_components/phase-canvas";
import { pageSession } from "../../../../_components/session";

export const dynamic = "force-dynamic";

export default async function PhasePage({ params }: { params: Promise<{ projectId: string; phaseId: string }> }) {
  const { projectId, phaseId } = await params;
  const { grants } = await pageSession();
  const [project, people] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.projects.listAssignablePeople({ grants }),
  ]);
  return (
    <div className="grid gap-4">
      <PhaseCanvas projectId={projectId} phaseId={phaseId} people={people} archived={project.archivedAt !== null} />
    </div>
  );
}
