import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { pageProjectAccess, pageSession } from "../../../_components/session";
import { ReadOnlyNotice } from "../../../_components/read-only-notice";
import { ScheduleBoard } from "./schedule-board";

export const dynamic = "force-dynamic";

export default async function ProjectSchedulePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, entries, brands, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
    studioFlow.schedule.listBrandChoices({ grants }),
    pageProjectAccess(projectId),
  ]);
  const canEdit = studioFlow.schedule.canManage(grants) && project.archivedAt === null && access.canEditDocuments;

  return (
    <>
    {project.archivedAt === null && !access.completed && !access.canEditDocuments ? <ReadOnlyNotice scope="project" className="mb-3" /> : null}
    <SectionCard title="Product Schedule" description="Materials and fixtures specified for this project, each with its options and the chosen final one." count={entries.length} padded={false}>
      <ScheduleBoard
        projectId={projectId}
        entries={entries}
        brands={brands}
        canEdit={canEdit}
        canManageTemplates={hasPermission(grants, P.settingsManage)}
        templatesHref={STUDIOFLOW_ROUTES.scheduleTemplates}
      />
    </SectionCard>
    </>
  );
}
