import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { pageSession } from "../../../_components/session";
import { MomDocumentList } from "./mom-document-list";

export const dynamic = "force-dynamic";

export default async function ProjectMomPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, documents] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.mom.listDocuments({ grants, projectId }),
  ]);
  const canEdit = studioFlow.mom.canManage(grants) && project.archivedAt === null;
  return (
    <SectionCard title="MOM" description="Minutes of meeting and site reports, newest first." count={documents.length} padded={false}>
      <MomDocumentList projectId={projectId} documents={documents} canEdit={canEdit} />
    </SectionCard>
  );
}
