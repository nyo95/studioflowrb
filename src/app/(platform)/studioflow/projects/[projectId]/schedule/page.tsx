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

export default async function ProjectSchedulePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ entry?: string | string[] }> }) {
  const { projectId } = await params;
  const { entry } = await searchParams;
  const { grants, userId } = await pageSession();
  const [project, entries, brands, categoryChoices, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, actorId: userId, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
    studioFlow.schedule.listBrandChoices({ grants }),
    studioFlow.schedule.listCategoryChoices({ grants }),
    pageProjectAccess(projectId),
  ]);
  const canEdit = studioFlow.schedule.canManage(grants) && project.archivedAt === null && access.canEditDocuments;

  return (
    <>
    {project.archivedAt === null && !access.completed && !access.canEditDocuments ? <ReadOnlyNotice scope="project" className="mb-3" /> : null}
    <SectionCard title="Product Schedule" description="Materials and fixtures specified for this project, each with its options and the chosen final one." count={entries.length} padded={false}>
      <ScheduleBoard
        initialOpenId={typeof entry === "string" && entries.some((item) => item.id === entry) ? entry : null}
        projectId={projectId}
        entries={entries}
        brands={brands}
        categoryChoices={categoryChoices}
        canEdit={canEdit}
        canManageTemplates={hasPermission(grants, P.settingsManage)}
        templatesHref={STUDIOFLOW_ROUTES.scheduleTemplates}
      />
    </SectionCard>
    </>
  );
}
