import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { pageSession } from "../../../_components/session";
import { PresentationBoardList } from "./presentation-board-list";

export const dynamic = "force-dynamic";

export default async function PresentationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, boards] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.presentation.listBoards({ grants, projectId }),
  ]);
  const canEdit = hasPermission(grants, STUDIOFLOW_PERMISSIONS.presentationManage) && project.archivedAt === null;
  return (
    <SectionCard title="Presentation" description="Render images and their project notes." count={boards.length}>
      <PresentationBoardList projectId={projectId} boards={boards} canEdit={canEdit} />
    </SectionCard>
  );
}
