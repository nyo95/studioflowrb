"use client";

import { currentDateOnly, diffDateOnlyDays, formatDateOnly } from "@platform/utilities/date";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";

/** Relative due date: "Overdue 2d", "Today", "Tomorrow", or the calendar date. */
export function DueLabel({ date, done = false }: { date: string | null; done?: boolean }) {
  const { locale, timezone } = useDisplaySettings();
  if (!date) return null;
  const days = diffDateOnlyDays(currentDateOnly({ timeZone: timezone }), date);
  const text = days < 0 ? `Overdue ${-days}d` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : formatDateOnly(date, { locale });
  const tone = done ? "text-ink-tertiary" : days < 0 ? "text-danger" : days === 0 ? "text-warning" : "text-ink-secondary";
  return <span className={`whitespace-nowrap text-xs ${tone}`} title={formatDateOnly(date, { locale })}>{text}</span>;
}
