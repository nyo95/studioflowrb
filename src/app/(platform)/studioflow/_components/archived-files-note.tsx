"use client";

import { archivedFilesState } from "@/apps/studioflow/domain/retention";
import { useDisplaySettings } from "@/platform/authenticated-shell/display-settings";
import { FormattedInstant } from "@/platform/ui_engine";

/**
 * What happens to an archived project's files, in the owner's words. The state comes from the same
 * rule the cleanup uses (`archivedFilesState`), so this text can never promise a date the sweep will
 * not honour. `asOf` is passed from the server so the server render and hydration agree.
 */
export function ArchivedFilesNote({
  archivedAt,
  assetsPurgedAt,
  retentionDays,
  asOf,
  variant = "full",
}: {
  archivedAt: Date | string;
  assetsPurgedAt: Date | string | null;
  retentionDays: number;
  asOf: string;
  /** "full" is a sentence for a notice or dialog; "compact" is a short label for a table row. */
  variant?: "full" | "compact";
}) {
  const { locale, timezone } = useDisplaySettings();
  const state = archivedFilesState({
    archivedAt: new Date(archivedAt),
    assetsPurgedAt: assetsPurgedAt ? new Date(assetsPurgedAt) : null,
    retentionDays,
    asOf: new Date(asOf),
  });
  const date = (value: Date) => <FormattedInstant value={value} locale={locale} timeZone={timezone} />;

  if (state.kind === "removed") {
    return variant === "compact" ? <>Files removed {date(state.at)}</> : <>Files were removed on {date(state.at)}. Text and history are kept.</>;
  }
  if (state.kind === "kept") {
    return variant === "compact"
      ? <>Files kept until {date(state.until)}</>
      : <>Files are kept until {date(state.until)}, then removed. Restore the project before then to keep them.</>;
  }
  return variant === "compact"
    ? <>Files due for removal</>
    : <>Files are past their {retentionDays}-day window and will be removed at the next daily cleanup. Restore the project now to keep them.</>;
}
