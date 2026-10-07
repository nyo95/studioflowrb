import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";

import { pageProjectAccess, pageSession } from "../../../_components/session";
import { ProjectTimeline } from "./project-timeline";

export const dynamic = "force-dynamic";

export default async function ProjectTimelinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, phases, plan, settings, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.projects.getProjectPlan({ grants, projectId }),
    studioFlow.projects.getStudioSettings({ grants }),
    pageProjectAccess(projectId),
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
      studioDefaults={{ cdMall: settings.cdMall, cdFinal: settings.cdFinal, gap: settings.gap, fitOutToHandover: settings.fitOutToHandover, handoverToOpening: settings.handoverToOpening }}
      canEdit={hasPermission(grants, P.projectManage) && access.canEditProject && project.archivedAt === null}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
