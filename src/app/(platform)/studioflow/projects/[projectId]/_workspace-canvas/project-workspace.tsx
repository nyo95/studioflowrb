import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { CdList } from "../../../_components/cd-list";
import { pageProjectAccess, pageSession } from "../../../_components/session";
import { WorkspaceCanvas } from "./canvas";

type PersonItem = Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>[number];

/**
 * The project Workspace on the Phases page (board-first, owner 2026-10-13): one canvas for the whole project.
 * Choosing a phase above changes only the workflow controls and the label new cards get; the canvas still shows
 * every card. On a drafter phase the Drawing list is offered as a second lens of the same area.
 * The write rights mirror the service gates so the screen never offers a refused change.
 */
export async function ProjectWorkspace({ projectId, projectName, selectedPhaseId, people, archived, status }: {
  projectId: string;
  projectName: string;
  selectedPhaseId: string | null;
  people: PersonItem[];
  archived: boolean;
  status: string;
}) {
  const { grants } = await pageSession();
  const [elements, phases, access, phaseList] = await Promise.all([
    studioFlow.workspace.readWorkspace({ grants, projectId }),
    studioFlow.workspace.listWorkspacePhaseLabels({ grants, projectId }),
    pageProjectAccess(projectId),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
  ]);
  const caps = studioFlow.phases.capabilities(grants);
  const writable = !archived && status === "ACTIVE" && caps.work;
  const selected = phaseList.find((phase) => phase.id === selectedPhaseId) ?? null;

  let drawingList = null;
  if (selected?.seat === "drafter") {
    const [detail, items] = await Promise.all([
      studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId: selected.id }),
      studioFlow.cdList.list({ grants, projectId, phaseId: selected.id }),
    ]);
    const canContent = access.phases.find((item) => item.phaseId === selected.id)?.canEditContent ?? false;
    drawingList = (
      <SectionCard title="Drawing list" description="The drawings this phase needs. Tick them off as they are drawn; it never blocks a step.">
        <CdList projectId={projectId} phaseId={selected.id} items={items} people={people} canEdit={detail.modifiable && caps.work && canContent} />
      </SectionCard>
    );
  }

  return (
    <WorkspaceCanvas
      projectId={projectId}
      projectName={projectName}
      phases={phases}
      selectedPhase={selected ? { id: selected.id, name: selected.label } : null}
      readOnlyReason={writable ? null : archived ? "archived" : status !== "ACTIVE" ? "inactive" : "permission"}
      canEditGeneral={writable && access.canEditDocuments}
      writablePhaseIds={writable ? access.phases.filter((item) => item.canTransition).map((item) => item.phaseId) : []}
      canUseIdeas={hasPermission(grants, P.ideasManage)}
      canUsePresentation={hasPermission(grants, P.presentationManage)}
      drawingList={drawingList}
      elements={elements.map((card) => ({
        id: card.id,
        version: card.version,
        body: card.body,
        pinned: card.pinned,
        origin: card.origin,
        workflowRecord: card.workflowRecord,
        phaseId: card.phaseId,
        phaseName: card.phaseName,
        iterationId: card.iterationId,
        iterationLabel: card.iterationLabel,
        authorName: card.authorName,
        createdAt: card.createdAt,
        editedAt: card.editedAt,
        images: card.images,
        kind: card.kind,
        textStyle: card.textStyle,
        file: card.file,
        canvas: card.canvas,
      }))}
    />
  );
}
