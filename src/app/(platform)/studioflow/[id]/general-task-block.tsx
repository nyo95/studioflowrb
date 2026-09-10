"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckSquare, Plus, Square, Trash2 } from "lucide-react";
import type { ActionResult } from "@platform/core/actions";
import { Button, IconButton, InlineError, Input, SectionCard, Select, Text } from "@/platform/ui_engine";

import {
  createTaskAction,
  deleteTaskAction,
  moveTaskAction,
  setTaskCompletionAction,
  updateTaskAction,
} from "./task-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskItem = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  phase_scope?: string | null;
  sort_order?: number;
  assignee_id?: string | null;
  due_date?: string | null;
};

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ projectId, phaseScope }: { projectId: string; phaseScope: string | null }) {
  const [state, formAction, pending] = useActionState(
    createTaskAction.bind(null, projectId),
    null as ActionResult<void> | null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const failure = state?.ok === false ? state.error.safeMessage : null;

  // Reset input after successful create
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div>
      <form
        ref={formRef}
        action={formAction}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="phase_scope" value={phaseScope ?? ""} />
        <span className="text-ink-tertiary shrink-0" aria-hidden="true">
          <Plus size={14} />
        </span>
        <Input
          name="title"
          type="text"
          placeholder="Add a task…"
          required
          minLength={1}
          maxLength={255}
          disabled={pending}
          className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-tertiary outline-none border-0 focus:ring-0 py-1"
        />
      </form>
      {failure ? <InlineError>{failure}</InlineError> : null}
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  projectId,
  phases,
  position,
  total,
  users,
}: {
  task: TaskItem;
  projectId: string;
  phases: Array<{ key: string; name: string }>;
  position: number;
  total: number;
  users: Array<{ id: string; display_name: string }>;
}) {
  const [completing, completingAction] = useActionState(
    setTaskCompletionAction.bind(null, projectId, task.id, task.status === "OPEN"),
    null as ActionResult<void> | null,
  );
  const [deleting, deletingAction] = useActionState(
    deleteTaskAction.bind(null, projectId, task.id),
    null as ActionResult<void> | null,
  );
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const editFormRef = useRef<HTMLFormElement>(null);
  const [updating, updateAction] = useActionState(
    updateTaskAction.bind(null, projectId, task.id),
    null as ActionResult<void> | null,
  );
  const [moving, moveAction] = useActionState(
    moveTaskAction.bind(null, projectId, task.id),
    null as ActionResult<void> | null,
  );

  const completionError = completing?.ok === false ? completing.error.safeMessage : null;
  const deleteError = deleting?.ok === false ? deleting.error.safeMessage : null;

  useEffect(() => {
    if (!updating?.ok) return;
    const frame = requestAnimationFrame(() => setEditing(false));
    return () => cancelAnimationFrame(frame);
  }, [updating]);

  return (
    <div
      className="group flex items-center gap-2 py-2 border-b border-line last:border-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Completion toggle */}
      <form action={completingAction}>
        <IconButton
          type="submit"
          size="sm"
          variant="ghost"
          label={task.status === "OPEN" ? "Mark complete" : "Reopen"}
          className="shrink-0"
          icon={task.status === "DONE" ? <CheckSquare aria-hidden="true" className="text-success" /> : <Square aria-hidden="true" />}
        />
      </form>

      {/* Title */}
      {editing ? (
        <form ref={editFormRef} action={updateAction} className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            name="title"
            density="compact"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); editFormRef.current?.requestSubmit(); }
              if (event.key === "Escape") { event.preventDefault(); setEditing(false); setDraft(task.title); }
            }}
            autoFocus
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={updating?.ok === false}>Save</Button>
        </form>
      ) : <span
        onDoubleClick={() => setEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === "Enter") setEditing(true); }}
        className={`flex-1 min-w-0 text-sm cursor-text ${
          task.status === "DONE"
            ? "line-through text-ink-tertiary"
            : "text-ink"
        }`}
      >
        {task.title}
      </span>}

      {phases.length > 0 && (
        <form action={moveAction} className="shrink-0">
          <input type="hidden" name="sort_order" value={String(task.sort_order ?? 0)} />
          <Select
            name="phase_scope"
            density="compact"
            defaultValue={task.phase_scope ?? ""}
            aria-label="Pindahkan task"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="max-w-28"
          >
            <option value="">Umum</option>
            {phases.map((phase) => <option key={phase.key} value={phase.key}>{phase.name}</option>)}
          </Select>
        </form>
      )}

      <form action={updateAction} className="flex shrink-0 items-center gap-1">
        <Select
          name="assignee_id"
          density="compact"
          defaultValue={task.assignee_id ?? ""}
          aria-label="Penanggung jawab task"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="max-w-28"
        >
          <option value="">Tanpa PIC</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
        </Select>
      </form>
      <form action={updateAction} className="shrink-0">
        <Input
          type="date"
          name="due_date"
          density="compact"
          defaultValue={task.due_date ? task.due_date.slice(0, 10) : ""}
          aria-label="Deadline task"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="w-28"
        />
      </form>

      <div className="flex shrink-0 items-center gap-0.5">
        <form action={moveAction}>
          <input type="hidden" name="phase_scope" value={task.phase_scope ?? ""} />
          <input type="hidden" name="sort_order" value={String(Math.max(0, position - 1))} />
          <IconButton type="submit" size="sm" variant="ghost" label="Naikkan task" disabled={position === 0} className="disabled:invisible" icon={<ArrowUp aria-hidden="true" />} />
        </form>
        <form action={moveAction}>
          <input type="hidden" name="phase_scope" value={task.phase_scope ?? ""} />
          <input type="hidden" name="sort_order" value={String(Math.min(total - 1, position + 1))} />
          <IconButton type="submit" size="sm" variant="ghost" label="Turunkan task" disabled={position === total - 1} className="disabled:invisible" icon={<ArrowDown aria-hidden="true" />} />
        </form>
      </div>

      {/* Delete */}
      {hovered && (
        <form action={deletingAction}>
          <IconButton
            type="submit"
            size="sm"
            variant="ghost"
            label="Hapus task"
            className="shrink-0 hover:text-danger"
            icon={<Trash2 aria-hidden="true" />}
          />
        </form>
      )}

      {completionError || deleteError || moving?.ok === false ? (
        <InlineError>{completionError ?? deleteError ?? (moving?.ok === false ? moving.error.safeMessage : null)}</InlineError>
      ) : null}
    </div>
  );
}

