import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard } from "@/platform/ui_engine";

import { CdList } from "../../../_components/cd-list";
import { pageProjectAccess, pageSession } from "../../../_components/session";
import { NotesChat } from "./notes-chat";

/**
 * The Phases page without the Workspace board module (owner 2026-10-14): the project's notes as one chat, every phase
 * in one stream. The selected phase is the composer's default tag; writing follows each phase's rule, exactly as the
 * board's phase-labelled elements do.
 */
export async function ProjectNotes({ projectId, projectName, selectedPhaseId, people, archived, status }: {
  projectId: string;
  projectName: string;
  selectedPhaseId: string | null;
  people: Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>;
  archived: boolean;
  status: string;
}) {
  const { grants } = await pageSession();
  const [access, phaseList, initial] = await Promise.all([
    pageProjectAccess(projectId),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.workspace.listProjectNotes({ grants, projectId, limit: 100 }),
  ]);
  const caps = studioFlow.phases.capabilities(grants);
  const open = !archived && status === "ACTIVE" && caps.work;
  const writablePhaseIds = open ? access.phases.filter((phase) => phase.canTransition).map((phase) => phase.phaseId) : [];
  // A drafter phase's Drawing list, which the board offers as its second lens, sits above the notes here.
  const selected = phaseList.find((phase) => phase.id === selectedPhaseId) ?? null;
  const drawings = selected?.seat === "drafter" ? await studioFlow.cdList.list({ grants, projectId, phaseId: selected.id }) : null;
  const canEditDrawings = Boolean(selected && open && access.phases.find((phase) => phase.phaseId === selected.id)?.canEditContent);
  return (
    <>
      {drawings && selected ? (
        // Above the chat in the window-tall Phases column: it keeps its size (a shrinking card clipped to its title and
        // hid the add row) and a long list scrolls inside it.
        <SectionCard className="shrink-0" title="Drawing list" description="The drawings this phase needs. Tick them off as they are drawn; it never blocks a step.">
          <div className="max-h-[40vh] overflow-y-auto">
            <CdList projectId={projectId} phaseId={selected.id} items={drawings} people={people} canEdit={canEditDrawings} />
          </div>
        </SectionCard>
      ) : null}
      {/* The chat keeps its own scroll: the newest message and the composer stay in view (DESIGN.md §6.2). */}
      <div className="flex min-h-[28rem] flex-1 flex-col">
        <NotesChat
          key={projectId}
          projectId={projectId}
          projectName={projectName}
          phases={phaseList.map((phase) => ({ id: phase.id, label: phase.label, iteration: phase.iterationShortName ?? null }))}
          writablePhaseIds={writablePhaseIds}
          canEditGeneral={open && access.canEditDocuments}
          defaultPhaseId={selectedPhaseId}
          initial={initial}
          canUseIdeas={hasPermission(grants, P.ideasManage)}
          canUsePresentation={hasPermission(grants, P.presentationManage)}
        />
      </div>
    </>
  );
}
