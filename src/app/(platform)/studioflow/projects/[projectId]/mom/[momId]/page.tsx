import { notFound, redirect } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { studioFlow } from "@/apps/studioflow/runtime";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";

import { canSeeProjectWorkSections, pageProjectAccess, pageSession } from "../../../../_components/session";
import { MomEditor } from "./mom-editor";

export const dynamic = "force-dynamic";

export default async function MomDocumentPage({ params }: { params: Promise<{ projectId: string; momId: string }> }) {
  const { projectId, momId } = await params;
  const { grants, userId } = await pageSession();
  const access = await pageProjectAccess(projectId);
  if (!canSeeProjectWorkSections(access)) redirect(STUDIOFLOW_ROUTES.projectSchedule(projectId));
  const [project, document] = await Promise.all([
    studioFlow.projects.getProject({ grants, actorId: userId, projectId }),
    studioFlow.mom.getDocument({ grants, projectId, documentId: momId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
  ]);
  const canEdit = studioFlow.mom.canManage(grants) && project.archivedAt === null && access.canEditDocuments;
  return <MomEditor key={document.id} projectId={projectId} document={document} canEdit={canEdit} />;
}
