import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import {
  Avatar,
  EmptyState,
  filterChipClasses,
  GroupHeader,
  PageHeader,
  SectionCard,
  StatusMarker,
  Surface,
  Text,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import type { WaitingOnMeItem } from "@/apps/studioflow/public";
import { studioFlowService } from "@/apps/studioflow/runtime";

export const dynamic = "force-dynamic";

// ── scope filter ─────────────────────────────────────────────────────────────

const SCOPES = ["all", "mine", "client", "unassigned"] as const;
type Scope = (typeof SCOPES)[number];

function parseScope(raw: string | string[] | undefined): Scope {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SCOPES.includes(value as Scope) ? (value as Scope) : "all";
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ageLabel(since: Date): string {
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (days <= 0) return "hari ini";
  if (days === 1) return "1 hari";
  return `${days} hari`;
}

function iterationLabel(item: Extract<WaitingOnMeItem, { kind: "ITERATION" }>): string {
  return `${item.phase.round_prefix ?? item.phase.key}${item.iteration_number}`;
}

/** Days until due; negative means overdue. Compared date-only. */
function daysUntil(due: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
}

const PROJECT_STATUS_TONE = {
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "neutral",
} as const;

const PROJECT_STATUS_LABEL = {
  ACTIVE: "Aktif",
  ON_HOLD: "Ditahan",
  COMPLETED: "Selesai",
} as const;

// ── row ──────────────────────────────────────────────────────────────────────

/* One line per waiting item. The columns are fixed so the eye can scan a single
   axis: what it is, which project, when it is due, and who holds it. Below the
   detail breakpoint the trailing columns wrap under the title instead of being
   squeezed to nothing. */
function WaitingRow({
  item,
  dueLabel,
  dueTone,
}: {
  item: WaitingOnMeItem;
  dueLabel: string;
  dueTone: "danger" | "warning" | "muted";
}) {
  const title =
    item.kind === "ITERATION"
      ? `${item.phase.name} · ${iterationLabel(item)}`
      : item.title;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_190px_112px_24px] items-center gap-3 border-b border-line-subtle px-3.5 py-2.5 last:border-0 hover:bg-surface-muted max-[840px]:grid-cols-[minmax(0,1fr)_24px]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-ink">{title}</span>
        {item.kind === "ITERATION" && item.state === "SENT" ? (
          <Text size="sm" tone="tertiary" className="shrink-0">terkirim</Text>
        ) : null}
      </div>

      <Link
        href={`/studioflow/${item.project.id}`}
        className="flex min-w-0 items-center gap-1.5 text-xs text-ink-secondary no-underline hover:text-ink max-[840px]:col-span-2 max-[840px]:col-start-1"
      >
        <StatusMarker
          tone={PROJECT_STATUS_TONE[item.project.status]}
          label={PROJECT_STATUS_LABEL[item.project.status]}
        />
        <span className="truncate">{item.project.name}</span>
      </Link>

      <span
        className={
          dueTone === "danger"
            ? "whitespace-nowrap text-xs font-semibold text-danger max-[840px]:col-start-1"
            : dueTone === "warning"
              ? "whitespace-nowrap text-xs font-semibold text-warning max-[840px]:col-start-1"
              : "whitespace-nowrap text-xs text-ink-tertiary max-[840px]:col-start-1"
        }
      >
        {dueLabel}
      </span>

      {item.assignee_label ? (
        <Avatar name={item.assignee_label} className="max-[840px]:row-start-1 max-[840px]:col-start-2" />
      ) : (
        <span
          aria-label="Belum ditugaskan"
          title="Belum ditugaskan"
          role="img"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-pill border border-dashed border-line-strong text-[0.6875rem] text-ink-tertiary max-[840px]:row-start-1 max-[840px]:col-start-2"
        >
          —
        </span>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function WaitingOnMePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;

  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead)) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Menunggu saya" divider />
        <SectionCard>
          <EmptyState
            icon={ClipboardCheck}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat workload StudioFlow."
          />
        </SectionCard>
      </>
    );
  }

  const scope = parseScope((await searchParams).scope);
  const [items, settings] = await Promise.all([
    studioFlowService.listWaitingOnMe(grants, principal.userId),
    readPlatformGeneralSettings(prisma),
  ]);

  // Three buckets per spec §2a: my turn, the client's turn, nobody's turn yet.
  const mine: WaitingOnMeItem[] = [];
  const waitingClient: WaitingOnMeItem[] = [];
  const unassigned: WaitingOnMeItem[] = [];

  for (const item of items) {
    if (item.assignment === "NEEDS_ASSIGNMENT") unassigned.push(item);
    else if (item.kind === "ITERATION" && item.state === "SENT" && item.assignment === "MINE")
      waitingClient.push(item);
    else mine.push(item);
  }

  const dueFmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    day: "numeric",
    month: "short",
  });
  const headerFmt = new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  /* A task carries a real due date; an iteration only carries how long it has
     been sitting. Both resolve to one trailing column so the rows stay aligned. */
  function dueOf(item: WaitingOnMeItem): { label: string; tone: "danger" | "warning" | "muted" } {
    if (item.kind === "TASK" && item.due_date) {
      const days = daysUntil(item.due_date);
      if (days < 0) return { label: `telat ${Math.abs(days)} hari`, tone: "danger" };
      if (days === 0) return { label: "hari ini", tone: "warning" };
      if (days === 1) return { label: "besok", tone: "warning" };
      return { label: dueFmt.format(item.due_date), tone: "muted" };
    }
    return { label: ageLabel(item.waiting_since), tone: "muted" };
  }

  const overdue = items.filter(
    (item) => item.kind === "TASK" && item.due_date !== null && daysUntil(item.due_date) < 0,
  ).length;

  const groups = [
    { key: "mine" as const, title: "Menunggu saya", tone: "neutral" as const, items: mine },
    { key: "client" as const, title: "Menunggu klien", tone: "warning" as const, items: waitingClient },
    { key: "unassigned" as const, title: "Belum ada penanggung jawab", tone: "neutral" as const, items: unassigned },
  ].filter((group) => (scope === "all" ? group.items.length > 0 : group.key === scope));

  const chips = [
    { key: "all" as const, label: "Semua", count: items.length },
    { key: "mine" as const, label: "Menunggu saya", count: mine.length },
    { key: "client" as const, label: "Menunggu klien", count: waitingClient.length },
    { key: "unassigned" as const, label: "Belum ditugaskan", count: unassigned.length },
  ];

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow"
        title="Menunggu saya"
        description={`${headerFmt.format(new Date())} · ${items.length} terbuka${overdue > 0 ? ` · ${overdue} telat` : ""}`}
        divider
      />

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.key === "all" ? "/studioflow" : `/studioflow?scope=${chip.key}`}
            aria-current={scope === chip.key ? "page" : undefined}
            className={filterChipClasses(scope === chip.key)}
          >
            {chip.label}
            <span className={scope === chip.key ? "tabular-nums opacity-80" : "tabular-nums text-ink-tertiary"}>
              <span aria-hidden="true">· </span>
              {chip.count}
            </span>
          </Link>
        ))}
      </div>

      {groups.every((group) => group.items.length === 0) ? (
        <SectionCard>
          <EmptyState
            icon={ClipboardCheck}
            title={scope === "all" ? "Semua beres" : "Tidak ada di filter ini"}
            description={
              scope === "all"
                ? "Tidak ada ronde atau task yang menunggu kamu."
                : "Coba pilih filter lain untuk melihat pekerjaan yang tersisa."
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-5">
          {groups.map((group) => (
            <section key={group.key} className="grid gap-2">
              <GroupHeader title={group.title} count={group.items.length} tone={group.tone} />
              {group.items.length === 0 ? (
                <Text as="p" tone="tertiary" size="sm">Kosong.</Text>
              ) : (
                <Surface className="min-w-0 overflow-hidden">
                  {group.items.map((item) => {
                    const due = dueOf(item);
                    return (
                      <WaitingRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        dueLabel={due.label}
                        dueTone={due.tone}
                      />
                    );
                  })}
                </Surface>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
