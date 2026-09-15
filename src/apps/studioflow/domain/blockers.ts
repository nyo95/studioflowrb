/**
 * The single blocker projection (contract §6.4), ported from legacy
 * `assertNoPendingTasks` and the submit-for-internal-review guard.
 */
export type PhaseBlockerCounts = {
  /** Open activities (TODO + FEEDBACK) in the active revision. */
  openRevisionActivities: number;
  /** Open TODO activities in the active revision. */
  openRevisionTodos: number;
  /** Open deferred activities tagged to the phase (any mode). */
  openDeferredActivities: number;
  /** Open deferred TODO activities tagged to the phase. */
  openDeferredTodos: number;
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
  if (counts.openRevisionActivities > 0) reasons.push(`${plural(counts.openRevisionActivities, "open item")} in this revision`);
  if (counts.openDeferredActivities > 0) reasons.push(`${plural(counts.openDeferredActivities, "deferred item")}`);
  if (counts.openRootChecklistItems > 0) reasons.push(`${plural(counts.openRootChecklistItems, "checklist item")} not ticked`);
  return { total: counts.openRevisionActivities + counts.openDeferredActivities + counts.openRootChecklistItems, reasons };
}

/** Blockers for submitInternal: open to-dos only. */
export function todoBlockers(counts: PhaseBlockerCounts): PhaseBlockers {
  const total = counts.openRevisionTodos + counts.openDeferredTodos;
  return { total, reasons: total > 0 ? [`${plural(total, "open to-do")}`] : [] };
}
