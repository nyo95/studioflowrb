import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { FolderOpen } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  Avatar,
  Breadcrumb,
  buttonClasses,
  DescriptionItem,
  DescriptionList,
  DetailShell,
  EmptyState,
  MetaList,
  PageHeader,
  PageSection,
  PipelineStrip,
  ProgressBar,
  SectionCard,
  StatusBadge,
  Text,
  type PipelineStep,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { GeneralTaskBlock } from "./general-task-block";
import { PhaseSection } from "./phase-section";
import type { PhaseItem } from "./phase-section";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  ON_HOLD: "Ditahan",
  COMPLETED: "Selesai",
};

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residensial",
  COMMERCIAL: "Komersial",
  HOSPITALITY: "Hospitality",
  OTHER: "Lainnya",
};

const PHASE_STATE_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "Digarap",
  WAITING_CLIENT: "Waiting for client",
  DONE: "Selesai",
};

const PHASE_STEP_STATE: Record<string, PipelineStep["state"]> = {
  DONE: "done",
  IN_PROGRESS: "current",
  WAITING_CLIENT: "current",
  NOT_STARTED: "upcoming",
};

const PROJECT_STATUS_TONE = {
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "neutral",
} as const;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead =
    hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead) ||
    hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Project detail" divider />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Access denied"
            description="You do not have permission to view this project."
          />
        </SectionCard>
      </>
    );
  }

  const canManageTasks = hasPermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
  const canManageIter = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
  const canReviewIter = hasPermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
  const canOverridePhase = hasPermission(grants, STUDIOFLOW_PERMISSIONS.phaseOverride);

  const [project, settings, tasks, rawPhases, assignableUsers] = await Promise.all([
    studioFlowService.getProject(grants, id).catch((e: { kind?: string }) => {
      if (e?.kind === "NOT_FOUND") return null;
      throw e;
    }),
    readPlatformGeneralSettings(prisma),
    canManageTasks || canRead
      ? studioFlowService
          .listTasks(grants, id, { includeDone: true })
          .catch(() => [])
      : Promise.resolve([]),
    studioFlowService.listProjectPhases(grants, id),
    canManageTasks ? studioFlowService.listAssignableUsers(grants) : Promise.resolve([] as Array<{ id: string; display_name: string }>),
  ]);

  // Resolve approved_by_id → display_name for ACC indicators
  const accUserIds = Array.from(
    new Set(
      rawPhases.flatMap((ph) =>
        ph.iterations
          .map((it) => it.internal_approval?.approved_by_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  );
  const accUsers =
    accUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: accUserIds } },
          select: { id: true, display_name: true },
        })
      : [];
  const accUserMap = Object.fromEntries(accUsers.map((u) => [u.id, u.display_name]));

  if (!project) notFound();

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });

  // Serialize dates for client component boundary
  const phases: PhaseItem[] = rawPhases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    key: phase.key,
    state: phase.state as PhaseItem["state"],
    has_rounds: phase.has_rounds,
    round_prefix: phase.round_prefix,
    requires_internal_approval: phase.requires_internal_approval,
    tasks: tasks
      .filter((task) => task.phase_scope === phase.key)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status as "OPEN" | "DONE",
        phase_scope: task.phase_scope,
        sort_order: task.sort_order,
        assignee_id: task.assignee_id,
        due_date: task.due_date ? task.due_date.toISOString() : null,
      })),
    iterations: phase.iterations.map((iter) => ({
      id: iter.id,
      number: iter.number,
      state: iter.state as PhaseItem["iterations"][number]["state"],
      sent_at: iter.sent_at ? iter.sent_at.toISOString() : null,
      created_at: iter.created_at.toISOString(),
      void_reason: iter.void_reason ?? null,
      internal_approval: iter.internal_approval
        ? {
            approver: accUserMap[iter.internal_approval.approved_by_id] ?? iter.internal_approval.approved_by_id,
            at: iter.internal_approval.approved_at.toISOString(),
          }
        : null,
      points: iter.points.map((pt) => ({
        id: pt.id,
        text: pt.text,
        done: pt.done,
        source: pt.source as "INTERNAL" | "CLIENT_REVISION",
        withdrawn_at: pt.withdrawn_at ? pt.withdrawn_at.toISOString() : null,
      })),
    })),
  }));

  const leadUser = project.lead_user_id
    ? await prisma.user.findUnique({
        where: { id: project.lead_user_id },
        select: { display_name: true },
      })
    : null;

  /* The pipeline is the whole template in order; the leading phase is the one
     the studio is actually waiting on, client turn ahead of our own turn. */
  const steps: PipelineStep[] = rawPhases.map((phase) => {
    const sent = phase.iterations.filter((iter) => iter.state === "SENT").length;
    return {
      id: phase.id,
      label: phase.name,
      note: PHASE_STATE_LABELS[phase.state] ?? phase.state,
      detail: phase.iterations.length > 0 ? `${sent}/${phase.iterations.length} terkirim` : "—",
      state: PHASE_STEP_STATE[phase.state] ?? "upcoming",
    };
  });

  const leadingPhase =
    rawPhases.find((phase) => phase.state === "WAITING_CLIENT") ??
    rawPhases.find((phase) => phase.state === "IN_PROGRESS") ??
    null;

  const donePhases = rawPhases.filter((phase) => phase.state === "DONE").length;
  const openTasks = tasks.filter((task) => task.status === "OPEN").length;

  return (
    <>
      <Breadcrumb
        entries={[
          { label: "Projects", href: "/studioflow/projects" },
          { label: project.name },
        ]}
      />

      <PageHeader
        title={project.name}
        meta={
          <MetaList
            items={[
              <span key="code" className="font-ui-mono text-xs">{project.code}</span>,
              project.client.name,
              TYPE_LABELS[project.type] ?? project.type,
              project.area ? `${Number(project.area)} m²` : null,
              project.location,
              `Opened ${fmt.format(new Date(project.opened_at))}`,
            ]}
          />
        }
        divider
        actions={
          <>
            <StatusBadge tone={PROJECT_STATUS_TONE[project.status as keyof typeof PROJECT_STATUS_TONE] ?? "neutral"}>
              {STATUS_LABELS[project.status] ?? project.status}
            </StatusBadge>
            <Link href={`/studioflow/${id}/files`} className={buttonClasses("secondary", "sm")}>
              <FolderOpen aria-hidden="true" /> File project
            </Link>
          </>
        }
      />

      {/* The spine carries the work; the rail carries the facts that do not
          change mid-session, so the reader never loses the project's identity. */}
      <DetailShell
        header={
          <SectionCard
            title="Phase flow"
            padded={false}
            action={
              leadingPhase ? (
                <Text size="sm" tone="secondary">
                  Sedang jalan: <span className="font-medium text-ink">{leadingPhase.name}</span>
                </Text>
              ) : null
            }
          >
            {steps.length === 0 ? (
              <p className="px-(--ui-section-px) py-3 text-sm text-ink-tertiary">No phases yet.</p>
            ) : (
          <PipelineStrip steps={steps} label="Project phase flow" />
            )}
          </SectionCard>
        }
        aside={
          <>
            <SectionCard title="Phase progress">
              <div className="grid gap-2.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-[650] leading-none">{donePhases}</span>
                  <Text size="sm" tone="tertiary">of {rawPhases.length} phases complete</Text>
                </div>
                <ProgressBar
                  value={donePhases}
                  max={Math.max(rawPhases.length, 1)}
                  label={`${donePhases} of ${rawPhases.length} phases complete`}
                />
                <Text size="sm" tone="secondary">
                  {openTasks === 0 ? "No open tasks" : `${openTasks} open tasks`}
                </Text>
              </div>
            </SectionCard>

            <SectionCard title="Fakta project">
              <DescriptionList columns={1}>
                <DescriptionItem label="Kode">
                  <span className="font-ui-mono text-xs">{project.code}</span>
                </DescriptionItem>
                <DescriptionItem label="Client">{project.client.name}</DescriptionItem>
                <DescriptionItem label="Type">{TYPE_LABELS[project.type] ?? project.type}</DescriptionItem>
                <DescriptionItem label="Status">{STATUS_LABELS[project.status] ?? project.status}</DescriptionItem>
                {project.area ? <DescriptionItem label="Area">{Number(project.area)} m²</DescriptionItem> : null}
                {project.location ? <DescriptionItem label="Location">{project.location}</DescriptionItem> : null}
                <DescriptionItem label="Opened">{fmt.format(new Date(project.opened_at))}</DescriptionItem>
              </DescriptionList>
            </SectionCard>

            <SectionCard title="Tim">
              {leadUser ? (
                <div className="flex items-center gap-2.5">
                  <Avatar name={leadUser.display_name} size="lg" />
                  <div className="grid min-w-0 gap-px">
                    <span className="truncate text-sm font-medium">{leadUser.display_name}</span>
                    <Text meta className="text-ink-tertiary">Project lead</Text>
                  </div>
                </div>
              ) : (
                <Text as="p" tone="tertiary" size="sm">No project lead assigned.</Text>
              )}
            </SectionCard>
          </>
        }
      >
        <GeneralTaskBlock
          projectId={id}
          tasks={tasks.map((t: { id: string; title: string; status: "OPEN" | "DONE"; [key: string]: unknown }) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            phase_scope: (t.phase_scope as string | null | undefined) ?? null,
            sort_order: (t.sort_order as number | undefined) ?? 0,
            assignee_id: (t.assignee_id as string | null | undefined) ?? null,
            due_date: t.due_date instanceof Date ? t.due_date.toISOString() : null,
          }))}
          canManage={canManageTasks}
          phases={rawPhases.map((phase) => ({ key: phase.key, name: phase.name }))}
          phaseScope={null}
          users={assignableUsers}
        />

        <PageSection title="Fase">
          {phases.length === 0 ? (
                <Text as="p" tone="tertiary" size="sm">No phases yet.</Text>
          ) : (
            <PhaseSection
              phases={phases}
              projectId={id}
              canManage={canManageIter}
              canReview={canReviewIter}
              canOverride={canOverridePhase}
              taskPhases={rawPhases.map((phase) => ({ key: phase.key, name: phase.name }))}
              assignableUsers={assignableUsers}
            />
          )}
        </PageSection>
      </DetailShell>
    </>
  );
}
