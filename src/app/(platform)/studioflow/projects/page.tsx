import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  Avatar,
  DataTable,
  DirectoryShell,
  EmptyState,
  FormattedInstant,
  EntityPrimaryCell,
  filterChipClasses,
  PageHeader,
  Pagination,
  SearchField,
  SectionCard,
  SegmentBar,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Text,
  type SegmentState,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { NewProjectButton } from "./new-project-dialog";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
};

const PHASE_STATE_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING_CLIENT: "Waiting for client",
  DONE: "Complete",
};

const PHASE_SEGMENT_STATE: Record<string, SegmentState> = {
  DONE: "done",
  IN_PROGRESS: "current",
  WAITING_CLIENT: "current",
  NOT_STARTED: "idle",
};

// ── view filter ──────────────────────────────────────────────────────────────

const VIEWS = ["all", "mine", "review"] as const;
type View = (typeof VIEWS)[number];

function parseView(raw: string | string[] | undefined): View {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return VIEWS.includes(value as View) ? (value as View) : "all";
}

function firstParam(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim();
}

/** Rows per page. One screenful at the default measure, so paging is rare. */
const PAGE_SIZE = 25;

function parsePage(raw: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstParam(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// ── phase summary ────────────────────────────────────────────────────────────

type PhaseRow = {
  name: string;
  state: string;
  oldestSentAt: Date | null;
};

function ageLabel(since: Date): string {
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/* The phase that is actually moving: the client's turn outranks our own turn,
   which outranks a project whose phases have all closed. */
function leadingPhase(
  phases: PhaseRow[],
): { name: string; state: string; tone: "warning" | "neutral" | "success"; age: string | null } | null {
  const waiting = phases.filter((phase) => phase.state === "WAITING_CLIENT");
  if (waiting.length > 0) {
    const sent = waiting.map((phase) => phase.oldestSentAt).filter((date): date is Date => date !== null);
    const oldest = sent.length > 0 ? new Date(Math.min(...sent.map((date) => date.getTime()))) : null;
    return {
      name: waiting[0]!.name,
      state: "WAITING_CLIENT",
      tone: "warning",
      age: oldest ? ageLabel(oldest) : null,
    };
  }
  const active = phases.find((phase) => phase.state === "IN_PROGRESS");
  if (active) return { name: active.name, state: "IN_PROGRESS", tone: "neutral", age: null };
  if (phases.length > 0 && phases.every((phase) => phase.state === "DONE")) {
    return { name: "All phases", state: "DONE", tone: "success", age: null };
  }
  return null;
}

export default async function StudioFlowProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="All projects" divider />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Access denied"
            description="You do not have permission to view projects."
          />
        </SectionCard>
      </>
    );
  }

  const params = await searchParams;
  const view = parseView(params.view);
  const query = firstParam(params.q);
  const requestedPage = parsePage(params.page);

  const [projects, settings, allClients] = await Promise.all([
    studioFlowService.listProjects(grants),
    readPlatformGeneralSettings(prisma),
    canManage ? studioFlowService.listClients(grants) : Promise.resolve([]),
  ]);
  const clients = allClients
    .filter((c) => !c.deleted_at)
    .map((c) => ({ id: c.id, name: c.name }));

  // Cross-schema: resolve lead_user_id → display_name (no Prisma relation allowed).
  const leadUserIds = Array.from(
    new Set(projects.map((project) => project.lead_user_id).filter((id): id is string => Boolean(id))),
  );
  const leadUsers =
    leadUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: leadUserIds } },
          select: { id: true, display_name: true },
        })
      : [];
  const leadUserMap = Object.fromEntries(leadUsers.map((user) => [user.id, user.display_name]));

  const decorated = projects.map((project) => {
    const phases: PhaseRow[] = project.phases.map((phase) => ({
      name: phase.name,
      state: phase.state,
      oldestSentAt: phase.iterations[0]?.sent_at ?? null,
    }));
    return {
      project,
      phases,
      leading: leadingPhase(phases),
      isMine: project.lead_user_id === principal.userId,
      needsReview: phases.some((phase) => phase.state === "WAITING_CLIENT"),
    };
  });

  const counts = {
    all: decorated.length,
    mine: decorated.filter((row) => row.isMine).length,
    review: decorated.filter((row) => row.needsReview).length,
  };

  const needle = query.toLowerCase();
  const rows = decorated.filter((row) => {
    if (view === "mine" && !row.isMine) return false;
    if (view === "review" && !row.needsReview) return false;
    if (needle === "") return true;
    return (
      row.project.name.toLowerCase().includes(needle) ||
      row.project.code.toLowerCase().includes(needle) ||
      row.project.client.name.toLowerCase().includes(needle)
    );
  });

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const areaFmt = new Intl.NumberFormat(settings.locale, { maximumFractionDigits: 2 });

  const chips = [
    { key: "all" as const, label: "All", count: counts.all },
    { key: "mine" as const, label: "I lead", count: counts.mine },
    { key: "review" as const, label: "Waiting for client", count: counts.review },
  ];

  function listHref({ nextView = view, nextPage = 1 }: { nextView?: View; nextPage?: number } = {}): string {
    const next = new URLSearchParams();
    if (nextView !== "all") next.set("view", nextView);
    if (query) next.set("q", query);
    if (nextPage > 1) next.set("page", String(nextPage));
    const suffix = next.toString();
    return suffix ? `/studioflow/projects?${suffix}` : "/studioflow/projects";
  }

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow"
        title="All projects"
        description="Every studio project, with its current active phase."
        divider
        actions={
          canManage ? <NewProjectButton clients={clients} /> : null
        }
      />

      {/* View chips left, list filter right — both plain GET so the list works
          without client JS and every view is a shareable URL. */}
      {/* Canonical directory chrome: the toolbar owns filters and search, so a
          filtered-to-nothing list still shows the controls that got it there. */}
      {/* TODO(SF-0): Project List — replace DirectoryShell/DataTable/EntityPrimaryCell with workspace-appropriate pattern.
          DirectoryShell/DataTable paradigm does not fit workspace execution context. */}
      <DirectoryShell
        surface
        fill
        pagination={
          <Pagination
            page={page}
            pageCount={pageCount}
            total={rows.length}
            pageSize={PAGE_SIZE}
            getHref={(nextPage) => listHref({ nextPage })}
            label="Project pages"
          />
        }
        toolbar={
          <TableToolbar
            framed={false}
            filters={chips.map((chip) => (
              <Link
                key={chip.key}
                href={listHref({ nextView: chip.key })}
                aria-current={view === chip.key ? "page" : undefined}
                className={filterChipClasses(view === chip.key)}
              >
                {chip.label}
                <span className={view === chip.key ? "tabular-nums opacity-80" : "tabular-nums text-ink-tertiary"}>
                  <span aria-hidden="true">· </span>
                  {chip.count}
                </span>
              </Link>
            ))}
            search={
              <form method="get" action="/studioflow/projects" className="contents">
                {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
                <SearchField
                  name="q"
                  defaultValue={query}
                  label="Search projects"
              placeholder="Search projects or clients…"
                />
              </form>
            }
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={decorated.length === 0 ? "No projects yet" : "No matches"}
            description={
              decorated.length === 0
                ? canManage
                  ? "Create the studio's first project."
                  : "There are no active projects."
                : "Change the filter or search term."
            }
          />
        ) : (
          <DataTable framed={false} density="compact" stickyHeader fill minWidth={980}>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead align="end">Area</TableHead>
                <TableHead>Active phase</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map(({ project, phases, leading }) => {
                const leadName = project.lead_user_id ? leadUserMap[project.lead_user_id] : undefined;
                const segments = phases.map((phase) => PHASE_SEGMENT_STATE[phase.state] ?? "idle");
                const doneCount = phases.filter((phase) => phase.state === "DONE").length;
                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <EntityPrimaryCell
                        tone={
                          project.status === "ACTIVE"
                            ? "success"
                            : project.status === "COMPLETED"
                              ? "neutral"
                              : "warning"
                        }
                        statusLabel={STATUS_LABELS[project.status] ?? project.status}
                        name={
                          <Link
                            href={`/studioflow/projects/${project.id}`}
                            className="font-medium text-action hover:underline"
                          >
                            {project.name}
                          </Link>
                        }
                        secondary={project.code}
                      />
                    </TableCell>
                    <TableCell>{project.client.name}</TableCell>
                    <TableCell align="end" className="tabular-nums">
                      {project.area ? `${areaFmt.format(Number(project.area))} m²` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="grid min-w-40 gap-1.5">
                        {leading ? (
                          <StatusBadge tone={leading.tone} className="text-xs">
                            <span className="truncate font-medium">{leading.name}</span>
                            <span className="text-ink-tertiary">
                              {PHASE_STATE_LABELS[leading.state] ?? leading.state}
                              {leading.age ? ` · ${leading.age}` : ""}
                            </span>
                          </StatusBadge>
                        ) : (
                          <Text size="sm" tone="tertiary">No active phase</Text>
                        )}
                        {segments.length > 0 ? (
                          <SegmentBar
                            segments={segments}
                            label={`${doneCount} of ${segments.length} phases complete`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {leadName ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={leadName} size="sm" />
                          <span className="truncate text-sm">{leadName}</span>
                        </span>
                      ) : (
                        <Text size="sm" tone="tertiary">—</Text>
                      )}
                    </TableCell>
                    <TableCell><FormattedInstant value={project.updated_at} locale={settings.locale} timeZone={settings.timezone} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        )}
      </DirectoryShell>
    </>
  );
}
