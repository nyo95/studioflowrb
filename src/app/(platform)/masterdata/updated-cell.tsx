"use client";

import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { TableCell, TableCellContent } from "@/platform/ui_engine";

export function UpdatedCell({ at, by }: { at: Date; by: string | null }) {
  const { locale, timezone } = useDisplaySettings();
  const label = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(at));

  return <TableCell><TableCellContent primary={label} secondary={by ?? "—"} /></TableCell>;
}
