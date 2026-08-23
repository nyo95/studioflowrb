/**
 * Domain-neutral date/time representation helpers (CORE.md §10).
 *
 * Instants (UTC ISO-8601 with `Z`) and date-only values (`YYYY-MM-DD`) are
 * distinct representations and are validated/formatted separately. Date-only
 * values never travel through UTC instants when displayed. Holiday calendars,
 * workday rules, schedules, and business deadlines stay app-owned.
 */

export const DEFAULT_DISPLAY_LOCALE = "id-ID";
export const DEFAULT_DISPLAY_TIME_ZONE = "Asia/Jakarta";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;

function isValidUtcCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Strict `YYYY-MM-DD` calendar date; rollover dates like `2026-02-30` are rejected. */
export function isDateOnlyString(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  return isValidUtcCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Strict UTC instant (`...Z`); date-only strings and explicit offsets are rejected. */
export function isIsoInstantString(value: string): boolean {
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  return isValidUtcCalendarDate(Number(year), Number(month), Number(day));
}

function assertDateOnly(value: string): void {
  if (!isDateOnlyString(value)) {
    throw new Error(`Invalid date-only string: ${JSON.stringify(value)}. Expected YYYY-MM-DD.`);
  }
}

/**
 * Formats a date-only value in the given locale without any timezone
 * conversion: the calendar date shown is exactly the stored one.
 */
export function formatDateOnly(value: string, options: { locale?: string } = {}): string {
  assertDateOnly(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_DISPLAY_LOCALE, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(Date.UTC(year, month - 1, day));
}

export type InstantDisplayOptions = {
  locale?: string;
  timeZone?: string;
};

/** Formats a UTC instant for display in an explicit/default timezone. */
export function formatInstant(value: string, options: InstantDisplayOptions = {}): string {
  if (!isIsoInstantString(value)) {
    throw new Error(
      `Invalid ISO instant string: ${JSON.stringify(value)}. Expected a UTC instant ending in Z.`,
    );
  }
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_DISPLAY_LOCALE, {
    timeZone: options.timeZone ?? DEFAULT_DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
