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
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
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
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_DISPLAY_LOCALE, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export type InstantDisplayOptions = {
  locale?: string;
  timeZone?: string;
  /**
   * Controls the formatting style.
   * - "long" (default) — explicit year/month/day/hour/minute tokens, long month name.
   * - "date" — `dateStyle: "medium"` (e.g. "10 Sep 2026"). No time component.
   * - "datetime" — `dateStyle: "medium", timeStyle: "short"` (e.g. "10 Sep 2026, 14:30").
   */
  style?: "long" | "date" | "datetime";
};

/** Formats a UTC instant for display in an explicit/default timezone. Accepts a
 *  UTC ISO-8601 string or a Date object. */
export function formatInstant(value: string | Date, options: InstantDisplayOptions = {}): string {
  const iso = typeof value === "string" ? value : value.toISOString();
  if (!isIsoInstantString(iso)) {
    throw new Error(
      `Invalid ISO instant string: ${JSON.stringify(iso)}. Expected a UTC instant ending in Z.`,
    );
  }
  const locale = options.locale ?? DEFAULT_DISPLAY_LOCALE;
  const timeZone = options.timeZone ?? DEFAULT_DISPLAY_TIME_ZONE;
  const style = options.style ?? "long";
  if (style === "date") {
    return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).format(new Date(iso));
  }
  if (style === "datetime") {
    return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  }
  // "long" — existing behaviour preserved for all current callers.
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
