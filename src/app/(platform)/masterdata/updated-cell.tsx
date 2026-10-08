"use client";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { FormattedInstant, TableCell, TableCellContent } from "@/platform/ui_engine";
import { formatInstant } from "@platform/utilities/date";

export function UpdatedCell({ at, by }: { at: Date; by: string | null }) {
  const { locale, timezone } = useDisplaySettings();
  return <TableCell><TableCellContent primary={<span title={formatInstant(at.toISOString(), { locale, timeZone: timezone, style: "datetime" })}><FormattedInstant value={at} locale={locale} timeZone={timezone} style="date" /></span>} secondary={by ?? "—"} /></TableCell>;
}
