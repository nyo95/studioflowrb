/**
 * Gantt/timeline geometry (contract §8, portfolio Timeline page).
 *
 * A project's overall span runs from its (possibly defaulted) start date to
 * its opening date (or "today +30 days, ongoing" when unset). Within that
 * span, a phase with both `plannedStartDate` and `plannedEndDate` set draws
 * at its real position; a phase without them keeps the original equal-width
 * sequence slot, so an all-undated project renders identically to before
 * this feature existed.
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

export type TimelineSegment = { id: string; leftPct: number; widthPct: number; dated: boolean };

/**
 * One segment per phase, in order. A phase with both planned dates set is
 * positioned by real duration against `span`; otherwise it takes the
 * `index / count` equal-width slot the whole bar always used before planned
 * dates existed.
 */
export function computePhaseSegments(span: TimelineSpan, phases: readonly TimelinePhaseDates[]): TimelineSegment[] {
  if (phases.length === 0) return [];
  const equalWidth = 100 / phases.length;
  return phases.map((phase, index) => {
    if (phase.plannedStartDate && phase.plannedEndDate) {
      const pStart = parseDateOnly(phase.plannedStartDate);
      const pEnd = Math.max(parseDateOnly(phase.plannedEndDate), pStart);
      const left = clamp(((pStart - span.startMs) / span.totalMs) * 100, 0, 100);
      const width = clamp(((pEnd - pStart) / span.totalMs) * 100, 0.5, 100 - left);
      return { id: phase.id, leftPct: left, widthPct: width, dated: true };
    }
    return { id: phase.id, leftPct: index * equalWidth, widthPct: equalWidth, dated: false };
  });
}
