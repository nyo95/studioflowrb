/** Date-only working-day arithmetic.  A step always lands after/before base. */
const DAY = 86_400_000;
function at(value: string): number { return Date.parse(`${value}T00:00:00.000Z`); }
function text(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function plus(value: string, days: number): string { return text(at(value) + days * DAY); }

export function isWorkingDay(date: string, holidays: ReadonlySet<string> = new Set()): boolean {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.has(date);
}
export function fwd(base: string, count: number, holidays: ReadonlySet<string> = new Set()): string {
  if (count === 0) return base;
  let value = base;
  for (let left = count; left > 0;) { value = plus(value, 1); if (isWorkingDay(value, holidays)) left--; }
  return value;
}
export function back(base: string, count: number, holidays: ReadonlySet<string> = new Set()): string {
  if (count === 0) return base;
  let value = base;
  for (let left = count; left > 0;) { value = plus(value, -1); if (isWorkingDay(value, holidays)) left--; }
  return value;
}
/** Working days strictly after start and through end; negative when reversed. */
export function workingDaysBetween(start: string, end: string, holidays: ReadonlySet<string> = new Set()): number {
  if (start === end) return 0;
  if (at(start) > at(end)) return -workingDaysBetween(end, start, holidays);
  let result = 0; for (let value = plus(start, 1); at(value) <= at(end); value = plus(value, 1)) if (isWorkingDay(value, holidays)) result++;
  return result;
}
