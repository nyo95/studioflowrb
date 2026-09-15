import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { hasPermission } from "@platform/core/rbac";
import { phaseStatusDisplay } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_PERMISSIONS as P, STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, Breadcrumb, ContextNavHeading, MetaList, Notice, PageHeader, SettingsShell } from "@/platform/ui_engine";

import { pageSession } from "../../_components/session";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from "../../_components/phase-status";
import { ProjectNavLinks } from "./project-nav-links";
import { ProjectHeaderActions } from "./project-header-actions";

export const dynamic = "force-dynamic";

const DOT: Record<string, string> = { neutral: "bg-line-strong", warning: "bg-warning", success: "bg-success", danger: "bg-danger" };

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const project = await studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  });
  const [phases, people, clients] = await Promise.all([
    studioFlow.phases.listProjectPhases({ grants, projectId }),
    studioFlow.projects.listAssignablePeople({ grants }),
    studioFlow.projects.listClients({ grants }),
  ]);
  const canManage = hasPermission(grants, P.projectManage);

  const phaseNav = phases.map((phase) => ({
      href: STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id),
      label: phase.label,
      marker: DOT[phaseStatusDisplay(phase.status).tone],
      detail: phase.openRootChecklist > 0 ? String(phase.openRootChecklist) : null,
      title: `${phase.label}: ${phaseStatusDisplay(phase.status).label}${phase.openRootChecklist ? ` · ${phase.openRootChecklist} checklist item(s) open` : ""}`,
  }));

  return (
    <div className="grid gap-4">
      <Breadcrumb entries={[{ label: "Projects", href: STUDIOFLOW_ROUTES.projects }, { label: project.name }]} />
      <PageHeader
        title={project.name}
        meta={
          <MetaList
            items={[
              project.client ? <Link key="c" prefetch={false} href={STUDIOFLOW_ROUTES.client(project.client.id)} className="hover:underline">{project.client.name}</Link> : "No client",
              `Designer ${project.designer.displayName}`,
              `Drafter ${project.drafter.displayName}`,
              <span key="s">{PROJECT_STATUS_LABEL[project.status]}</span>,
              project.priority !== "NORMAL" ? <Badge key="p" tone={project.priority === "URGENT" ? "danger" : "neutral"}>{PRIORITY_LABEL[project.priority]}</Badge> : null,
            ]}
          />
        }
        actions={canManage ? <ProjectHeaderActions project={project} people={people} clients={clients.map((c) => ({ id: c.id, name: c.name }))} /> : undefined}
        divider
      />
      {project.archivedAt ? (
        <Notice tone="warning" title="Archived">
          This project is read-only. {project.archiveReason ? `Reason: ${project.archiveReason}` : ""}
        </Notice>
      ) : null}
      <SettingsShell
        navigationLabel="Project navigation"
        navigation={
          <>
            <ContextNavHeading>Project</ContextNavHeading>
            <ProjectNavLinks items={[{ href: STUDIOFLOW_ROUTES.project(projectId), label: "Overview", exact: true, marker: null, detail: null }]} />
            <ContextNavHeading>Phases</ContextNavHeading>
            <ProjectNavLinks items={phaseNav} />
            <ContextNavHeading>Records</ContextNavHeading>
            <ProjectNavLinks items={[{ href: STUDIOFLOW_ROUTES.projectHistory(projectId), label: "History", marker: null, detail: null }]} />
          </>
        }
      >
        {children}
      </SettingsShell>
    </div>
  );
}
