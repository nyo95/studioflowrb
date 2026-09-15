import { isDateOnlyString } from "@platform/utilities/date";

/**
 * Date-only due dates travel as `YYYY-MM-DD` and are stored in DATE columns,
 * which Prisma returns as UTC-midnight Date objects.
 */
export function dateOnlyToDate(value: string): Date {
  if (!isDateOnlyString(value)) throw new Error(`Invalid date-only value: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateToDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
