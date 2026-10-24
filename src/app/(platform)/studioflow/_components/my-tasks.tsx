"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { diffDateOnlyDays, formatDateOnly } from "@platform/utilities/date";
import { STUDIOFLOW_ROUTES } from "@/apps/studioflow/public";
import { Checkbox, GroupHeader, InlineError, SectionCard, StatusBadge, Text } from "@/platform/ui_engine";

import { setBookTodoDoneAction } from "../actions";

export type MyTaskRow = { id: string; projectId: string; projectName: string; label: string; dueDate: string | null; version: number };

/**
 * "My tasks" on Home (WO-SF-BOOK-02): the person's own open to-dos across the books they read, grouped by urgency.
 * Late is decided here, against today's date in the platform time zone, never on the server.
 */
export function MyTasks({ tasks, today, locale }: { tasks: readonly MyTaskRow[]; today: string; locale: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (tasks.length === 0) return null;

  const groups: Array<{ key: "late" | "week" | "later"; label: string; tone: "danger" | "neutral"; rows: MyTaskRow[] }> = [
    { key: "late", label: "Late", tone: "danger", rows: [] },
    { key: "week", label: "This week", tone: "neutral", rows: [] },
    { key: "later", label: "Later", tone: "neutral", rows: [] },
  ];
  for (const task of tasks) {
    const days = task.dueDate === null ? null : diffDateOnlyDays(today, task.dueDate);
    groups[days !== null && days < 0 ? 0 : days !== null && days <= 7 ? 1 : 2]!.rows.push(task);
  }
  const lateCount = groups[0].rows.length;

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
      <div className="grid gap-4 px-3 py-3">
        {groups.filter((group) => group.rows.length > 0).map((group) => (
          <div key={group.key} className="min-w-0">
            <GroupHeader title={group.label} count={group.rows.length} tone={group.tone} />
            <ul className="m-0 mt-1 list-none divide-y divide-line-subtle p-0">
              {group.rows.map((task) => {
                const late = task.dueDate !== null && task.dueDate < today;
                return (
                  <li key={task.id} className="flex items-start gap-2 py-2">
                    <Checkbox checked={false} disabled={busy === task.id} onCheckedChange={() => void complete(task)} label={<span className="sr-only">Mark done: {task.label}</span>} />
                    <div className="min-w-0 flex-1">
                      <Link href={STUDIOFLOW_ROUTES.project(task.projectId)} className="line-clamp-2 text-sm font-medium text-ink hover:underline" title={task.label}>{task.label}</Link>
                      <Text as="p" size="sm" tone="tertiary" className="line-clamp-2" title={task.projectName}>
                        {task.projectName}{task.dueDate ? ` · ${late ? "was due" : "due"} ${formatDateOnly(task.dueDate, { locale })}` : ""}
                      </Text>
                    </div>
                    <span className="flex w-14 shrink-0 justify-end pt-0.5">{late ? <StatusBadge tone="danger">Late</StatusBadge> : null}</span>
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
