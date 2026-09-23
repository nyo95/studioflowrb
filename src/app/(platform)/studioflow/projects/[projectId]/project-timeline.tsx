import { phaseAccentDotClass, phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { computePhaseSegments, resolveTimelineSpan } from "@/apps/studioflow/domain/timeline";
import { SectionCard, Text } from "@/platform/ui_engine";

type TimelinePhase = { id: string; definitionId: string | null; label: string; status: PhaseStatus; plannedStartDate: string | null; plannedEndDate: string | null };

/**
 * Owner, 2026-09-23; upgraded 2026-09-23 with per-phase planned dates: a
 * project's Gantt/timeline — start (overridable, defaults to when the
 * project was added) through opening (the target end). A phase with a
 * planned start/end set (see the portfolio Timeline page) draws at its real
 * position; a phase without one keeps the original equal-width-by-sequence
 * slot, so this still shows *where in the overall span the project
 * currently sits* for any phase that has no planned dates yet.
 */
export function ProjectTimeline({ startDate, openingDate, phases }: { startDate: string; openingDate: string | null; phases: TimelinePhase[] }) {
  if (phases.length === 0) return null;
  const span = resolveTimelineSpan(startDate, openingDate, { phases });
  const segments = computePhaseSegments(span, phases);

  return (
    <SectionCard
      title="Timeline"
      description={openingDate ? undefined : "No target opening date set — showing progress against today instead."}
    >
      <div className="grid gap-2.5 px-(--ui-section-px) py-3">
        <div className="relative h-7 overflow-hidden rounded-control border border-line bg-surface-muted">
          {phases.map((phase, index) => {
            const segment = segments[index]!;
            return (
              <div
                key={phase.id}
                className={`absolute inset-y-0 border-r border-surface last:border-r-0 ${phaseAccentDotClass(phase.definitionId)} ${phase.status === "PENDING" ? "opacity-30" : "opacity-90"}`}
                style={{ left: `${segment.leftPct}%`, width: `${segment.widthPct}%` }}
                title={`${phase.label} — ${phaseStatusDisplay(phase.status).label}${segment.dated ? ` (${phase.plannedStartDate} – ${phase.plannedEndDate})` : ""}`}
              />
            );
          })}
          {span.showTodayMarker ? (
            <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${span.todayPct}%` }} aria-hidden="true" />
          ) : null}
        </div>
        <div className="flex items-center justify-between">
          <Text tone="tertiary" size="sm">{startDate}</Text>
          <Text tone="tertiary" size="sm">{openingDate ?? "Ongoing"}</Text>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {phases.map((phase) => (
            <span key={phase.id} className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-pill ${phaseAccentDotClass(phase.definitionId)}`} />
              {phase.label}
            </span>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
