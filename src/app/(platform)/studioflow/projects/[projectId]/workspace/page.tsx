import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";

import { pageProjectAccess, pageSession } from "../../../_components/session";
import { WorkspaceBoard } from "./workspace-board";

export const dynamic = "force-dynamic";

function orNotFound(error: unknown): never {
  if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
  throw error;
}

/**
 * The project Workspace (WO-SF-WORKSPACE-01): one board of free-topic sections holding cards. A card's phase and
 * round are labels; the write rights below mirror the service gates so the screen never offers a refused change.
 */
export default async function ProjectWorkspacePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ phase?: string }> }) {
  const { projectId } = await params;
  const { phase } = await searchParams;
  const { grants } = await pageSession();
  const [project, sections, phases, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch(orNotFound),
    studioFlow.workspace.readWorkspace({ grants, projectId, phaseId: phase || null }).catch(orNotFound),
    studioFlow.workspace.listWorkspacePhaseLabels({ grants, projectId }),
    pageProjectAccess(projectId),
  ]);
  const writable = project.archivedAt === null && project.status === "ACTIVE" && hasPermission(grants, P.phaseWork);
  const phaseFilter = phases.some((item) => item.id === phase) ? phase! : null;
  return (
    <WorkspaceBoard
      projectId={projectId}
      phases={phases}
      phaseFilter={phaseFilter}
      readOnlyReason={writable ? null : project.archivedAt !== null ? "archived" : project.status !== "ACTIVE" ? "inactive" : "permission"}
      canEditGeneral={writable && access.canEditDocuments}
      writablePhaseIds={writable ? access.phases.filter((item) => item.canTransition).map((item) => item.phaseId) : []}
      canUseIdeas={hasPermission(grants, P.ideasManage)}
      sections={sections.map((section) => ({
        id: section.id,
        title: section.title,
        version: section.version,
        isDefault: section.isDefault,
        cards: section.cards.map((card) => ({
          id: card.id,
          version: card.version,
          body: card.body,
          pinned: card.pinned,
          origin: card.origin,
          phaseId: card.phaseId,
          phaseName: card.phaseName,
          iterationLabel: card.iterationLabel,
          authorName: card.authorName,
          createdAt: card.createdAt,
          editedAt: card.editedAt,
          images: card.images,
        })),
      }))}
    />
  );
}
