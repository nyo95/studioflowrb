"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDateOnly } from "@platform/utilities/date";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { Checkbox, InlineError, SectionCard, Text } from "@/platform/ui_engine";

import { setBookTodoDoneAction } from "../actions";

export type MyTaskRow = { id: string; projectId: string; projectName: string; label: string; dueDate: string | null; version: number };

/**
 * "My tasks" on Home (WO-SF-BOOK-02): the person's own open to-dos across the books they read, grouped by project.
 * Late is decided here, against today's date in the platform time zone, never on the server.
 */
export function MyTasks({ tasks, today }: { tasks: readonly MyTaskRow[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (tasks.length === 0) return null;

  const groups = new Map<string, { name: string; rows: MyTaskRow[] }>();
  for (const task of tasks) {
    const group = groups.get(task.projectId) ?? { name: task.projectName, rows: [] };
    group.rows.push(task);
    groups.set(task.projectId, group);
  }
  const lateCount = tasks.filter((task) => task.dueDate !== null && task.dueDate < today).length;

  const complete = async (task: MyTaskRow) => {
    setBusy(task.id);
    setError(null);
    const result = await setBookTodoDoneAction({ projectId: task.projectId, todoId: task.id, done: true, version: task.version });
    setBusy(null);
    if (!result.ok) setError(result.error.code === "BOOK_TODO_STALE" ? "Someone changed this to-do. The list was reloaded." : result.error.safeMessage);
    router.refresh();
  };

  return (
    <SectionCard title="My tasks" count={tasks.length} description={lateCount > 0 ? `${lateCount} late` : undefined} padded={false}>
      <div className="grid gap-3 px-3 py-3 md:grid-cols-2 xl:grid-cols-3">
        {[...groups.entries()].map(([projectId, group]) => (
          <div key={projectId} className="min-w-0">
            <Link href={STUDIOFLOW_ROUTES.project(projectId)} className="block truncate text-sm font-medium hover:underline">{group.name}</Link>
            <ul className="m-0 mt-1 list-none p-0">
              {group.rows.map((task) => {
                const late = task.dueDate !== null && task.dueDate < today;
                return (
                  <li key={task.id} className="flex items-center gap-2 py-1">
                    <Checkbox checked={false} disabled={busy === task.id} onCheckedChange={() => void complete(task)} label={<span className="sr-only">Mark done: {task.label}</span>} />
                    <span className="min-w-0 flex-1 truncate text-sm">{task.label}</span>
                    {task.dueDate ? <Text size="sm" tone="secondary">{formatDateOnly(task.dueDate)}</Text> : null}
                    {late ? <span className="inline-flex h-5 items-center rounded-pill bg-danger-subtle px-2 text-xs text-danger">Late</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {error ? <div className="px-3 pb-3"><InlineError>{error}</InlineError></div> : null}
    </SectionCard>
  );
}
