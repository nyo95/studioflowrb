/**
 * The single blocker projection (contract §6.4), ported from legacy
 * `assertNoPendingTasks` and the submit-for-internal-review guard.
 * V2-D1: SfActivity is FEEDBACK-only; todos live in SfChecklistItem.
 */
export type PhaseBlockerCounts = {
  /** Open FEEDBACK activities in the active revision. */
  openRevisionActivities: number;
  /** Unchecked ROOT checklist items of the phase (subtasks never block). */
  openRootChecklistItems: number;
};

export type PhaseBlockers = { total: number; reasons: string[] };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Blockers for approveInternal, submitClient, approveClient. */
export function fullBlockers(counts: PhaseBlockerCounts): PhaseBlockers {
  const reasons: string[] = [];
  if (counts.openRevisionActivities > 0) reasons.push(`${plural(counts.openRevisionActivities, "open feedback item")} in this revision`);
  if (counts.openRootChecklistItems > 0) reasons.push(`${plural(counts.openRootChecklistItems, "checklist item")} not ticked`);
  return { total: counts.openRevisionActivities + counts.openRootChecklistItems, reasons };
}

/** Blockers for submitInternal: open todos (unchecked root checklist items) only (V2-D1). */
export function todoBlockers(counts: PhaseBlockerCounts): PhaseBlockers {
  const total = counts.openRootChecklistItems;
  return { total, reasons: total > 0 ? [`${plural(total, "open to-do")}`] : [] };
}
