import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import { enabledModuleIds } from "@platform/core/modules";
import type { PermissionGrants } from "@platform/core/rbac";
import { PRESENTATION_ROUTES } from "@/apps/presentation/public";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { countProjectBoards } from "@/apps/presentation/public/lifecycle";
import { Breadcrumb, Notice, PageHeader, PageShell } from "@/platform/ui_engine";

import { ArchivedFilesNote } from "../../_components/archived-files-note";
import { canSeeProjectWorkSections, pageProjectAccess, pageSession } from "../../_components/session";
import { ReopenProjectButton } from "../../_components/reopen-project-button";
import { ProjectNavLinks, type ProjectNavItem } from "./project-nav-links";

export const dynamic = "force-dynamic";

function navigation(projectId: string, presentationEnabled: boolean, showWorkSections: boolean, counts?: { mom: number; schedule: number; presentation: number }): ProjectNavItem[] {
  return [
    ...(showWorkSections ? [
      { href: STUDIOFLOW_ROUTES.project(projectId), label: "Phases", exact: true, detail: null },
      { href: STUDIOFLOW_ROUTES.projectMom(projectId), label: "MOM", detail: counts?.mom ? String(counts.mom) : null },
    ] : []),
    { href: STUDIOFLOW_ROUTES.projectSchedule(projectId), label: "Schedule", detail: counts?.schedule ? String(counts.schedule) : null },
    ...(presentationEnabled ? [{ href: PRESENTATION_ROUTES.project(projectId), label: "Presentation", detail: counts?.presentation ? String(counts.presentation) : null }] : []),
    { href: STUDIOFLOW_ROUTES.projectTimeline(projectId), label: "Timeline", detail: null },
    { href: STUDIOFLOW_ROUTES.projectHistory(projectId), label: "History", detail: null },
  ];
}

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants, userId } = await pageSession();
  const [presentationEnabled, access] = await Promise.all([
    enabledModuleIds().then((ids) => ids.includes("presentation")),
    pageProjectAccess(projectId),
  ]);
  const showWorkSections = canSeeProjectWorkSections(access);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Only the Phases page (marked `data-fill-page`) fills the window with its own scrolling notes; every other
          tab keeps its natural height and scrolls with the page. A fill shell for all tabs let their cards shrink
          to the window and clip (Schedule could not scroll). */}
      <PageShell measure="wide" className="has-[[data-fill-page]]:flex has-[[data-fill-page]]:min-h-0 has-[[data-fill-page]]:flex-1 has-[[data-fill-page]]:flex-col">
        <Suspense fallback={<ProjectHeaderSkeleton projectId={projectId} presentationEnabled={presentationEnabled} showWorkSections={showWorkSections} />}>
          <ProjectHeader grants={grants} userId={userId} projectId={projectId} presentationEnabled={presentationEnabled} showWorkSections={showWorkSections} />
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

async function ProjectHeader({ grants, userId, projectId, presentationEnabled, showWorkSections }: { grants: PermissionGrants; userId: string; projectId: string; presentationEnabled: boolean; showWorkSections: boolean }) {
  const project = await projectOr404(grants, projectId);
  // DESIGN v2 §6: the pill tab bar sits below the header (sibling views of the page), not in its action
  // corner, where it crowded the capsule and the title.
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
    <PageHeader
      context={<Breadcrumb entries={[{ label: "StudioFlow", href: STUDIOFLOW_ROUTES.root }, { label: "Projects", href: STUDIOFLOW_ROUTES.projects }]} />}
      title={project.name}
    />
    <Suspense fallback={<ProjectNavLinks items={navigation(projectId, presentationEnabled, showWorkSections)} />}><ProjectNavigation grants={grants} userId={userId} projectId={projectId} presentationEnabled={presentationEnabled} showWorkSections={showWorkSections} /></Suspense>
    </div>
  );
}

async function ProjectNavigation({ grants, userId, projectId, presentationEnabled, showWorkSections }: { grants: PermissionGrants; userId: string; projectId: string; presentationEnabled: boolean; showWorkSections: boolean }) {
  const [mom, schedule, presentation] = await Promise.all([
    showWorkSections ? studioFlow.mom.listDocuments({ grants, projectId }) : Promise.resolve([]),
    studioFlow.schedule.listSchedule({ grants, projectId }),
    presentationEnabled ? countProjectBoards({ grants, actorId: userId, projectId }).catch(() => 0) : Promise.resolve(0),
  ]);
  return <ProjectNavLinks items={navigation(projectId, presentationEnabled, showWorkSections, { mom: mom.length, schedule: schedule.length, presentation })} />;
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

function ProjectHeaderSkeleton({ projectId, presentationEnabled, showWorkSections }: { projectId: string; presentationEnabled: boolean; showWorkSections: boolean }) {
  return (
    <div className="grid gap-3 border-b border-line pb-4" aria-hidden="true">
      <div className="h-8 w-64 animate-pulse rounded bg-surface-muted" />
      <ProjectNavLinks items={navigation(projectId, presentationEnabled, showWorkSections)} />
    </div>
  );
}
