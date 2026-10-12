import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { isModuleEnabled } from "@platform/core/modules";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { studioFlowPresentationBridge } from "@/apps/studioflow/public/presentation-bridge-runtime";
import { presentation } from "@/apps/presentation/runtime";

import { PresentationEditor } from "@/apps/presentation/ui/presentation-editor";

export const dynamic = "force-dynamic";

export default async function PresentationBoardPage({ params }: { params: Promise<{ projectId: string; boardId: string }> }) {
  if (!(await isModuleEnabled("presentation"))) notFound();
  const { projectId, boardId } = await params;
  const { principal, grants } = await requirePrincipalGrants();
  const [project, board, scheduleEntries] = await Promise.all([
    studioFlowPresentationBridge.readProjectDocumentContext({ grants, actorId: principal.userId, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    presentation.getBoard({ grants, actorId: principal.userId, projectId, boardId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    presentation.listScheduleChoices({ grants, actorId: principal.userId, projectId }),
  ]);
  return <PresentationEditor projectId={projectId} board={board} scheduleEntries={scheduleEntries} canEdit={hasPermission(grants, STUDIOFLOW_PERMISSIONS.presentationManage) && project.archivedAt === null && project.access.canEditDocuments} />;
}
