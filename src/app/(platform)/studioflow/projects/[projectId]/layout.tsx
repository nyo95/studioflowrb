import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, Breadcrumb, ContextNavHeading, MetaList, Notice, PageHeader, SettingsShell } from "@/platform/ui_engine";

import { pageSession } from "../../_components/session";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from "../../_components/phase-status";
import { ProjectNavLinks } from "./project-nav-links";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  const project = await studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  });
  const [momDocuments, scheduleEntries] = await Promise.all([
    studioFlow.mom.listDocuments({ grants, projectId }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
  ]);
  const momCount = momDocuments.length;
  const scheduleCount = scheduleEntries.length;

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
            <ContextNavHeading>Records</ContextNavHeading>
            <ProjectNavLinks items={[
              { href: STUDIOFLOW_ROUTES.projectMom(projectId), label: "MOM", marker: null, detail: momCount > 0 ? String(momCount) : null },
              { href: STUDIOFLOW_ROUTES.projectSchedule(projectId), label: "Schedule", marker: null, detail: scheduleCount > 0 ? String(scheduleCount) : null },
              { href: STUDIOFLOW_ROUTES.projectHistory(projectId), label: "History", marker: null, detail: null },
            ]} />
          </>
        }
      >
        {children}
      </SettingsShell>
    </div>
  );
}
