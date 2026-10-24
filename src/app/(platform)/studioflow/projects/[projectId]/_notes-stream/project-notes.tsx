import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { canUseNoteImageInSchedule, pageProjectAccess, pageSession } from "../../../_components/session";
import { BookAccessBar } from "./book-access-bar";
import { NotesChat } from "./notes-chat";
import styles from "../phase-layout.module.css";

/**
 * The Phases page without the Workspace board module (owner 2026-10-14): the project's notes as one chat, every phase
 * in one stream. The selected phase is the composer's default tag; writing follows each phase's rule, exactly as the
 * board's phase-labelled elements do.
 */
export async function ProjectNotes({ projectId, projectName, team, selectedPhaseId, people, archived, status }: {
  projectId: string;
  projectName: string;
  /** The PICs, who always read the book. */
  team: { designer: { id: string; displayName: string }; drafter: { id: string; displayName: string } };
  selectedPhaseId: string | null;
  people: Awaited<ReturnType<typeof studioFlow.projects.listAssignablePeople>>;
  archived: boolean;
  status: string;
}) {
  const { grants, userId } = await pageSession();
  const [access, phaseList, initial] = await Promise.all([
    pageProjectAccess(projectId),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.workspace.listProjectNotes({ grants, actorId: userId, projectId, limit: 100 }),
  ]);
  // Only a book reader learns who else is in the book (WO-SF-BOOK-01).
  const members = access.canReadBook ? await studioFlow.workspace.listBookMembers({ grants, actorId: userId, projectId }) : [];
  const inBook = new Set([team.designer.id, team.drafter.id, ...members.map((member) => member.userId)]);
  const caps = studioFlow.phases.capabilities(grants);
  const open = !archived && status === "ACTIVE" && caps.work;
  const writablePhaseIds = open ? access.phases.filter((phase) => phase.canTransition).map((phase) => phase.phaseId) : [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <BookAccessBar
        projectId={projectId}
        designer={team.designer.displayName}
        drafter={team.drafter.displayName}
        members={members.map((member) => ({ userId: member.userId, displayName: member.displayName, active: member.active }))}
        candidates={people.filter((person) => !inBook.has(person.id)).map((person) => ({ id: person.id, displayName: person.displayName }))}
        canRead={access.canReadBook}
        canManage={!archived && (access.isDesigner || access.isDrafter)}
      />
      <div className={`${styles.notesLayout} flex min-h-0 flex-1 flex-col gap-4`}>
        {/* The chat keeps its own scroll: the newest message and the composer stay in view (DESIGN.md §6.2). */}
        <div className="flex min-h-[28rem] flex-1 flex-col xl:min-h-0">
          <NotesChat
            key={projectId}
            projectId={projectId}
            projectName={projectName}
            currentUserId={userId}
            phases={phaseList.map((phase) => ({ id: phase.id, label: phase.label, iteration: phase.iterationShortName ?? null }))}
            writablePhaseIds={writablePhaseIds}
            canEditGeneral={open && access.canEditDocuments}
            defaultPhaseId={selectedPhaseId}
            initial={initial}
            canUseIdeas={hasPermission(grants, P.ideasManage)}
            canUsePresentation={hasPermission(grants, P.presentationManage)}
            canUseInSchedule={canUseNoteImageInSchedule(access, grants)}
            composer={access.canReadBook}
          />
        </div>
      </div>
    </div>
  );
}
