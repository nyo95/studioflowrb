import Link from "next/link";

import { hasPermission } from "@platform/core/rbac";
import { formatDateOnly } from "@platform/utilities/date";
import {
  phaseAccentDotClass,
  phaseStatusDisplay,
} from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, DescriptionItem, DescriptionList, SectionCard, Text } from "@/platform/ui_engine";

import { ChecklistTree } from "../../_components/checklist-tree";
import { PhaseStatusBadge } from "../../_components/phase-status";
import { pageSession } from "../../_components/session";
import { InlinePhaseAction } from "./inline-phase-action";

export const dynamic = "force-dynamic";

/** V2-D9: Overview is the main workspace. Phase cards with inline actions. */
export default async function ProjectOverviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const [project, phases, generalChecklist, people] = await Promise.all([
    studioFlow.projects.getProject({ grants, projectId }),
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.tasks.listChecklist({ grants, projectId, phaseId: null }),
    studioFlow.projects.listAssignablePeople({ grants }),
  ]);
  const archived = project.archivedAt !== null;
  const caps = studioFlow.phases.capabilities(grants);

  return (
    <div className="grid gap-6">
      {/* ── Phase cards (V2-D9 main workspace) ──────────────────────────── */}
      <div className="grid gap-3">
        {phases.map((phase) => {
          const primaryCommand = phase.commands[0] ?? null;
          const isBlocked = phase.blockers.total > 0 && !phase.isLocked;
          const accentClass = phaseAccentDotClass(phase.key);
          const display = phaseStatusDisplay(phase.status);

          return (
            <SectionCard key={phase.id} padded={false}>
              <div className="flex flex-wrap items-start gap-4 p-4">
                {/* Phase identity */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={`size-2.5 rounded-full flex-none ${accentClass}`} />
                  <div className="grid gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id)}
                        className="font-medium text-foreground hover:underline underline-offset-2"
                      >
                        {phase.label}
                      </Link>
                      <PhaseStatusBadge
                        status={phase.status}
                        waitingDays={phase.status === "PENDING" ? null : phase.waitingDays}
                      />
                      {phase.activeRevision ? (
                        <Badge title="Active revision">{phase.activeRevision}</Badge>
                      ) : null}
                      {phase.isLocked ? <Badge tone="success">Locked</Badge> : null}
                      {phase.seat === "drafter" ? (
                        <Text size="xs" tone="secondary" meta>drafter</Text>
                      ) : null}
                    </div>

                    {/* Blockers or next step */}
                    {phase.startBlockedReason ? (
                      <Text size="sm" tone="secondary">{phase.startBlockedReason}</Text>
                    ) : isBlocked ? (
                      <Text size="sm" tone="warning">
                        Waiting on: {phase.blockers.reasons.join(", ")}
                      </Text>
                    ) : phase.openRootChecklist > 0 ? (
                      <Text size="sm" tone="secondary">
                        {phase.openRootChecklist} checklist item{phase.openRootChecklist === 1 ? "" : "s"} open
                      </Text>
                    ) : null}
                  </div>
                </div>

                {/* Inline primary action (V2-D9) */}
                {!archived && primaryCommand ? (
                  <InlinePhaseAction
                    projectId={projectId}
                    phaseId={phase.id}
                    command={primaryCommand}
                    commands={phase.commands}
                    blockers={phase.blockers}
                    todoBlockers={phase.todoBlockers}
                    canWork={caps.work}
                    canReview={caps.review}
                    canOverride={caps.override}
                    activeRevision={phase.activeRevision}
                  />
                ) : null}
              </div>

              {/* Phase-level checklist summary (open root items) */}
              {phase.openRootChecklist > 0 && phase.status !== "PENDING" && phase.status !== "COMPLETED" && phase.status !== "READY_FOR_NEXT" ? (
                <div className="border-t border-line-subtle px-4 py-2">
                  <Text size="xs" tone="secondary" meta>
                    <Link
                      href={STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id)}
                      className="hover:underline underline-offset-2"
                    >
                      View phase checklist →
                    </Link>
                  </Text>
                </div>
              ) : null}
            </SectionCard>
          );
        })}
      </div>

      {/* ── General todos (SfChecklistItem with phase_id null) ─────────────── */}
      <SectionCard
        title="General to-dos"
        description="Project-wide work items not tied to any phase."
      >
        <ChecklistTree
          projectId={projectId}
          nodes={generalChecklist}
          people={people}
          canEdit={!archived && hasPermission(grants, P.taskManage)}
          emptyText="No general to-dos"
        />
      </SectionCard>

      {/* ── Project details ─────────────────────────────────────────────── */}
      <SectionCard title="Details">
        <DescriptionList>
          <DescriptionItem label="Number">{project.code}</DescriptionItem>
          <DescriptionItem label="Type">{project.projectType}</DescriptionItem>
          <DescriptionItem label="Opening date">
            {project.openingDate ? formatDateOnly(project.openingDate) : "—"}
          </DescriptionItem>
          <DescriptionItem label="Area">{project.area ? `${project.area} m²` : "—"}</DescriptionItem>
          <DescriptionItem label="Client contact">{project.clientContact ?? "—"}</DescriptionItem>
          <DescriptionItem label="Site address">{project.address ?? "—"}</DescriptionItem>
        </DescriptionList>
      </SectionCard>
    </div>
  );
}
