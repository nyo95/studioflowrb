import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { studioFlow } from "@/apps/studioflow/runtime";

import { pageProjectAccess, pageSession } from "../../../_components/session";
import { WorkspaceBoard } from "./workspace-board";

export const dynamic = "force-dynamic";

/** Minimal functional Workspace (WO-SF-WORKSPACE-01 backend slice); the Lead's next revision replaces this screen. */
export default async function ProjectWorkspacePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ phase?: string }> }) {
  const { projectId } = await params;
  const { phase } = await searchParams;
  const { grants } = await pageSession();
  const [sections, phases, access] = await Promise.all([
    studioFlow.workspace.readWorkspace({ grants, projectId, phaseId: phase || null }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.workspace.listWorkspacePhaseLabels({ grants, projectId }),
    pageProjectAccess(projectId),
  ]);
  return (
    <WorkspaceBoard
      projectId={projectId}
      phases={phases}
      phaseFilter={phase || null}
      canEdit={access.canEditDocuments}
      sections={sections.map((section) => ({
        id: section.id, title: section.title, version: section.version,
        cards: section.cards.map((card) => ({ id: card.id, version: card.version, body: card.body, pinned: card.pinned, origin: card.origin, phaseId: card.phaseId, phaseName: card.phaseName, iterationLabel: card.iterationLabel, authorName: card.authorName, imageCount: card.images.length })),
      }))}
    />
  );
}
