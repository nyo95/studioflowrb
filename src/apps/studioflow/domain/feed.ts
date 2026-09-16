/**
 * Today feed projection (legacy `task-feed.ts`): activities and checklist
 * items unified in the view only; each row keeps its own write path.
 */
import type { PhaseKey } from "./phase";

export type FeedSource = "activity" | "checklist";

export type FeedLabel = { id: string; name: string; color: string };

export type FeedTask = {
  key: string;
  id: string;
  source: FeedSource;
  label: string;
  isChecked: boolean;
  projectId: string;
  phaseId: string | null;
  phaseKey: PhaseKey | null;
  phaseLabel: string | null;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
  labels: FeedLabel[];
  mode: "TODO" | "FEEDBACK" | null;
  templateId: string | null;
  parentId: string | null;
  children: FeedTask[];
};

export type FeedProject = { id: string; name: string; isUrgent: boolean };

export type FeedGroup = { project: FeedProject; tasks: FeedTask[] };

/** Nests checklist subtasks; activities stay flat. Orphans are promoted. */
export function nestFeed(tasks: readonly FeedTask[]): FeedTask[] {
  const roots: FeedTask[] = [];
  const byId = new Map<string, FeedTask>();
  for (const task of tasks) {
    if (task.source !== "checklist" || task.parentId === null) {
      const node = { ...task, children: [] };
      byId.set(`${task.source}:${task.id}`, node);
      roots.push(node);
    }
  }
  for (const task of tasks) {
    if (task.source !== "checklist" || task.parentId === null) continue;
    const parent = byId.get(`checklist:${task.parentId}`);
    if (parent) parent.children.push({ ...task, children: [] });
    else roots.push({ ...task, children: [] });
  }
  return roots;
}

/** Open first; dated before undated (earliest first); then priority; then input order. */
export function sortFeed(tasks: readonly FeedTask[]): FeedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.priority - b.priority;
  });
}

/** Projects drive the groups, so an empty plate still shows the project. */
export function groupFeed(projects: readonly FeedProject[], tasks: readonly FeedTask[]): FeedGroup[] {
  const groups = new Map<string, FeedGroup>();
  for (const project of projects) groups.set(project.id, { project, tasks: [] });
  for (const task of tasks) groups.get(task.projectId)?.tasks.push(task);
  return [...groups.values()].map((group) => ({ ...group, tasks: sortFeed(group.tasks) }));
}

/** Open work = open rows plus their open subtasks. */
export function countOpen(tasks: readonly FeedTask[]): number {
  let total = 0;
  for (const task of tasks) {
    if (!task.isChecked) total += 1;
    total += task.children.filter((child) => !child.isChecked).length;
  }
  return total;
}
