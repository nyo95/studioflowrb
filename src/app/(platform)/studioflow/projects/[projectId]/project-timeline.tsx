import { phaseAccentDotClass, phaseStatusDisplay, type PhaseStatus } from "@/apps/studioflow/domain/phase";
import { SectionCard, Text } from "@/platform/ui_engine";

type TimelinePhase = { id: string; definitionId: string | null; label: string; status: PhaseStatus };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Owner, 2026-09-23: a project's Gantt/timeline — start (overridable, defaults
 * to when the project was added) through opening (the target end). Phase
 * segments are equal-width by sequence, not independently dated: no schema
 * exists for a per-phase planned start/end, so this shows *where in the
 * overall span the project currently sits*, broken down by phase, rather
 * than claiming calendar-accurate per-phase durations.
 */
export function ProjectTimeline({ startDate, openingDate, phases }: { startDate: string; openingDate: string | null; phases: TimelinePhase[] }) {
  if (phases.length === 0) return null;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const today = Date.now();
  const end = openingDate ? Date.parse(`${openingDate}T00:00:00.000Z`) : Math.max(today, start + 30 * DAY_MS);
  const totalMs = Math.max(end - start, DAY_MS);
  const todayPct = Math.min(100, Math.max(0, ((today - start) / totalMs) * 100));
  const segmentWidth = 100 / phases.length;
  const showTodayMarker = today > start && today < end;

  return (
    <SectionCard
      title="Timeline"
      description={openingDate ? undefined : "No target opening date set — showing progress against today instead."}
    >
      <div className="grid gap-2.5 px-(--ui-section-px) py-3">
        <div className="relative h-7 overflow-hidden rounded-control border border-line bg-surface-muted">
          {phases.map((phase, index) => (
            <div
              key={phase.id}
              className={`absolute inset-y-0 border-r border-surface last:border-r-0 ${phaseAccentDotClass(phase.definitionId)} ${phase.status === "PENDING" ? "opacity-30" : "opacity-90"}`}
              style={{ left: `${index * segmentWidth}%`, width: `${segmentWidth}%` }}
              title={`${phase.label} — ${phaseStatusDisplay(phase.status).label}`}
            />
          ))}
          {showTodayMarker ? (
            <div className="absolute inset-y-0 w-px bg-ink" style={{ left: `${todayPct}%` }} aria-hidden="true" />
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
