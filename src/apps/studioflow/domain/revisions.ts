/**
 * Revision-history policy shared by every document-like record (MOM now,
 * Product Schedule next). A record keeps its working copy plus a bounded set
 * of frozen snapshots; numbers only ever increase, so "v4" is never reused.
 */

/** Newest revisions kept per document; saving one more overwrites the oldest. */
export const REVISION_RETENTION = 5;

export function nextRevisionNumber(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/** Numbers to delete so at most `limit` newest revisions remain. */
export function revisionsToPrune(existing: readonly number[], limit: number = REVISION_RETENTION): number[] {
  const newestFirst = [...existing].sort((a, b) => b - a);
  return newestFirst.slice(limit);
}

export function versionLabel(number: number): string {
  return `v${number}`;
}
