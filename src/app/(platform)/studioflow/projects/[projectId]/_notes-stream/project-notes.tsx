import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";

import { CdList } from "../../../_components/cd-list";
import { pageProjectAccess, pageSession } from "../../../_components/session";
import { NotesStream } from "./notes-stream";

/**
 * The Phases page without the Workspace board module (owner 2026-10-14): the selected phase's notes as one message
 * stream. Writing follows the phase's rule, exactly as the board's phase-labelled elements do.
 */
export async function ProjectNotes({ projectId, projectName, selectedPhaseId, people, archived, status }: {
  projectId: string;
  projectName: string;
  selectedPhaseId: string | null;
  people: Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>;
  archived: boolean;
  status: string;
}) {
  if (!selectedPhaseId) return null;
  const { grants } = await pageSession();
  const [detail, access, phaseList] = await Promise.all([
    studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId: selectedPhaseId }),
    pageProjectAccess(projectId),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
  ]);
  const caps = studioFlow.phases.capabilities(grants);
  const phaseAccess = access.phases.find((item) => item.phaseId === detail.id);
  const canEdit = !archived && status === "ACTIVE" && caps.work && (phaseAccess?.canTransition ?? false);
  // A drafter phase's Drawing list, which the board offers as its second lens, sits above the notes here.
  const drafter = phaseList.find((phase) => phase.id === detail.id)?.seat === "drafter";
  const drawings = drafter ? await studioFlow.cdList.list({ grants, projectId, phaseId: detail.id }) : null;
  return (
    <>
      {drawings ? (
        <SectionCard title="Drawing list" description="The drawings this phase needs. Tick them off as they are drawn; it never blocks a step.">
          <CdList projectId={projectId} phaseId={detail.id} items={drawings} people={people} canEdit={detail.modifiable && caps.work && (phaseAccess?.canEditContent ?? false)} />
        </SectionCard>
      ) : null}
      {!canEdit && !archived && status === "ACTIVE" ? <SectionCard padded><Text size="sm" tone="secondary">You can read this phase&apos;s notes. Only the phase&apos;s designer or drafter can write them.</Text></SectionCard> : null}
      <NotesStream
        projectId={projectId}
        projectName={projectName}
        phaseId={detail.id}
        phaseName={detail.label}
        canEdit={canEdit}
        canUseIdeas={hasPermission(grants, P.ideasManage)}
        notes={detail.notes.map((note) => ({
          id: note.id,
          body: note.body,
          starred: note.starred,
          clientFeedback: note.clientFeedback,
          origin: note.origin,
          workflowRecord: note.workflowRecord,
          authorName: note.authorName,
          createdAt: note.createdAt,
          editedAt: note.editedAt,
          iterationId: note.iterationId,
          iterationLabel: note.iterationLabel,
          kind: note.kind,
          images: note.images,
          file: note.file,
        }))}
      />
    </>
  );
}
