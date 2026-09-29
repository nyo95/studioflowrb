import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";

import { pageSession } from "../../../../_components/session";
import { PresentationEditor } from "../presentation-editor";

export const dynamic = "force-dynamic";

export default async function PresentationBoardPage({ params }: { params: Promise<{ projectId: string; boardId: string }> }) {
  const { projectId, boardId } = await params;
  const { grants } = await pageSession();
  const [project, board, scheduleEntries] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.presentation.getBoard({ grants, projectId, boardId }),
    studioFlow.presentation.listScheduleChoices({ grants, projectId }),
  ]);
  return <PresentationEditor projectId={projectId} board={board} scheduleEntries={scheduleEntries} canEdit={hasPermission(grants, STUDIOFLOW_PERMISSIONS.presentationManage) && project.archivedAt === null} />;
}
