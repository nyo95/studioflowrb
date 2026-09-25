import Link from "next/link";

import type { PhaseAttentionRow } from "@/apps/studioflow/today/service";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public/nav";
import { Badge, SectionCard, Text } from "@/platform/ui_engine";

import { PhaseStatusBadge } from "./phase-status";

type Props = {
  phases: PhaseAttentionRow[];
};

/**
 * §7.3 Today — phase attention rail.
 * Cross-project strip of every in-flight phase the user can see.
 * Sits above the task feed to surface the portfolio at a glance.
 */
export function PhaseAttentionSection({ phases }: Props) {
  return (
    <SectionCard title="In flight" count={phases.length} padded={false}>
      <ul className="divide-y divide-line-subtle">
        {phases.map((row) => (
          <li key={row.phaseId} className="flex min-w-0 items-center gap-3 px-(--ui-section-px) py-2.5">
            {/* Accent dot */}
            <span
              className={`mt-px h-2 w-2 shrink-0 rounded-full ${row.accentDotClass}`}
              aria-hidden="true"
            />

            {/* Phase link + project breadcrumb */}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <Link
                  href={STUDIOFLOW_ROUTES.projectPhase(row.projectId, row.phaseId)}
                  className="truncate text-sm font-semibold text-ink hover:underline"
                  prefetch={false}
                >
                  {row.label}
                </Link>
                <Text as="span" size="sm" tone="secondary" className="truncate">
                  <Link
                    href={STUDIOFLOW_ROUTES.project(row.projectId)}
                    className="hover:underline"
                    prefetch={false}
                  >
                    {row.projectName}
                  </Link>
                </Text>
              </div>
            </div>

            {/* Status + waiting days */}
            <PhaseStatusBadge status={row.status} waitingDays={row.waitingDays} />

            {/* Seat */}
            <Badge tone="neutral" className="hidden sm:inline-flex capitalize">
              {row.seat}
            </Badge>

            {/* Blocker count */}
            {row.blockers.total > 0 && (
              <Badge tone="danger" title={`${row.blockers.total} open blocker${row.blockers.total === 1 ? "" : "s"}`}>
                {row.blockers.total} {row.blockers.total === 1 ? "blocker" : "blockers"}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
