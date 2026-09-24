import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Badge, Breadcrumb, ContextNavHeading, MetaList, Notice, PageHeader, SettingsShell } from "@/platform/ui_engine";

import { pageSession } from "../../_components/session";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL } from "../../_components/phase-status";
import { ProjectNavLinks } from "./project-nav-links";

export const dynamic = "force-dynamic";

const EXTENSIONS_SKELETON = [
  { href: "", label: "MOM", exact: false, marker: null, detail: null },
  { href: "", label: "Schedule", exact: false, marker: null, detail: null },
  { href: "", label: "History", exact: false, marker: null, detail: null },
] as const;

/**
 * The app shell (breadcrumb frame, nav headings/links, page layout) renders
 * immediately — only the project-specific data (name/meta/archived notice,
 * MOM/Schedule counts) streams in behind its own Suspense boundary. Before
 * this split, the whole function awaited that data up front, so the sidebar
 * — which is app shell, not page content — waited on it too (owner,
 * 2026-09-24: "yang loading ini nya aja, side bar itu kan app shell").
 */
export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { grants } = await pageSession();

  return (
    <div className="grid gap-4">
      <Suspense fallback={<HeaderSkeleton />}>
        <ProjectHeader grants={grants} projectId={projectId} />
      </Suspense>
      <SettingsShell
        navigationLabel="Project navigation"
        navigation={
          <>
            <ContextNavHeading>Project</ContextNavHeading>
            <ProjectNavLinks items={[{ href: STUDIOFLOW_ROUTES.project(projectId), label: "Overview", exact: true, marker: null, detail: null }]} />
            <ContextNavHeading>Extensions</ContextNavHeading>
            <Suspense fallback={<ProjectNavLinks items={EXTENSIONS_SKELETON.map((item) => ({ ...item }))} />}>
              <ProjectExtensionsNav grants={grants} projectId={projectId} />
            </Suspense>
          </>
        }
      >
        {children}
      </SettingsShell>
    </div>
  );
}

async function ProjectHeader({ grants, projectId }: { grants: PermissionGrants; projectId: string }) {
  const project = await studioFlow.projects.getProject({ grants, projectId }).catch((error) => {
    if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
    throw error;
  });
  return (
    <>
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
    </>
  );
}

async function ProjectExtensionsNav({ grants, projectId }: { grants: PermissionGrants; projectId: string }) {
  const [momDocuments, scheduleEntries] = await Promise.all([
    studioFlow.mom.listDocuments({ grants, projectId }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
  ]);
  return (
    <ProjectNavLinks items={[
      { href: STUDIOFLOW_ROUTES.projectMom(projectId), label: "MOM", marker: null, detail: momDocuments.length > 0 ? String(momDocuments.length) : null },
      { href: STUDIOFLOW_ROUTES.projectSchedule(projectId), label: "Schedule", marker: null, detail: scheduleEntries.length > 0 ? String(scheduleEntries.length) : null },
      { href: STUDIOFLOW_ROUTES.projectHistory(projectId), label: "History", marker: null, detail: null },
    ]} />
  );
}

function HeaderSkeleton() {
  return (
    <div className="grid gap-2" aria-hidden="true">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
      <div className="h-8 w-72 animate-pulse rounded bg-surface-muted" />
      <div className="h-4 w-96 animate-pulse rounded bg-surface-muted" />
    </div>
  );
}
