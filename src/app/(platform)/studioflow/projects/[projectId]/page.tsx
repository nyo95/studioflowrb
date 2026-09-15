import { hasPermission } from "@platform/core/rbac";
import { formatDateOnly } from "@platform/utilities/date";
import { PHASE_COMMAND_LABELS, availablePhaseCommands, phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { DescriptionItem, DescriptionList, PipelineStrip, SectionCard, Text, type PipelineStepState } from "@/platform/ui_engine";

import { ActivityList } from "../../_components/activity-list";
import { ChecklistTree } from "../../_components/checklist-tree";
import { pageSession } from "../../_components/session";

export const dynamic = "force-dynamic";

function stepState(status: PhaseStatus): PipelineStepState {
  const group = phaseStatusDisplay(status).group;
  if (group === "Approved" || group === "Done") return "done";
  if (group === "Not started") return "upcoming";
  return "current";
}

export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, phases, general, checklist, people] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.phases.listGeneralActivities({ grants, projectId }),
    studioFlow.tasks.listChecklist({ grants, projectId, phaseId: null }),
    studioFlow.projects.listAssignablePeople({ grants }),
  ]);
  const archived = project.archivedAt !== null;
  const working = phases.filter((p) => phaseStatusDisplay(p.status).group === "Working" || phaseStatusDisplay(p.status).group === "In review");
  const nextUp = phases.find((p) => p.status === "PENDING" && !p.startBlockedReason);

  return (
    <div className="grid gap-4">
      <SectionCard title="Phases" description="Current phase, what it waits on, and the next step." padded={false}>
        <PipelineStrip
          label="Project phases"
          steps={phases.map((phase) => ({
            id: phase.id,
            href: STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id),
            label: phase.label,
            state: stepState(phase.status),
            note: [phase.startBlockedReason ? "Waits for previous phase" : phaseStatusDisplay(phase.status).label, phase.waitingDays ? `${phase.waitingDays}d` : null, phase.seat === "drafter" ? "drafter" : null].filter(Boolean).join(" · "),
            detail: phase.activeRevision ?? (phase.blockers.total > 0 ? `${phase.blockers.total} open` : undefined),
          }))}
        />
        <div className="grid gap-1 px-4 py-3">
          {working.length > 0 ? working.map((phase) => {
            const [primary] = availablePhaseCommands({ key: phase.key, status: phase.status, isLocked: phase.isLocked });
            return (
              <Text key={phase.id} size="sm">
                <strong>{phase.label}</strong> is {phaseStatusDisplay(phase.status).label.toLowerCase()}
                {phase.waitingDays ? ` for ${phase.waitingDays} day(s)` : ""}.{" "}
                {phase.blockers.total > 0 ? `Waiting on ${phase.blockers.reasons.join(", ")}.` : primary ? `Next: ${PHASE_COMMAND_LABELS[primary]}.` : ""}
              </Text>
            );
          }) : <Text size="sm" tone="secondary">{nextUp ? `No phase is running. ${nextUp.label} can start now.` : "No phase is running."}</Text>}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <SectionCard title="General to-dos" description="Project-wide work that is not tied to a phase.">
          <ActivityList
            projectId={projectId}
            phaseId={null}
            items={general}
            people={people}
            canEdit={!archived && hasPermission(grants, P.phaseWork)}
            allowFeedback={false}
            allowDefer={false}
            emptyText="No general to-dos"
          />
        </SectionCard>
        <SectionCard title="General checklist" description="Studio-wide requirements for every project.">
          <ChecklistTree projectId={projectId} nodes={checklist} people={people} canEdit={!archived && hasPermission(grants, P.taskManage)} emptyText="No general checklist items" />
        </SectionCard>
      </div>

      <SectionCard title="Details">
        <DescriptionList>
          <DescriptionItem label="Number">{project.code}</DescriptionItem>
          <DescriptionItem label="Type">{project.projectType}</DescriptionItem>
          <DescriptionItem label="Opening date">{project.openingDate ? formatDateOnly(project.openingDate) : "—"}</DescriptionItem>
          <DescriptionItem label="Area">{project.area ? `${project.area} m²` : "—"}</DescriptionItem>
          <DescriptionItem label="Client contact">{project.clientContact ?? "—"}</DescriptionItem>
          <DescriptionItem label="Site address">{project.address ?? "—"}</DescriptionItem>
        </DescriptionList>
      </SectionCard>
    </div>
  );
}
