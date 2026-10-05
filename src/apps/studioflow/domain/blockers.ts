/**
 * The open-checklist projection of a phase (contract §6.4), shown as information. Since WO-SF-ITER-01 no
 * phase step is gated by it, and since 2026-10-05 client remarks are iteration notes, not open work items,
 * so only checklist items are counted.
 */
export type PhaseBlockerCounts = {
  /** Unchecked, blocking ROOT checklist items (subtasks never block; `is_blocking = false` only warns). */
  openRootChecklistItems: number;
};

export type BlockerItem = { id: string; text: string };

export type PhaseBlockers = {
  total: number;
  reasons: string[];
  /** Populated only in full phase detail (getPhaseDetail); empty on list views. */
  checklistItems: BlockerItem[];
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function fullBlockers(counts: PhaseBlockerCounts, items?: { checklistItems: { id: string; label: string }[] }): PhaseBlockers {
  const total = counts.openRootChecklistItems;
  return {
    total,
    reasons: total > 0 ? [`${plural(total, "checklist item")} not ticked`] : [],
    checklistItems: items?.checklistItems.map((c) => ({ id: c.id, text: c.label })) ?? [],
  };
}

/** Open to-dos (unchecked root checklist items). */
export function todoBlockers(counts: PhaseBlockerCounts): PhaseBlockers {
  const total = counts.openRootChecklistItems;
  return { total, reasons: total > 0 ? [`${plural(total, "open to-do")}`] : [], checklistItems: [] };
}
