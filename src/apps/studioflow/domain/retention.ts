/**
 * Archived-project file retention, as the screens need to state it.
 *
 * The backend purges a project's files once `archived_at < now - retentionDays`
 * (strictly older) and stamps `assets_purged_at`. This module answers the one
 * question every screen asks ("are this project's files kept, due, or gone?")
 * with the same boundary the sweep uses, so the wording and the deletion cannot
 * disagree.
 */
export const ARCHIVE_RETENTION_MIN_DAYS = 7;
export const ARCHIVE_RETENTION_MAX_DAYS = 730;
export const ARCHIVE_RETENTION_DEFAULT_DAYS = 90;

const DAY_MS = 86_400_000;

export type ArchivedFilesState =
  /** The sweep already removed the files. */
  | { kind: "removed"; at: Date }
  /** Still inside the window; restoring now keeps everything. */
  | { kind: "kept"; until: Date }
  /** Past the window but not yet swept; the next cleanup removes them. */
  | { kind: "overdue"; since: Date };

export function isValidRetentionDays(value: number): boolean {
  return Number.isInteger(value) && value >= ARCHIVE_RETENTION_MIN_DAYS && value <= ARCHIVE_RETENTION_MAX_DAYS;
}

export function archivedFilesState(input: {
  archivedAt: Date;
  assetsPurgedAt: Date | null;
  retentionDays: number;
  asOf: Date;
}): ArchivedFilesState {
  if (input.assetsPurgedAt) return { kind: "removed", at: input.assetsPurgedAt };
  const due = new Date(input.archivedAt.getTime() + input.retentionDays * DAY_MS);
  // Eligible only when strictly older than the window, so the due instant itself is still "kept".
  return input.asOf.getTime() <= due.getTime() ? { kind: "kept", until: due } : { kind: "overdue", since: due };
}
