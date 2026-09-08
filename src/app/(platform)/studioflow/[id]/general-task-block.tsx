"use client";

import { useActionState, useRef, useState } from "react";
import { CheckSquare, Plus, Square, Trash2 } from "lucide-react";
import type { ActionResult } from "@platform/core/actions";
import { InlineError } from "@/platform/ui_engine";

import {
  createTaskAction,
  deleteTaskAction,
  setTaskCompletionAction,
} from "./task-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskItem = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
};

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    createTaskAction.bind(null, projectId),
    null as ActionResult<void> | null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const failure = state && !state.ok ? state.error.safeMessage : null;

  return (
    <div>
      <form
        ref={formRef}
        action={async (fd: FormData) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="flex items-center gap-2"
      >
        <span className="text-[var(--color-text-tertiary)] shrink-0" aria-hidden="true">
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
          className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none border-0 focus:ring-0 py-1"
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
}: {
  task: TaskItem;
  projectId: string;
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

  const completionError = completing && !completing.ok ? completing.error.safeMessage : null;
  const deleteError = deleting && !deleting.ok ? deleting.error.safeMessage : null;

  return (
    <div
      className="group flex items-center gap-2 py-2 border-b border-[var(--color-border)] last:border-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Completion toggle */}
      <form action={completingAction}>
        <button
          type="submit"
          className="shrink-0 text-[var(--color-text-tertiary)] hover:text-action focus:outline-action"
          title={task.status === "OPEN" ? "Tandai selesai" : "Buka kembali"}
        >
          {task.status === "DONE" ? (
            <CheckSquare size={15} className="text-[var(--color-text-success)]" />
          ) : (
            <Square size={15} />
          )}
        </button>
      </form>

      {/* Title */}
      <span
        className={`flex-1 min-w-0 text-sm ${
          task.status === "DONE"
            ? "line-through text-[var(--color-text-tertiary)]"
            : "text-[var(--color-text-primary)]"
        }`}
      >
        {task.title}
      </span>

      {/* Delete */}
      {hovered && (
        <form action={deletingAction}>
          <button
            type="submit"
            className="shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-danger)] focus:outline-action"
            title="Hapus task"
          >
            <Trash2 size={13} />
          </button>
        </form>
      )}

      {completionError || deleteError ? (
        <InlineError>{completionError ?? deleteError}</InlineError>
      ) : null}
    </div>
  );
}

// ── Block ─────────────────────────────────────────────────────────────────────

export function GeneralTaskBlock({
  projectId,
  tasks,
  canManage,
}: {
  projectId: string;
  tasks: TaskItem[];
  canManage: boolean;
}) {
  const open = tasks.filter((t) => t.status === "OPEN");
  const done = tasks.filter((t) => t.status === "DONE");
  const [showDone, setShowDone] = useState(false);

  const visible = showDone ? tasks : open;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          TODO umum
          {open.length > 0 && (
            <span className="ml-1.5 text-[var(--color-text-tertiary)] font-normal normal-case tracking-normal">
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
          <p className="py-3 text-sm text-[var(--color-text-tertiary)]">Tidak ada task terbuka.</p>
        ) : null}

        {visible.map((task) => (
          <TaskRow key={task.id} task={task} projectId={projectId} />
        ))}

        {canManage && (
          <div className="py-2">
            <AddTaskForm projectId={projectId} />
          </div>
        )}
      </div>
    </div>
  );
}
