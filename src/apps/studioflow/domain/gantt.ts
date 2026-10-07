/**
 * Gantt geometry on a real calendar axis (WO-SF-GANTT-01). Pure and date-only:
 * every position is a whole number of days from the first visible day, times
 * the zoom's pixels per day, so a bar's length is its real duration and two
 * projects on the same axis line up. No phase is ever drawn without dates.
 */
const DAY_MS = 86_400_000;

export type GanttZoom = "week" | "month";
export const GANTT_PX_PER_DAY: Record<GanttZoom, number> = { week: 18, month: 6 };

export function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00.000Z`) / DAY_MS);
}
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-07" → "7 Oct 2026" for the today label, read from the string so no time zone can shift the day. */
export function ganttDayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1] ?? ""} ${year}`;
}

export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday, for a day number. */
function weekdayOf(day: number): number {
  return new Date(day * DAY_MS).getUTCDay();
}
function mondayOnOrBefore(day: number): number {
  return day - ((weekdayOf(day) + 6) % 7);
}

export type GanttAxis = {
  zoom: GanttZoom;
  pxPerDay: number;
  startDay: number;
  endDay: number;
  widthPx: number;
  months: Array<{ key: string; label: string; leftPx: number; widthPx: number }>;
  weeks: Array<{ key: string; label: string; leftPx: number }>;
  todayPx: number | null;
};

/** The visible range: every given date, padded by a week each side, starting on a Monday. */
export function buildGanttAxis(dates: readonly string[], options: { zoom: GanttZoom; today: string }): GanttAxis {
  const pxPerDay = GANTT_PX_PER_DAY[options.zoom];
  const todayDay = dayNumber(options.today);
  const days = dates.map(dayNumber);
  const lo = days.length > 0 ? Math.min(...days) : todayDay;
  const hi = days.length > 0 ? Math.max(...days) : todayDay + 60;
  // The range always includes today so the marker is findable, but never stretches past a year of padding.
  const startDay = mondayOnOrBefore(Math.min(lo, todayDay + 0) - 7);
  const endDay = Math.max(hi, Math.min(todayDay, hi + 365)) + 14;
  const widthPx = (endDay - startDay + 1) * pxPerDay;

  const months: GanttAxis["months"] = [];
  for (let day = startDay; day <= endDay;) {
    const d = new Date(day * DAY_MS);
    const monthEnd = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS) - 1;
    const last = Math.min(monthEnd, endDay);
    months.push({
      key: dateOfDay(day).slice(0, 7),
      label: d.toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" }),
      leftPx: (day - startDay) * pxPerDay,
      widthPx: (last - day + 1) * pxPerDay,
    });
    day = last + 1;
  }
  const weeks: GanttAxis["weeks"] = [];
  for (let day = startDay; day <= endDay; day += 7) weeks.push({ key: dateOfDay(day), label: String(new Date(day * DAY_MS).getUTCDate()), leftPx: (day - startDay) * pxPerDay });

  return { zoom: options.zoom, pxPerDay, startDay, endDay, widthPx, months, weeks, todayPx: todayDay >= startDay && todayDay <= endDay ? (todayDay - startDay) * pxPerDay : null };
}

/** A bar covers both its first and last day, so a one-day job is one day wide, never invisible. */
export function ganttBar(axis: GanttAxis, start: string, end: string): { leftPx: number; widthPx: number } {
  const from = dayNumber(start);
  const to = Math.max(dayNumber(end), from);
  return { leftPx: (from - axis.startDay) * axis.pxPerDay, widthPx: (to - from + 1) * axis.pxPerDay };
}

/** The centre of a day, for a milestone marker. */
export function ganttMarkerX(axis: GanttAxis, date: string): number {
  return (dayNumber(date) - axis.startDay) * axis.pxPerDay + axis.pxPerDay / 2;
}

/** Weekend columns, as left/width pairs, for the faint shading behind the rows. */
export function ganttWeekends(axis: GanttAxis): Array<{ leftPx: number; widthPx: number }> {
  const result: Array<{ leftPx: number; widthPx: number }> = [];
  for (let day = axis.startDay; day <= axis.endDay; day++) {
    if (weekdayOf(day) === 6) result.push({ leftPx: (day - axis.startDay) * axis.pxPerDay, widthPx: Math.min(2, axis.endDay - day + 1) * axis.pxPerDay });
  }
  return result;
}
