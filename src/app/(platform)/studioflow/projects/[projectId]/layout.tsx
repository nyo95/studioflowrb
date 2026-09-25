import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { phaseAccentDotClass, isPhaseFinished, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Breadcrumb, ContextNavHeading, Notice } from "@/platform/ui_engine";

import { pageSession } from "../../_components/session";
import { PROJECT_STATUS_LABEL } from "../../_components/phase-status";
import { ProjectNavLinks } from "./project-nav-links";

export const dynamic = "force-dynamic";

const EXTENSIONS_SKELETON = [
  { href: "", label: "MOM", exact: false, marker: null, detail: null },
  { href: "", label: "Schedule", exact: false, marker: null, detail: null },
  { href: "", label: "History", exact: false, marker: null, detail: null },
] as const;

/**
 * Project workspace shell: 220px secondary rail (project nav, sticky) + content
 * area with 44px context bar. The secondary rail streams its project-specific
 * meta independently; the chrome (back link, nav sections) is always instant.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { grants } = await pageSession();

  return (
    /* flex flex-1: fills the full height of <main> (which is flex-col h-[calc(100dvh-4rem)]) */
    <div className="flex flex-1 max-[840px]:flex-col">
      {/* ─── Secondary rail (220px) ──────────────────────────────────────── */}
      <aside
        className="w-[220px] shrink-0 flex flex-col border-r border-line bg-rail overflow-y-auto max-[840px]:w-full max-[840px]:h-auto max-[840px]:border-r-0 max-[840px]:border-b"
        aria-label="Project navigation"
      >
        {/* Back to all projects */}
        <div className="px-2.5 pt-2.5 pb-1 shrink-0">
          <Link
            href={STUDIOFLOW_ROUTES.projects}
            prefetch={false}
            className="inline-flex items-center gap-1 rounded-action px-1.5 py-1 text-[11px] font-medium text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <ChevronLeft size={11} aria-hidden="true" />
            All projects
          </Link>
        </div>

        {/* Project identity — streams in independently */}
        <Suspense fallback={<ProjectRailSkeleton />}>
          <ProjectRailMeta grants={grants} projectId={projectId} />
        </Suspense>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2 py-1.5 max-[840px]:flex-row max-[840px]:flex-wrap max-[840px]:gap-1">
          <ContextNavHeading className="max-[840px]:hidden">Project</ContextNavHeading>
          <ProjectNavLinks
            items={[
              {
                href: STUDIOFLOW_ROUTES.project(projectId),
                label: "Overview",
                exact: true,
                marker: null,
                detail: null,
              },
            ]}
          />
          <Suspense fallback={null}>
            <ProjectPhasesNav grants={grants} projectId={projectId} />
          </Suspense>
          <ContextNavHeading className="max-[840px]:hidden">Documents</ContextNavHeading>
          <Suspense
            fallback={
              <ProjectNavLinks items={EXTENSIONS_SKELETON.map((item) => ({ ...item }))} />
            }
          >
            <ProjectExtensionsNav grants={grants} projectId={projectId} />
          </Suspense>
        </nav>
      </aside>

      {/* ─── Content area ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
        {/* 44px context bar — sticky within this scroll container */}
        <Suspense fallback={<ContextBarSkeleton />}>
          <ProjectContextBar grants={grants} projectId={projectId} />
        </Suspense>

        {/* Page content */}
        {children}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

async function ProjectRailMeta({
  grants,
  projectId,
}: {
  grants: PermissionGrants;
  projectId: string;
}) {
  const project = await studioFlow.projects
    .getProject({ grants, projectId })
    .catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    });

  return (
    <div className="px-3.5 pb-3 pt-1 shrink-0 border-b border-line mb-1 max-[840px]:hidden">
      <div className="text-sm font-semibold text-ink leading-snug truncate">{project.name}</div>
      <div className="mt-0.5 text-xs text-ink-tertiary truncate">
        {project.client?.name ?? "No client"} · {PROJECT_STATUS_LABEL[project.status]}
      </div>
    </div>
  );
}

async function ProjectContextBar({
  grants,
  projectId,
}: {
  grants: PermissionGrants;
  projectId: string;
}) {
  const project = await studioFlow.projects
    .getProject({ grants, projectId })
    .catch((error) => {
      if (error instanceof AppError && error.kind === "NOT_FOUND") notFound();
      throw error;
    });

  return (
    <>
      <div className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-surface/90 px-5 backdrop-blur-[10px]">
        <Breadcrumb
          entries={[
            { label: "Projects", href: STUDIOFLOW_ROUTES.projects },
            { label: project.name },
          ]}
        />
      </div>
      {project.archivedAt ? (
        <div className="px-5 pt-3">
          <Notice tone="warning" title="Archived">
            This project is read-only.
            {project.archiveReason ? ` Reason: ${project.archiveReason}` : ""}
          </Notice>
        </div>
      ) : null}
    </>
  );
}

function ProjectRailSkeleton() {
  return (
    <div
      className="px-3.5 pb-3 pt-1 shrink-0 border-b border-line mb-1 max-[840px]:hidden"
      aria-hidden="true"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
      <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-surface-muted" />
    </div>
  );
}

function ContextBarSkeleton() {
  return (
    <div
      className="sticky top-0 z-10 h-11 shrink-0 border-b border-line bg-surface/90"
      aria-hidden="true"
    />
  );
}

type NavPhaseItem = {
  id: string;
  definitionId: string | null;
  label: string;
  status: PhaseStatus;
  openCount: number;
};

async function ProjectPhasesNav({
  grants,
  projectId,
}: {
  grants: PermissionGrants;
  projectId: string;
}) {
  const phases: NavPhaseItem[] = await studioFlow.phases.listNavPhases({
    grants,
    projectId,
  });
  if (phases.length === 0) return null;
  return (
    <>
      <ContextNavHeading className="max-[840px]:hidden">Phases</ContextNavHeading>
      <ProjectNavLinks
        items={phases.map((phase) => ({
          href: STUDIOFLOW_ROUTES.projectPhase(projectId, phase.id),
          label: phase.label,
          exact: false,
          marker: phaseAccentDotClass(phase.definitionId),
          detail: phase.openCount > 0 ? String(phase.openCount) : null,
          title: isPhaseFinished(phase.status) ? `${phase.label} — done` : phase.label,
        }))}
      />
    </>
  );
}

async function ProjectExtensionsNav({
  grants,
  projectId,
}: {
  grants: PermissionGrants;
  projectId: string;
}) {
  const [momDocuments, scheduleEntries] = await Promise.all([
    studioFlow.mom.listDocuments({ grants, projectId }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
  ]);
  return (
    <ProjectNavLinks
      items={[
        {
          href: STUDIOFLOW_ROUTES.projectMom(projectId),
          label: "MOM",
          marker: null,
          detail: momDocuments.length > 0 ? String(momDocuments.length) : null,
        },
        {
          href: STUDIOFLOW_ROUTES.projectSchedule(projectId),
          label: "Schedule",
          marker: null,
          detail: scheduleEntries.length > 0 ? String(scheduleEntries.length) : null,
        },
        {
          href: STUDIOFLOW_ROUTES.projectHistory(projectId),
          label: "History",
          marker: null,
          detail: null,
        },
      ]}
    />
  );
}