// ── Block ─────────────────────────────────────────────────────────────────────

export function GeneralTaskBlock({
  projectId,
  tasks,
  canManage,
  phases = [],
  title = "TODO umum",
  phaseScope = null,
  users = [],
}: {
  projectId: string;
  tasks: TaskItem[];
  canManage: boolean;
  phases?: Array<{ key: string; name: string }>;
  title?: string;
  phaseScope?: string | null;
  users?: Array<{ id: string; display_name: string }>;
}) {
  const scopedTasks = tasks.filter((task) => (task.phase_scope ?? null) === phaseScope);
  const open = scopedTasks.filter((t) => t.status === "OPEN");
  const done = scopedTasks.filter((t) => t.status === "DONE");
  const [showDone, setShowDone] = useState(false);

  const visible = showDone ? scopedTasks : open;

  return (
    <SectionCard
      title={title}
      count={open.length > 0 ? `${open.length} terbuka` : undefined}
      padded={false}
      action={
        done.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Sembunyikan selesai" : `Lihat ${done.length} selesai`}
          </Button>
        ) : null
      }
    >
      <div className="px-(--ui-section-px)">
        {visible.length === 0 && !canManage ? (
          <Text as="p" tone="tertiary" className="py-3">No open tasks.</Text>
        ) : null}

        {visible.map((task, index) => (
          <TaskRow key={task.id} task={task} projectId={projectId} phases={phases} position={index} total={visible.length} users={users} />
        ))}

        {canManage && (
          <div className="py-2">
            <AddTaskForm projectId={projectId} phaseScope={phaseScope} />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
