"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckSquare, Plus, Square, Trash2 } from "lucide-react";
import type { ActionResult } from "@platform/core/actions";
import { InlineError } from "@/platform/ui_engine";

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
        <input
          name="title"
          type="text"
          placeholder="Tambah task…"
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
        <button
          type="submit"
          className="shrink-0 text-ink-tertiary hover:text-action focus:outline-action"
          title={task.status === "OPEN" ? "Tandai selesai" : "Buka kembali"}
        >
          {task.status === "DONE" ? (
            <CheckSquare size={15} className="text-success" />
          ) : (
            <Square size={15} />
          )}
        </button>
      </form>

      {/* Title */}
      {editing ? (
        <form ref={editFormRef} action={updateAction} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            name="title"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); editFormRef.current?.requestSubmit(); }
              if (event.key === "Escape") { event.preventDefault(); setEditing(false); setDraft(task.title); }
            }}
            autoFocus
            className="min-w-0 flex-1 rounded-action border border-line bg-transparent px-2 py-1 text-sm text-ink outline-none"
          />
          <button type="submit" className="text-xs text-action hover:underline" disabled={updating?.ok === false}>Simpan</button>
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
          <select
            name="phase_scope"
            defaultValue={task.phase_scope ?? ""}
            aria-label="Pindahkan task"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="max-w-28 rounded-action border border-line bg-transparent px-1.5 py-1 text-[11px] text-ink-secondary"
          >
            <option value="">Umum</option>
            {phases.map((phase) => <option key={phase.key} value={phase.key}>{phase.name}</option>)}
          </select>
        </form>
      )}

      <form action={updateAction} className="flex shrink-0 items-center gap-1">
        <select
          name="assignee_id"
          defaultValue={task.assignee_id ?? ""}
          aria-label="Penanggung jawab task"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="max-w-28 rounded-action border border-line bg-transparent px-1.5 py-1 text-[11px] text-ink-secondary"
        >
          <option value="">Tanpa PIC</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
        </select>
      </form>
      <form action={updateAction} className="shrink-0">
        <input
          type="date"
          name="due_date"
          defaultValue={task.due_date ? task.due_date.slice(0, 10) : ""}
          aria-label="Deadline task"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="w-28 rounded-action border border-line bg-transparent px-1.5 py-1 text-[11px] text-ink-secondary"
        />
      </form>

      <div className="flex shrink-0 items-center gap-0.5">
        <form action={moveAction}>
          <input type="hidden" name="phase_scope" value={task.phase_scope ?? ""} />
          <input type="hidden" name="sort_order" value={String(Math.max(0, position - 1))} />
          <button type="submit" disabled={position === 0} className="text-ink-tertiary hover:text-action disabled:invisible" title="Naikkan task">
            <ArrowUp size={12} />
          </button>
        </form>
        <form action={moveAction}>
          <input type="hidden" name="phase_scope" value={task.phase_scope ?? ""} />
          <input type="hidden" name="sort_order" value={String(Math.min(total - 1, position + 1))} />
          <button type="submit" disabled={position === total - 1} className="text-ink-tertiary hover:text-action disabled:invisible" title="Turunkan task">
            <ArrowDown size={12} />
          </button>
        </form>
      </div>

      {/* Delete */}
      {hovered && (
        <form action={deletingAction}>
          <button
            type="submit"
            className="shrink-0 text-ink-tertiary hover:text-danger focus:outline-action"
            title="Hapus task"
          >
            <Trash2 size={13} />
          </button>
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
    <div className="rounded-card border border-line bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-surface-muted">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          {title}
          {open.length > 0 && (
            <span className="ml-1.5 text-ink-tertiary font-normal normal-case tracking-normal">
              {open.length} terbuka
            </span>
          )}
        </h2>
        {done.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs text-action hover:underline"
          >
            {showDone ? "Sembunyikan selesai" : `Lihat ${done.length} selesai`}
          </button>
        )}
      </div>

      {/* Rows */}
      <div className="px-4">
        {visible.length === 0 && !canManage ? (
          <p className="py-3 text-sm text-ink-tertiary">Tidak ada task terbuka.</p>
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
    </div>
  );
}
