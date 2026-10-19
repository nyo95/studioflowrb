import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { CdList } from "../../_components/cd-list";
import { pageProjectAccess, pageSession } from "../../_components/session";

/** Construction Drawing has its own operational surface: Drafter writes, Designer and managers inspect. */
export async function ConstructionDrawingWorkspace({ projectId, phaseId, archived, status }: {
  projectId: string;
  phaseId: string;
  archived: boolean;
  status: string;
}) {
  const { grants, userId } = await pageSession();
  const [items, people, detail, access] = await Promise.all([
    studioFlow.cdList.list({ grants, actorId: userId, projectId, phaseId }),
    studioFlow.projects.listAssignablePeople({ grants, seat: "drafter" }),
    studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId }),
    pageProjectAccess(projectId),
  ]);
  const canEdit = !archived
    && status === "ACTIVE"
    && detail.modifiable
    && studioFlow.phases.capabilities(grants).work
    && access.isDrafter;

  return (
    <SectionCard
      className="min-h-[28rem] flex-1"
      title="Construction Drawing list"
      description={canEdit
        ? "Manage the drawings required for this phase. The list is informational and does not block phase approval."
        : "Read-only drawing register. Only the assigned Drafter can change this list."}
    >
      <CdList projectId={projectId} phaseId={phaseId} items={items} people={people} canEdit={canEdit} />
    </SectionCard>
  );
}
