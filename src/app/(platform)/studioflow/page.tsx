import { redirect } from "next/navigation";
import { ClipboardCheck, Clock, Users } from "lucide-react";
import Link from "next/link";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import type { WaitingOnMeItem } from "@/apps/studioflow/public";
import { studioFlowService } from "@/apps/studioflow/runtime";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

function ageLabel(since: Date): string {
  const ms = Date.now() - since.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "hari ini";
  if (days === 1) return "1 hari";
  return `${days} hari`;
}

function iterationLabel(item: Extract<WaitingOnMeItem, { kind: "ITERATION" }>): string {
  const prefix = item.phase.round_prefix ?? item.phase.key;
  return `${prefix}${item.iteration_number}`;
}

// ── row components ────────────────────────────────────────────────────────────

function IterationRow({
  item,
  section,
}: {
  item: Extract<WaitingOnMeItem, { kind: "ITERATION" }>;
  section: "mine" | "waiting-client" | "unassigned";
}) {
  const label = iterationLabel(item);
  const age = ageLabel(item.waiting_since);
  const stateLabel =
    item.state === "SENT"
      ? section === "waiting-client"
        ? `dikirim · ${age}`
        : `menunggu klien · ${age}`
      : `belum digarap · ${age}`;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/studioflow/${item.project.id}`}
            className="font-medium text-ink hover:text-action hover:underline truncate"
          >
            {item.project.name}
          </Link>
          <span className="text-xs text-ink-secondary shrink-0">
            · {item.phase.name} · {label}
          </span>
        </div>
        {item.assignee_label && section !== "unassigned" && (
          <p className="text-xs text-ink-tertiary mt-0.5">
            dari {item.assignee_label}
          </p>
        )}
      </div>
      <span className="text-xs text-ink-secondary shrink-0 tabular-nums">
        {stateLabel}
      </span>
    </div>
  );
}

function TaskRow({ item }: { item: Extract<WaitingOnMeItem, { kind: "TASK" }> }) {
  const age = ageLabel(item.waiting_since);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <span className="text-ink-tertiary shrink-0" aria-hidden="true">○</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/studioflow/${item.project.id}`}
            className="text-sm text-ink hover:text-action hover:underline truncate"
          >
            {item.project.name}
          </Link>
          <span className="text-xs text-ink-secondary shrink-0">
            · {item.title}
          </span>
        </div>
        {item.due_date && (
          <p className="text-xs text-ink-tertiary mt-0.5">
            jatuh tempo {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(item.due_date)}
          </p>
        )}
      </div>
      <span className="text-xs text-ink-secondary shrink-0 tabular-nums">
        {age}
      </span>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function WaitingOnMePage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { principal, grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);

  if (!canRead) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
        <PageHeader eyebrow="StudioFlow" title="Menunggu saya" />
        <SectionCard>
          <EmptyState
            icon={ClipboardCheck}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat workload StudioFlow."
          />
        </SectionCard>
      </div>
    );
  }

  const items = await studioFlowService.listWaitingOnMe(grants, principal.userId);

  // Partition into three buckets per spec §2a
  const mine: WaitingOnMeItem[] = [];
  const waitingClient: WaitingOnMeItem[] = [];
  const unassigned: WaitingOnMeItem[] = [];

  for (const item of items) {
    if (item.assignment === "NEEDS_ASSIGNMENT") {
      unassigned.push(item);
    } else if (
      item.kind === "ITERATION" &&
      item.state === "SENT" &&
      item.assignment === "MINE"
    ) {
      // Sent iterations assigned to me = waiting on client response
      waitingClient.push(item);
    } else {
      mine.push(item);
    }
  }

  const isEmpty = mine.length === 0 && waitingClient.length === 0 && unassigned.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Menunggu saya"
        description="Yang harus dikerjakan hari ini — urut dari yang paling lama menganggur"
      />

      {isEmpty ? (
        <SectionCard>
          <EmptyState
            icon={ClipboardCheck}
            title="Semua beres"
            description="Tidak ada ronde atau task yang menunggu kamu."
          />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── Menunggu saya ───────────────────────────────── */}
          {mine.length > 0 && (
            <SectionCard>
              <div className="px-4 pt-3 pb-1 border-b border-line">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  Menunggu saya
                </h2>
              </div>
              <div className="px-4 py-1">
                {mine.map((item) =>
                  item.kind === "ITERATION" ? (
                    <IterationRow key={item.id} item={item} section="mine" />
                  ) : (
                    <TaskRow key={item.id} item={item} />
                  ),
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Menunggu klien ──────────────────────────────── */}
          {waitingClient.length > 0 && (
            <SectionCard>
              <div className="px-4 pt-3 pb-1 border-b border-line">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary flex items-center gap-1.5">
                  <Clock size={12} aria-hidden="true" />
                  Menunggu klien
                </h2>
              </div>
              <div className="px-4 py-1">
                {waitingClient.map((item) =>
                  item.kind === "ITERATION" ? (
                    <IterationRow key={item.id} item={item} section="waiting-client" />
                  ) : (
                    <TaskRow key={item.id} item={item} />
                  ),
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Belum ada penanggung jawab ──────────────────── */}
          {unassigned.length > 0 && (
            <SectionCard>
              <div className="px-4 pt-3 pb-1 border-b border-line">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary flex items-center gap-1.5">
                  <Users size={12} aria-hidden="true" />
                  Belum ada penanggung jawab
                </h2>
              </div>
              <div className="px-4 py-1">
                {unassigned.map((item) =>
                  item.kind === "ITERATION" ? (
                    <IterationRow key={item.id} item={item} section="unassigned" />
                  ) : (
                    <TaskRow key={item.id} item={item} />
                  ),
                )}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
