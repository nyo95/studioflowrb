import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Breadcrumb, MetaList, Notice, PageHeader, PageShell } from "@/platform/ui_engine";

import { ArchivedFilesNote } from "../../_components/archived-files-note";
import { pageProjectAccess, pageSession } from "../../_components/session";
import { ReopenProjectButton } from "../../_components/reopen-project-button";
import { ProjectNavLinks, type ProjectNavItem } from "./project-nav-links";

export const dynamic = "force-dynamic";

function navigation(projectId: string, counts?: { mom: number; schedule: number; presentation: number }): ProjectNavItem[] {
  return [
    { href: STUDIOFLOW_ROUTES.project(projectId), label: "Phases", exact: true, detail: null },
    { href: STUDIOFLOW_ROUTES.projectMom(projectId), label: "MOM", detail: counts?.mom ? String(counts.mom) : null },
    { href: STUDIOFLOW_ROUTES.projectSchedule(projectId), label: "Schedule", detail: counts?.schedule ? String(counts.schedule) : null },
    { href: STUDIOFLOW_ROUTES.projectPresentation(projectId), label: "Presentation", detail: counts?.presentation ? String(counts.presentation) : null },
    { href: STUDIOFLOW_ROUTES.projectHistory(projectId), label: "History", detail: null },
  ];
}

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex h-(--ui-header-height) shrink-0 items-center border-b border-line-subtle bg-canvas/90 px-[22px] backdrop-blur-[10px]">
        <Suspense fallback={<Breadcrumb entries={[{ label: "Projects", href: STUDIOFLOW_ROUTES.projects }, { label: "Project" }]} />}>
          <ProjectBreadcrumb grants={grants} projectId={projectId} />
        </Suspense>
      </div>
      <PageShell measure="wide">
        <Suspense fallback={<ProjectHeaderSkeleton projectId={projectId} />}>
          <ProjectHeader grants={grants} projectId={projectId} />
        </Suspense>
        <Suspense fallback={null}><ProjectNotices grants={grants} projectId={projectId} /></Suspense>
        {children}
      </PageShell>
    </div>
  );
}

async function projectOr404(grants: PermissionGrants, projectId: string) {
  return studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  });
}

async function ProjectBreadcrumb({ grants, projectId }: { grants: PermissionGrants; projectId: string }) {
  const project = await projectOr404(grants, projectId);
  return <Breadcrumb entries={[{ label: "Projects", href: STUDIOFLOW_ROUTES.projects }, { label: project.name }]} />;
}

async function ProjectHeader({ grants, projectId }: { grants: PermissionGrants; projectId: string }) {
  const project = await projectOr404(grants, projectId);
  return (
    <PageHeader
      title={project.name}
      meta={<MetaList items={[project.client?.name ?? "No client", `Designer: ${project.designer.displayName}`, `Drafter: ${project.drafter.displayName}`]} />}
      actions={<Suspense fallback={<ProjectNavLinks items={navigation(projectId)} />}><ProjectNavigation grants={grants} projectId={projectId} /></Suspense>}
      divider
    />
  );
}

async function ProjectNavigation({ grants, projectId }: { grants: PermissionGrants; projectId: string }) {
  const [mom, schedule, presentation] = await Promise.all([
    studioFlow.mom.listDocuments({ grants, projectId }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
    studioFlow.presentation.listBoards({ grants, projectId }),
  ]);
  return <ProjectNavLinks items={navigation(projectId, { mom: mom.length, schedule: schedule.length, presentation: presentation.length })} />;
}

async function ProjectNotices({ grants, projectId }: { grants: PermissionGrants; projectId: string }) {
  const project = await projectOr404(grants, projectId);
  const completed = project.archivedAt === null && project.status === "COMPLETED";
  const [settings, access] = await Promise.all([
    project.archivedAt ? studioFlow.projects.getStudioSettings({ grants }) : Promise.resolve(null),
    completed ? pageProjectAccess(projectId) : Promise.resolve(null),
  ]);
  return (
    <>
      {project.archivedAt ? (
        <Notice tone="warning" title="Archived">
          <span className="block">This project is read-only.{project.archiveReason ? ` Reason: ${project.archiveReason}` : ""}</span>
          {settings ? <span className="mt-0.5 block"><ArchivedFilesNote archivedAt={project.archivedAt} assetsPurgedAt={project.assetsPurgedAt} retentionDays={settings.archiveRetentionDays} asOf={new Date().toISOString()} /></span> : null}
        </Notice>
      ) : null}
      {completed ? (
        <Notice tone="success" title="Completed">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>This project is read-only. Reopen it to make changes.</span>
            {access && (access.override || access.isDesigner || access.isDrafter) ? <ReopenProjectButton projectId={projectId} /> : null}
          </span>
        </Notice>
      ) : null}
    </>
  );
}

function ProjectHeaderSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="grid gap-3 border-b border-line pb-4" aria-hidden="true">
      <div className="h-8 w-64 animate-pulse rounded bg-surface-muted" />
      <ProjectNavLinks items={navigation(projectId)} />
    </div>
  );
}
