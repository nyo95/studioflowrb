/**
 * Gantt/timeline geometry (contract §8, portfolio Timeline page).
 *
 * A project's overall span runs from its (possibly defaulted) start date to
 * its opening date (or "today +30 days, ongoing" when unset), widened to
 * cover any phase's planned dates. The Gantt itself is drawn on a real
 * calendar axis (`domain/gantt.ts`); this span is only used to decide whether
 * a project overlaps the page's date filter.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseDateOnly(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

export type TimelineSpan = {
  startMs: number;
  endMs: number;
  totalMs: number;
  todayPct: number;
  showTodayMarker: boolean;
};

export type TimelinePhaseDates = { id: string; plannedStartDate: string | null; plannedEndDate: string | null };

/**
 * The overall bar span for one project: start date through opening (or a
 * 30-day-ongoing fallback), widened to also cover any phase's planned dates
 * that fall outside that range. Without the widening, a planned date earlier
 * than the project start (or later than opening) would clamp to the edge and
 * render hidden behind an undated phase's equal-width slot — a saved date
 * silently not showing up would be worse than a bar that's wider than the
 * project's own start/opening labels suggest.
 */
export function resolveTimelineSpan(startDate: string, openingDate: string | null, options: { phases?: readonly TimelinePhaseDates[]; now?: number } = {}): TimelineSpan {
  const now = options.now ?? Date.now();
  let startMs = parseDateOnly(startDate);
  let endMs = openingDate ? parseDateOnly(openingDate) : Math.max(now, startMs + 30 * DAY_MS);
  // Only a fully-dated phase (both fields set) affects the span — matches which phases
  // `computePhaseSegments` treats as `dated` below, so nothing widens the bar just to
  // then still render on the equal-width fallback.
  for (const phase of options.phases ?? []) {
    if (!phase.plannedStartDate || !phase.plannedEndDate) continue;
    startMs = Math.min(startMs, parseDateOnly(phase.plannedStartDate));
    endMs = Math.max(endMs, parseDateOnly(phase.plannedEndDate));
  }
  const totalMs = Math.max(endMs - startMs, DAY_MS);
  return {
    startMs,
    endMs,
    totalMs,
    todayPct: clamp(((now - startMs) / totalMs) * 100, 0, 100),
    showTodayMarker: now > startMs && now < endMs,
  };
}
