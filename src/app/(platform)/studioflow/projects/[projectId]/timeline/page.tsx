import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { currentDateOnly } from "@platform/utilities/date";
import { studioFlow } from "@/apps/studioflow/runtime";

import { pageSession } from "../../../_components/session";
import { ProjectTimeline } from "./project-timeline";

export const dynamic = "force-dynamic";

export default async function ProjectTimelinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants, userId } = await pageSession();
  const [project, phases, plan] = await Promise.all([
    studioFlow.projects.getProject({ grants, actorId: userId, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.projects.getProjectPlan({ grants, projectId }),
  ]);

  return (
    <ProjectTimeline
      project={{
        id: project.id,
        name: project.name,
        client: project.client ? { id: project.client.id, name: project.client.name } : null,
        openingDate: project.openingDate ?? null,
        timelineStartDate: project.timelineStartDate,
        fitOutStartDate: project.fitOutStartDate ?? null,
        designHandoverDate: project.designHandoverDate ?? null,
      }}
      phases={phases.map((phase) => ({
        id: phase.id,
        definitionId: phase.definitionId,
        label: phase.label,
        status: phase.status,
        plannedStartDate: phase.plannedStartDate,
        plannedEndDate: phase.plannedEndDate,
        manual: phase.plannedDatesManual,
      }))}
      plan={plan}
      today={currentDateOnly()}
    />
  );
}
