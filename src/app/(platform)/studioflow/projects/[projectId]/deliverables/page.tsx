import { redirect } from "next/navigation";

import { hasPermission } from "@platform/core/rbac";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { SectionCard, Text } from "@/platform/ui_engine";

import { canSeeProjectWorkSections, pageProjectAccess, pageSession } from "../../../_components/session";
import { DeliverablesPanel } from "../phases/[phaseId]/deliverables-panel";

export const dynamic = "force-dynamic";

export default async function ProjectDeliverablesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [access, phases] = await Promise.all([
    pageProjectAccess(projectId),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
  ]);
  if (!canSeeProjectWorkSections(access)) redirect(STUDIOFLOW_ROUTES.projectSchedule(projectId));

  const caps = studioFlow.phases.capabilities(grants);
  const canManage = hasPermission(grants, P.projectManage) && access.canEditProject;
  const rows = await Promise.all(phases.map(async (phase) => {
    const [detail, result] = await Promise.all([
      studioFlow.phases.getPhaseDetail({ grants, projectId, phaseId: phase.id }),
      studioFlow.phases.listDeliverables({ grants, projectId, phaseId: phase.id }),
    ]);
    const phaseAccess = access.phases.find((item) => item.phaseId === phase.id);
    return {
      phase,
      deliverables: result,
      canWork: detail.modifiable && caps.work && (phaseAccess?.canEditContent ?? false),
    };
  }));

  const fileCount = rows.reduce((total, row) => total + row.deliverables.items.length, 0);
  return (
    <SectionCard title="Deliverables" count={fileCount} description="Current private file for each project phase. Uploading a new file replaces that phase's prior file.">
      <div className="grid gap-4">
        {rows.map(({ phase, deliverables, canWork }) => (
          <DeliverablesPanel
            key={phase.id}
            projectId={projectId}
            phaseId={phase.id}
            deliverables={deliverables.items}
            status={deliverables.status}
            canWork={canWork}
            canManage={canManage}
            title={phase.label}
            description="One current private file for this phase."
          />
        ))}
        {rows.length === 0 ? <Text tone="secondary" size="sm">No phases are available for this project.</Text> : null}
      </div>
    </SectionCard>
  );
}
