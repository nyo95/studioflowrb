import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { phaseAccentDotClass, isPhaseFinished, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { studioFlow } from "@/apps/studioflow/runtime";
import { Breadcrumb, ContextNavHeading, Notice, SettingsShell } from "@/platform/ui_engine";

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
    <div className="grid gap-4">
      <SettingsShell
        navigationLabel="Project navigation"
        navigation={
          <>
            {/* Back to all projects — instant, no data */}
            <div className="pb-1 -mt-0.5">
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

            <ContextNavHeading>Project</ContextNavHeading>
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

            <ContextNavHeading>Documents</ContextNavHeading>
            <Suspense
              fallback={
                <ProjectNavLinks items={EXTENSIONS_SKELETON.map((item) => ({ ...item }))} />
              }
            >
              <ProjectExtensionsNav grants={grants} projectId={projectId} />
            </Suspense>
          </>
        }
      >
        {/* Breadcrumb + archive notice — stream in before page content */}
        <Suspense fallback={<ContentHeaderSkeleton />}>
          <ProjectContentHeader grants={grants} projectId={projectId} />
        </Suspense>

        {children}
      </SettingsShell>
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
    <div className="pb-3 mb-1 border-b border-line">
      <div className="text-sm font-semibold text-ink leading-snug truncate">{project.name}</div>
      <div className="mt-0.5 text-xs text-ink-tertiary truncate">
        {project.client?.name ?? "No client"} · {PROJECT_STATUS_LABEL[project.status]}
      </div>
    </div>
  );
}

async function ProjectContentHeader({
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
      <Breadcrumb
        entries={[
          { label: "Projects", href: STUDIOFLOW_ROUTES.projects },
          { label: project.name },
        ]}
      />
      {project.archivedAt ? (
        <Notice tone="warning" title="Archived">
          This project is read-only.
          {project.archiveReason ? ` Reason: ${project.archiveReason}` : ""}
        </Notice>
      ) : null}
    </>
  );
}

function ProjectRailSkeleton() {
  return (
    <div className="pb-3 mb-1 border-b border-line" aria-hidden="true">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-muted" />
      <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-surface-muted" />
    </div>
  );
}

function ContentHeaderSkeleton() {
  return <div className="h-4 w-48 animate-pulse rounded bg-surface-muted" aria-hidden="true" />;
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
      <ContextNavHeading>Phases</ContextNavHeading>
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
