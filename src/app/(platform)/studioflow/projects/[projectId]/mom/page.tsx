import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { pageProjectAccess, pageSession } from "../../../_components/session";
import { ReadOnlyNotice } from "../../../_components/read-only-notice";
import { MomDocumentList } from "./mom-document-list";

export const dynamic = "force-dynamic";

export default async function ProjectMomPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, documents, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.mom.listDocuments({ grants, projectId }),
    pageProjectAccess(projectId),
  ]);
  const canEdit = studioFlow.mom.canManage(grants) && project.archivedAt === null && access.canEditDocuments;
  return (
    <>
    {project.archivedAt === null && !access.canEditDocuments ? <ReadOnlyNotice scope="project" className="mb-3" /> : null}
    <SectionCard title="MOM" description="Minutes of meeting and site reports, newest first." count={documents.length} padded={false}>
      <MomDocumentList projectId={projectId} documents={documents} canEdit={canEdit} />
    </SectionCard>
    </>
  );
}
