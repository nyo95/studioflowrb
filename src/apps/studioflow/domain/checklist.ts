/**
 * Checklist rules ported from legacy `checklist-task.ts`,
 * `checklist-filter-rules.ts`, and `lib/constants.ts`.
 */
export const CHECKLIST_SORT_STEP = 10;
export const MAX_CHECKLIST_DEPTH = 1;
export const CHECKLIST_LABEL_MAX_LENGTH = 200;

type TreeInput = { id: string; parentId: string | null };

/**
 * Nests subtasks under parents, keeping input order. A subtask whose parent is
 * absent is promoted to a root instead of being dropped.
 */
export function buildTree<T extends TreeInput>(tasks: readonly T[]): Array<T & { children: T[] }> {
  const roots: Array<T & { children: T[] }> = [];
  const byId = new Map<string, T & { children: T[] }>();
  for (const task of tasks) {
    if (task.parentId === null) {
      const node = { ...task, children: [] as T[] };
      byId.set(task.id, node);
      roots.push(node);
    }
  }
  for (const task of tasks) {
    if (task.parentId === null) continue;
    const parent = byId.get(task.parentId);
    if (parent) parent.children.push(task);
    else roots.push({ ...task, children: [] });
  }
  return roots;
}

/** Stepped sort orders for an ordered id list: 10, 20, 30… */
export function steppedSortOrders(ids: readonly string[]): Array<{ id: string; sortOrder: number }> {
  return ids.map((id, index) => ({ id, sortOrder: (index + 1) * CHECKLIST_SORT_STEP }));
}

/**
 * Cascade rule for toggling (legacy `executeToggleChecklist`): a parent's new
 * state is pushed down to every child in both directions; children never roll
 * up into the parent.
 */
export function cascadeTargets(item: { id: string; parentId: string | null }, childIds: readonly string[]): string[] {
  return item.parentId === null ? [item.id, ...childIds] : [item.id];
}

/**
 * Who may tick a checklist item (one rule for the service and every screen). A root item of a phase is a
 * requirement, a reminder that gates nothing, so phase-work access is enough; anything else — a general
 * to-do or a subtask — needs task-manage access.
 */
export function canTickChecklistItem(item: { parentId: string | null; phaseId: string | null }, access: { canManageTasks: boolean; canWork: boolean }): boolean {
  if (access.canManageTasks) return true;
  return access.canWork && item.parentId === null && item.phaseId !== null;
}
