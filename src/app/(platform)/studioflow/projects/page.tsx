import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, Plus, Search } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  Avatar,
  buttonClasses,
  DataTable,
  DirectoryShell,
  EmptyState,
  EntityPrimaryCell,
  filterChipClasses,
  PageHeader,
  SectionCard,
  SegmentBar,
  type SegmentState,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  ON_HOLD: "Ditahan",
  COMPLETED: "Selesai",
};

const PHASE_STATE_LABELS: Record<string, string> = {
  NOT_STARTED: "Belum mulai",
  IN_PROGRESS: "Digarap",
  WAITING_CLIENT: "Menunggu klien",
  DONE: "Selesai",
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

// ── phase summary ────────────────────────────────────────────────────────────

type PhaseRow = {
  name: string;
  state: string;
  oldestSentAt: Date | null;
};

function ageLabel(since: Date): string {
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (days <= 0) return "hari ini";
  if (days === 1) return "1 hari";
  return `${days} hari`;
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
    return { name: "Semua fase", state: "DONE", tone: "success", age: null };
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
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
        <PageHeader eyebrow="StudioFlow" title="Semua project" divider />
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat project."
          />
        </SectionCard>
      </div>
    );
  }

  const params = await searchParams;
  const view = parseView(params.view);
  const query = firstParam(params.q);

  const [projects, settings] = await Promise.all([
    studioFlowService.listProjects(grants),
    readPlatformGeneralSettings(prisma),
  ]);

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

  const fmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    dateStyle: "medium",
  });
  const areaFmt = new Intl.NumberFormat(settings.locale, { maximumFractionDigits: 2 });

  const chips = [
    { key: "all" as const, label: "Semua", count: counts.all },
    { key: "mine" as const, label: "Saya lead", count: counts.mine },
    { key: "review" as const, label: "Menunggu klien", count: counts.review },
  ];

  function chipHref(key: View): string {
    const next = new URLSearchParams();
    if (key !== "all") next.set("view", key);
    if (query) next.set("q", query);
    const suffix = next.toString();
    return suffix ? `/studioflow/projects?${suffix}` : "/studioflow/projects";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Semua project"
        description="Setiap project studio, dengan fase yang sedang benar-benar jalan."
        divider
        actions={
          canManage ? (
            <Link href="/studioflow/new" className={buttonClasses("primary", "md")}>
              <Plus size={16} aria-hidden="true" /> Project baru
            </Link>
          ) : null
        }
      />

      {/* View chips left, list filter right — both plain GET so the list works
          without client JS and every view is a shareable URL. */}
      <div className="flex flex-wrap items-center gap-2">
        <Text meta className="mr-0.5 text-ink-tertiary">Tampilan</Text>
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chipHref(chip.key)}
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
        <form method="get" action="/studioflow/projects" className="relative ml-auto w-[min(100%,240px)]">
          {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-[15px] w-[15px] -translate-y-1/2 text-ink-tertiary"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            aria-label="Cari project"
            placeholder="Cari project atau klien…"
            className="h-8 w-full min-w-0 rounded-control border border-line bg-surface pl-8 pr-2.5 text-[0.8125rem] text-ink outline-none placeholder:text-ink-tertiary focus-visible:border-line-focus"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={FolderOpen}
            title={decorated.length === 0 ? "Belum ada project" : "Tidak ada yang cocok"}
            description={
              decorated.length === 0
                ? canManage
                  ? "Buat project pertama studio."
                  : "Belum ada project aktif."
                : "Ubah filter atau kata kunci pencarian."
            }
          />
        </SectionCard>
      ) : (
        <DirectoryShell surface fill>
          <DataTable framed={false} density="compact" stickyHeader fill minWidth={980}>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Klien</TableHead>
                <TableHead align="end">Luas</TableHead>
                <TableHead>Fase berjalan</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Diperbarui</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ project, phases, leading }) => {
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
                            href={`/studioflow/${project.id}`}
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
                          <Text size="sm" tone="tertiary">Belum ada fase berjalan</Text>
                        )}
                        {segments.length > 0 ? (
                          <SegmentBar
                            segments={segments}
                            label={`${doneCount} dari ${segments.length} fase selesai`}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {leadName ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={leadName} size="sm" />
                          <span className="truncate text-[0.8125rem]">{leadName}</span>
                        </span>
                      ) : (
                        <Text size="sm" tone="tertiary">—</Text>
                      )}
                    </TableCell>
                    <TableCell>{fmt.format(new Date(project.updated_at))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        </DirectoryShell>
      )}
    </div>
  );
}
