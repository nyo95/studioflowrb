/**
 * Checklist rules ported from legacy `checklist-task.ts`,
 * `checklist-filter-rules.ts`, and `lib/constants.ts`.
 */
export const CHECKLIST_SORT_STEP = 10;
export const MAX_CHECKLIST_DEPTH = 1;
export const CHECKLIST_PRIORITY_NONE = 4;
export const CHECKLIST_LABEL_MAX_LENGTH = 200;
export const CHECKLIST_PRIORITIES = [1, 2, 3, 4] as const;

export const CHECKLIST_FILTERS = ["all", "today", "overdue", "p1", "mine"] as const;
export type ChecklistFilter = (typeof CHECKLIST_FILTERS)[number];

export function isChecklistFilter(value: string): value is ChecklistFilter {
  return (CHECKLIST_FILTERS as readonly string[]).includes(value);
}

export type ChecklistFilterQuery = {
  status: "OPEN" | "COMPLETED";
  priority: "P1" | null;
  assignee: "ME" | null;
  due: "TODAY_OR_EARLIER" | "OVERDUE" | null;
};

export type FilterableTask = {
  isChecked: boolean;
  /** `YYYY-MM-DD` or null. */
  dueDate: string | null;
  priority: number;
  assigneeId: string | null;
};

/** Built-in views. `today` is the studio calendar date `YYYY-MM-DD`. */
export function applyChecklistFilter<T extends FilterableTask>(
  tasks: readonly T[],
  filter: ChecklistFilter,
  currentUserId: string | null,
  today: string,
): T[] {
  if (filter === "all") return [...tasks];
  return tasks.filter((task) => {
    switch (filter) {
      case "today":
        return task.dueDate !== null && task.dueDate <= today;
      case "overdue":
        return !task.isChecked && task.dueDate !== null && task.dueDate < today;
      case "p1":
        return task.priority === 1 && !task.isChecked;
      case "mine":
        return currentUserId !== null && task.assigneeId === currentUserId;
      default:
        return true;
    }
  });
}

export function countChecklistFilters<T extends FilterableTask>(
  tasks: readonly T[],
  currentUserId: string | null,
  today: string,
): Record<ChecklistFilter, number> {
  return {
    all: tasks.length,
    today: applyChecklistFilter(tasks, "today", currentUserId, today).length,
    overdue: applyChecklistFilter(tasks, "overdue", currentUserId, today).length,
    p1: applyChecklistFilter(tasks, "p1", currentUserId, today).length,
    mine: applyChecklistFilter(tasks, "mine", currentUserId, today).length,
  };
}

export function toChecklistFilterQuery(filter: ChecklistFilter, showCompleted: boolean): ChecklistFilterQuery {
  return {
    status: showCompleted ? "COMPLETED" : "OPEN",
    priority: filter === "p1" ? "P1" : null,
    assignee: filter === "mine" ? "ME" : null,
    due: filter === "today" ? "TODAY_OR_EARLIER" : filter === "overdue" ? "OVERDUE" : null,
  };
}

export function fromChecklistFilterQuery(query: ChecklistFilterQuery): { filter: ChecklistFilter; showCompleted: boolean } {
  let filter: ChecklistFilter = "all";
  if (query.due === "OVERDUE") filter = "overdue";
  else if (query.due === "TODAY_OR_EARLIER") filter = "today";
  else if (query.priority === "P1") filter = "p1";
  else if (query.assignee === "ME") filter = "mine";
  return { filter, showCompleted: query.status === "COMPLETED" };
}

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
