import { notFound } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { AppError } from "@platform/core/errors";
import { isModuleEnabled } from "@platform/core/modules";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { studioFlowPresentationBridge } from "@/apps/studioflow/public/presentation-bridge-runtime";
import { presentation } from "@/apps/presentation/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { PresentationBoardList } from "@/apps/presentation/ui/presentation-board-list";

export const dynamic = "force-dynamic";

export default async function PresentationPage({ params }: { params: Promise<{ projectId: string }> }) {
  if (!(await isModuleEnabled("presentation"))) notFound();
  const { projectId } = await params;
  const { principal, grants } = await requirePrincipalGrants();
  const [project, boards] = await Promise.all([
    studioFlowPresentationBridge.readProjectDocumentContext({ grants, actorId: principal.userId, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    presentation.listBoards({ grants, actorId: principal.userId, projectId }),
  ]);
  const canEdit = hasPermission(grants, STUDIOFLOW_PERMISSIONS.presentationManage) && project.archivedAt === null && project.access.canEditDocuments;
  return (
    <SectionCard title="Presentation" description="Render images and their project notes." count={boards.length}>
      <PresentationBoardList projectId={projectId} boards={boards} canEdit={canEdit} />
    </SectionCard>
  );
}
