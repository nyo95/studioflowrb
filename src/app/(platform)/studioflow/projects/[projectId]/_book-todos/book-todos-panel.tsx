"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ActionResult } from "@platform/core/actions";
import { formatDateOnly } from "@platform/utilities/date";
import { Button, Checkbox, IconButton, InlineError, Input, SectionCard, Select, StatusBadge, Text, useConfirm } from "@/platform/ui_engine";

import {
  createBookTodoAction,
  deleteBookTodoAction,
  reorderBookTodosAction,
  setBookTodoDoneAction,
  updateBookTodoAction,
} from "../../../actions";

type Todo = { id: string; label: string; assigneeId: string | null; assigneeName: string | null; dueDate: string | null; done: boolean; version: number };
type Assignee = { id: string; name: string };

/** A stale or out-of-step list is not the person's mistake: say so and show the latest. */
const RELOAD_CODES = new Set(["BOOK_TODO_STALE", "BOOK_TODO_ORDER_INVALID", "BOOK_TODO_NOT_FOUND"]);

export function BookTodosPanel({ projectId, todos, assignees, canWrite, today, locale, currentUserId }: {
  projectId: string;
  todos: readonly Todo[];
  assignees: readonly Assignee[];
  canWrite: boolean;
  /** `YYYY-MM-DD` in the platform time zone. */
  today: string;
  /** BCP-47 locale from platform general settings. */
  locale: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const open = todos.filter((todo) => !todo.done);
  const done = todos.filter((todo) => todo.done);
  const [expanded, setExpanded] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [assigneeId, setAssigneeId] = useState(assignees.some((person) => person.id === currentUserId) ? currentUserId : "");
  const [dueDate, setDueDate] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const run = async (key: string, action: () => Promise<ActionResult<unknown>>) => {
    setBusy(key);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      const reload = RELOAD_CODES.has(result.error.code);
      setError(reload ? "Someone changed this list at the same time. It was reloaded; try again." : result.error.safeMessage);
      if (reload) router.refresh();
      return false;
    }
    router.refresh();
    return true;
  };

  const add = async () => {
    if (!label.trim()) return;
    const ok = await run("add", () => createBookTodoAction({ projectId, label, assigneeId: assigneeId || null, dueDate: dueDate || null }));
    if (ok) { setLabel(""); setDueDate(""); }
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = open.map((todo) => todo.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run("move", () => reorderBookTodosAction({ projectId, orderedIds: ids }));
  };

  const remove = async (todo: Todo) => {
    const ok = await confirm.confirm({ title: "Delete this to-do?", description: todo.label, confirmLabel: "Delete", tone: "danger" });
    if (ok) await run(todo.id, () => deleteBookTodoAction({ projectId, todoId: todo.id }));
  };

  const saveLabel = async (todo: Todo) => {
    setEditing(null);
    if (draft.trim() && draft.trim() !== todo.label) await run(todo.id, () => updateBookTodoAction({ projectId, todoId: todo.id, version: todo.version, label: draft }));
  };

  const row = (todo: Todo, index: number) => {
    const late = !todo.done && todo.dueDate !== null && todo.dueDate < today;
    const editable = canWrite && !todo.done;
    return (
      <li key={todo.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-line-subtle px-3 py-2 last:border-b-0 min-[560px]:flex min-[560px]:flex-nowrap">
        <Checkbox
          checked={todo.done}
          disabled={!canWrite || busy === todo.id}
          onCheckedChange={(next) => void run(todo.id, () => setBookTodoDoneAction({ projectId, todoId: todo.id, done: next === true, version: todo.version }))}
          label={<span className="sr-only">{todo.done ? "Reopen" : "Mark done"}: {todo.label}</span>}
        />
        <div className="min-w-0 flex-1">
          {editing === todo.id ? (
            <Input
              density="compact"
              autoFocus
              value={draft}
              maxLength={200}
              aria-label="To-do"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void saveLabel(todo)}
              onKeyDown={(event) => { if (event.key === "Enter") void saveLabel(todo); if (event.key === "Escape") setEditing(null); }}
            />
          ) : editable ? (
            <button type="button" className="line-clamp-2 w-full text-left text-sm hover:underline" title={todo.label} onClick={() => { setEditing(todo.id); setDraft(todo.label); }}>{todo.label}</button>
          ) : (
            <span className={`line-clamp-2 text-sm ${todo.done ? "text-ink-tertiary line-through" : ""}`} title={todo.label}>{todo.label}</span>
          )}
        </div>
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 pl-10 min-[560px]:contents">
          {editable ? (
            <Select density="compact" className="!w-36 shrink-0" aria-label="Assignee" value={todo.assigneeId ?? ""} disabled={busy === todo.id} onChange={(event) => void run(todo.id, () => updateBookTodoAction({ projectId, todoId: todo.id, version: todo.version, assigneeId: event.target.value || null }))}>
              <option value="">Nobody</option>
              {assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              {todo.assigneeId && !assignees.some((person) => person.id === todo.assigneeId) ? <option value={todo.assigneeId}>{todo.assigneeName ?? "Former member"}</option> : null}
            </Select>
          ) : (
            <Text size="sm" tone="secondary" className="w-36 shrink-0">{todo.assigneeName ?? (todo.assigneeId ? "Former member" : "Nobody")}</Text>
          )}
          {editable ? (
            <Input density="compact" type="date" lang={locale} className="!w-36 shrink-0" aria-label="Due date" value={todo.dueDate ?? ""} disabled={busy === todo.id} onChange={(event) => void run(todo.id, () => updateBookTodoAction({ projectId, todoId: todo.id, version: todo.version, dueDate: event.target.value || null }))} />
          ) : (
            <Text size="sm" tone="secondary" className="w-36 shrink-0">{todo.dueDate ? formatDateOnly(todo.dueDate, { locale }) : "—"}</Text>
          )}
          <span className="flex w-14 shrink-0 items-center">
            {late ? <StatusBadge tone="danger">Late</StatusBadge> : null}
          </span>
          {editable ? (
            <span className="flex items-center">
              <IconButton size="sm" variant="ghost" className="max-[559px]:!min-h-10 max-[559px]:!w-10" label="Move up" icon={<ArrowUp aria-hidden="true" />} disabled={index === 0 || busy !== null} onClick={() => move(index, -1)} />
              <IconButton size="sm" variant="ghost" className="max-[559px]:!min-h-10 max-[559px]:!w-10" label="Move down" icon={<ArrowDown aria-hidden="true" />} disabled={index === open.length - 1 || busy !== null} onClick={() => move(index, 1)} />
            </span>
          ) : null}
          {canWrite ? <IconButton size="sm" variant="ghost" className="max-[559px]:!min-h-10 max-[559px]:!w-10" label="Delete to-do" icon={<Trash2 aria-hidden="true" />} disabled={busy === todo.id} onClick={() => void remove(todo)} /> : null}
        </div>
      </li>
    );
  };

  return (
    <SectionCard
      padded={false}
      className="shrink-0"
      title="To-dos"
      count={open.length}
      action={<IconButton size="sm" variant="ghost" label={expanded ? "Collapse to-dos" : "Expand to-dos"} icon={expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />} onClick={() => setExpanded((value) => !value)} />}
    >
      {expanded ? (
        <div>
          {open.length === 0 ? <Text as="p" size="sm" tone="secondary" className="px-3 py-3">Nothing to do right now.</Text> : <ul className="m-0 max-h-60 list-none overflow-y-auto p-0">{open.map(row)}</ul>}
          {canWrite ? (
            <form className="flex flex-wrap items-center gap-2 border-t border-line-subtle px-3 py-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
              <Input density="compact" className="min-w-48 flex-1" placeholder="Add a to-do…" aria-label="New to-do" value={label} maxLength={200} onChange={(event) => setLabel(event.target.value)} />
              <Select density="compact" className="!w-36 shrink-0" aria-label="Assign to" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Nobody</option>
                {assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select>
              <Input density="compact" type="date" lang={locale} className="!w-36 shrink-0" aria-label="Due date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <Button size="sm" variant="primary" type="submit" disabled={!label.trim()} pending={busy === "add"}>Add</Button>
            </form>
          ) : <Text as="p" size="sm" tone="secondary" className="border-t border-line-subtle px-3 py-2">To-dos can’t be changed while the project is in this state.</Text>}
          {done.length > 0 ? (
            <div className="border-t border-line-subtle">
              <button type="button" className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm text-ink-secondary" onClick={() => setShowDone((value) => !value)} aria-expanded={showDone}>
                {showDone ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
                Done ({done.length})
              </button>
              {showDone ? <ul className="m-0 max-h-48 list-none overflow-y-auto p-0">{done.map(row)}</ul> : null}
            </div>
          ) : null}
          {error ? <div className="px-3 pb-2"><InlineError>{error}</InlineError></div> : null}
        </div>
      ) : null}
      {confirm.dialog}
    </SectionCard>
  );
}
