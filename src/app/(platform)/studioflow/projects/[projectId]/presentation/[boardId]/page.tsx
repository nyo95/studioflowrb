import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { isModuleEnabled } from "@platform/core/modules";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";

import { pageProjectAccess, pageSession } from "../../../../_components/session";
import { PresentationEditor } from "../presentation-editor";

export const dynamic = "force-dynamic";

export default async function PresentationBoardPage({ params }: { params: Promise<{ projectId: string; boardId: string }> }) {
  if (!(await isModuleEnabled("presentation"))) notFound();
  const { projectId, boardId } = await params;
  const { grants } = await pageSession();
  const [project, board, scheduleEntries, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.presentation.getBoard({ grants, projectId, boardId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.presentation.listScheduleChoices({ grants, projectId }),
    pageProjectAccess(projectId),
  ]);
  return <PresentationEditor projectId={projectId} board={board} scheduleEntries={scheduleEntries} canEdit={hasPermission(grants, STUDIOFLOW_PERMISSIONS.presentationManage) && project.archivedAt === null && access.canEditDocuments} />;
}
