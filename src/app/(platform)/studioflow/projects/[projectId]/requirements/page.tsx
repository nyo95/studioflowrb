import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";

import { pageProjectAccess, pageSession } from "../../../_components/session";
import { RequirementList, type RequirementNode } from "./requirement-list";

export const dynamic = "force-dynamic";

/**
 * Requirements: the whole checklist of one project in one place — the general list first, then each
 * phase's own list. Reminders only: nothing here stops a phase or the project from being completed.
 */
export default async function ProjectRequirementsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, phases, items, access] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.tasks.listChecklist({ grants, projectId }),
    pageProjectAccess(projectId),
  ]);

  const open = project.archivedAt === null && !access.completed;
  const canTick = open && (access.override || access.isDesigner || access.isDrafter);
  const canEdit = canTick && hasPermission(grants, P.taskManage);
  const nodes = (rows: typeof items): RequirementNode[] => rows.map((item) => ({
    id: item.id,
    label: item.label,
    isChecked: item.isChecked,
    children: item.children.map((child) => ({ id: child.id, label: child.label, isChecked: child.isChecked })),
  }));
  const general = items.filter((item) => item.phaseId === null);
  const byPhase = phases
    .map((phase) => ({ phase, rows: items.filter((item) => item.phaseId === phase.id) }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Requirements"
        description="The checklist of this project. Reminders only: they never stop a step or completing the project, and stay here until ticked or dismissed."
        padded
      >
        <RequirementList projectId={projectId} phaseId={null} nodes={nodes(general)} canTick={canTick} canEdit={canEdit} emptyText="No general requirements yet. They come from the templates in Settings." />
      </SectionCard>
      {byPhase.map(({ phase, rows }) => (
        <SectionCard key={phase.id} title={phase.label} padded>
          <RequirementList projectId={projectId} phaseId={phase.id} nodes={nodes(rows)} canTick={canTick} canEdit={canEdit} emptyText="" />
        </SectionCard>
      ))}
      {!open ? <Text tone="secondary" size="sm">This project is read-only, so requirements cannot be changed.</Text> : null}
    </div>
  );
}
