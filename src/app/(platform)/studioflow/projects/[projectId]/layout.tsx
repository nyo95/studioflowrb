import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { phaseAccentDotClass, isPhaseFinished, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Breadcrumb, ContextNavHeading, Notice, PageShell } from "@/platform/ui_engine";

import { ArchivedFilesNote } from "../../_components/archived-files-note";
import { pageSession } from "../../_components/session";
import { PROJECT_STATUS_LABEL } from "../../_components/phase-status";
import { ProjectNavLinks } from "./project-nav-links";

export const dynamic = "force-dynamic";

/* Only the document *counts* stream in; the links are pure functions of
   projectId, so the fallback carries the real hrefs. Empty hrefs collided on
   `key` and, because `pathname.startsWith("/")` is always true, marked every
   document link as the current page while the boundary was pending. */
function extensionsSkeleton(projectId: string) {
  return [
    { href: STUDIOFLOW_ROUTES.projectMom(projectId), label: "MOM", exact: false, marker: null, detail: null },
    { href: STUDIOFLOW_ROUTES.projectSchedule(projectId), label: "Schedule", exact: false, marker: null, detail: null },
    { href: STUDIOFLOW_ROUTES.projectPresentation(projectId), label: "Presentation", exact: false, marker: null, detail: null },
    { href: STUDIOFLOW_ROUTES.projectHistory(projectId), label: "History", exact: false, marker: null, detail: null },
  ];
}

/**
 * Project workspace shell: compact secondary nav rail + content area.
 * The nav chrome (back link, section headings, static hrefs) renders immediately;
 * project identity and phase/document counts stream in independently via Suspense.
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
    /* flex-1 against <main> (flex-col, viewport-tall). This only works now that
       StudioFlowLayout no longer wraps routes in PageShell — inside that grid,
       flex-1 was inert and this whole shell collapsed (R8.152 -> R8.153). */
    <div className="flex min-h-0 flex-1 max-[840px]:flex-col">
      {/* Secondary rail — prototype `.a-rail`: 220px, flush to the icon rail,
          its own scroll so it stays put while content moves. */}
      <aside
        className="flex w-(--ui-secondary-width) shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line-subtle bg-rail px-[9px] py-3 max-[840px]:w-full max-[840px]:flex-row max-[840px]:items-center max-[840px]:gap-1 max-[840px]:overflow-x-auto max-[840px]:overflow-y-hidden max-[840px]:border-r-0 max-[840px]:border-b max-[840px]:py-2 max-[840px]:[&>*]:shrink-0 max-[840px]:[&>*]:whitespace-nowrap"
        aria-label="Project navigation"
      >
        {/* Back to all projects — instant, no data */}
        <Link
          href={STUDIOFLOW_ROUTES.projects}
          prefetch={false}
          className="inline-flex items-center gap-1 rounded-action px-2 py-1 text-xs text-ink-tertiary transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <ChevronLeft size={12} aria-hidden="true" />
          All projects
        </Link>

        {/* Project identity — streams in independently */}
        <Suspense fallback={<ProjectRailSkeleton />}>
          <ProjectRailMeta grants={grants} projectId={projectId} />
        </Suspense>

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
          fallback={<ProjectNavLinks items={extensionsSkeleton(projectId)} />}
        >
          <ProjectExtensionsNav grants={grants} projectId={projectId} />
        </Suspense>
      </aside>

      {/* Content column owns the scroll, so the context bar can stick to it. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Suspense fallback={<ContextBarSkeleton />}>
          <ProjectContextBar grants={grants} projectId={projectId} />
        </Suspense>
        {/* The measure lives inside the content column, not around the shell —
            the prototype's `.a-measure` inside a full-bleed `.a-main`. */}
        <PageShell measure="wide">{children}</PageShell>
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
    <div className="pb-3 mb-1 border-b border-line-subtle max-[840px]:hidden">
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
  // Only an archived project needs the retention window; skip the read everywhere else.
  const settings = project.archivedAt ? await studioFlow.projects.getStudioSettings({ grants }) : null;
  const asOf = new Date().toISOString();

  return (
    <>
      {/* Prototype `.a-ctx`: 44px, sticky, full-bleed, ground-tinted and
          blurred so content passes under it. */}
      <div className="sticky top-0 z-10 flex h-(--ui-header-height) shrink-0 items-center gap-2.5 border-b border-line-subtle bg-canvas/90 px-[22px] backdrop-blur-[10px]">
        <Breadcrumb
          entries={[
            { label: "Projects", href: STUDIOFLOW_ROUTES.projects },
            { label: project.name },
          ]}
        />
      </div>
      {project.archivedAt ? (
        <div className="px-[22px] pt-3">
          <Notice tone="warning" title="Archived">
            <span className="block">
              This project is read-only.
              {project.archiveReason ? ` Reason: ${project.archiveReason}` : ""}
            </span>
            {settings ? (
              <span className="mt-0.5 block">
                <ArchivedFilesNote archivedAt={project.archivedAt} assetsPurgedAt={project.assetsPurgedAt} retentionDays={settings.archiveRetentionDays} asOf={asOf} />
              </span>
            ) : null}
          </Notice>
        </div>
      ) : null}
    </>
  );
}

function ProjectRailSkeleton() {
  return (
    <div className="pb-3 mb-1 border-b border-line-subtle max-[840px]:hidden" aria-hidden="true">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
      <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-surface-muted" />
    </div>
  );
}

function ContextBarSkeleton() {
  return (
    <div
      className="sticky top-0 z-10 h-(--ui-header-height) shrink-0 border-b border-line-subtle bg-canvas/90"
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
  const [momDocuments, scheduleEntries, presentationBoards] = await Promise.all([
    studioFlow.mom.listDocuments({ grants, projectId }),
    studioFlow.schedule.listSchedule({ grants, projectId }),
    studioFlow.presentation.listBoards({ grants, projectId }),
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
          href: STUDIOFLOW_ROUTES.projectPresentation(projectId),
          label: "Presentation",
          marker: null,
          detail: presentationBoards.length > 0 ? String(presentationBoards.length) : null,
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
