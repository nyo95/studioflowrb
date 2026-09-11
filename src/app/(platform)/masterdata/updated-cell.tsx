"use client";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { FormattedInstant, TableCell, TableCellContent } from "@/platform/ui_engine";

export function UpdatedCell({ at, by }: { at: Date; by: string | null }) {
  const { locale, timezone } = useDisplaySettings();
  return <TableCell><TableCellContent primary={<FormattedInstant value={at} locale={locale} timeZone={timezone} style="datetime" />} secondary={by ?? "—"} /></TableCell>;
}
