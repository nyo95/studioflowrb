import { randomUUID } from "node:crypto";

import { AppError } from "@platform/core/errors";
import type { Prisma } from "@/generated/prisma/client";
import { isDateOnlyString } from "@platform/utilities/date";

import { CHECKLIST_LABEL_MAX_LENGTH } from "../domain/checklist";
import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import {
  P,
  assertProjectWritable,
  bookForbidden,
  conflict,
  getProjectAccess,
  invalid,
  notFound,
  nowOf,
  requireCommand,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type StudioFlowPorts,
  type TxClient,
  type WorkSectionReadContext,
} from "../shared";

/**
 * To-dos of the Project book (WO-SF-BOOK-02, owner 2026-10-23/24). A to-do is its own small record, never a phase
 * checklist item: it has a person and a date, and it can never block an approval, a phase or a completion. Every read
 * and write needs a book reader of the project (a PIC or an invited member); managers, override holders and the
 * Platform Owner are not book readers.
 */

/** Done to-dos shown beside a project's open ones. */
export const BOOK_TODO_DONE_LIMIT = 50;
/** Rows of the cross-project "My tasks" read. */
export const BOOK_MY_TASKS_LIMIT = 200;

type ProjectInput = CommandContext & { projectId: string };

const TODO_SELECT = { id: true, project_id: true, label: true, assignee_id: true, due_date: true, done_at: true, source_card_id: true, created_by_id: true, created_by_name: true, created_at: true, sort_order: true, version: true } satisfies Prisma.SfBookTodoSelect;
type TodoRow = Prisma.SfBookTodoGetPayload<{ select: typeof TODO_SELECT }>;

export type BookTodoView = {
  id: string;
  projectId: string;
  label: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** `YYYY-MM-DD`, the project's date-only convention. */
  dueDate: string | null;
  doneAt: Date | null;
  sourceCardId: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  sortOrder: number;
  version: number;
};

export type MyTaskView = { id: string; projectId: string; projectName: string; label: string; dueDate: string | null; sourceCardId: string | null; version: number };

function todoNotFound() {
  return new AppError("NOT_FOUND", "BOOK_TODO_NOT_FOUND", "This to-do no longer exists.");
}

function staleTodo() {
  return conflict("BOOK_TODO_STALE", "Someone changed this to-do in the meantime. Reload to see the latest version.");
}

function dueDateOf(value: string | null | undefined): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isDateOnlyString(value)) throw invalid("BOOK_TODO_DUE_INVALID", "The due date must be a real date.");
  return dateOnlyToDate(value);
}

export function createBookTodoService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  /**
   * The gate of every write: a book reader of an open project. An invited member writes under the same rule as a
   * member's note (project active); a PIC needs only the project open, since a to-do carries no phase.
   * Serialises order changes of the project.
   */
  async function writableBook(tx: TxClient, input: ProjectInput) {
    const actorId = requireCommand(input, P.phaseWork);
    await tx.$queryRaw`SELECT id FROM studioflow.sf_project WHERE id = ${input.projectId} FOR UPDATE`;
    const access = await getProjectAccess(tx, { grants: input.grants, actorId, projectId: input.projectId });
    if (!access.canReadBook) throw bookForbidden();
    const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true, archived_at: true, status: true, pic_designer_id: true, pic_drafter_id: true } });
    if (!project) throw notFound("project");
    assertProjectWritable(project);
    if (access.isBookMember && project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing its notes.");
    return { actorId, project };
  }

  async function loadTodo(tx: TxClient, input: ProjectInput & { todoId: string }): Promise<TodoRow> {
    const todo = await tx.sfBookTodo.findFirst({ where: { id: input.todoId, project_id: input.projectId }, select: TODO_SELECT });
    if (!todo) throw todoNotFound();
    return todo;
  }

  /** The assignee must read the book now: a PIC of the project or an invited member. */
  async function requireAssigneeReader(tx: TxClient, project: { id: string; pic_designer_id: string | null; pic_drafter_id: string | null }, assigneeId: string) {
    if (project.pic_designer_id === assigneeId || project.pic_drafter_id === assigneeId) return;
    const member = await tx.sfBookMember.findUnique({ where: { project_id_user_id: { project_id: project.id, user_id: assigneeId } }, select: { id: true } });
    if (!member) throw invalid("BOOK_TODO_ASSIGNEE_NOT_READER", "Assign a to-do only to the project's designer, drafter or an invited member.");
  }

  async function views(rows: readonly TodoRow[]): Promise<BookTodoView[]> {
    const ids = [...new Set(rows.flatMap((row) => (row.assignee_id ? [row.assignee_id] : [])))];
    const people = new Map((ids.length ? await ports.people.resolve(ids) : []).map((person) => [person.id, person.displayName]));
    return rows.map((row) => ({
      id: row.id, projectId: row.project_id, label: row.label, assigneeId: row.assignee_id, assigneeName: row.assignee_id ? people.get(row.assignee_id) ?? null : null,
      dueDate: dateToDateOnly(row.due_date), doneAt: row.done_at, sourceCardId: row.source_card_id, createdById: row.created_by_id, createdByName: row.created_by_name,
      createdAt: row.created_at, sortOrder: row.sort_order, version: row.version,
    }));
  }

  async function audit(tx: TxClient, input: ProjectInput, action: string, todoId: string, extra: { changes?: Record<string, { from: unknown; to: unknown }>; metadata?: Record<string, unknown> } = {}) {
    await writeAudit(ports, tx, { action: `studioflow.book-todo.${action}`, entityType: "book-todo", entityId: todoId, actor: input.actor, changes: extra.changes, metadata: { projectId: input.projectId, ...extra.metadata } });
  }

  return {
    /** Open to-dos in order, then the most recent done ones. A non-reader gets exactly the answer for an unknown project. */
    async listProjectTodos(input: WorkSectionReadContext & { projectId: string }): Promise<BookTodoView[]> {
      requireRead(input.grants);
      const access = await getProjectAccess(db, input);
      if (!access.canReadBook) throw notFound("project");
      const open = await db.sfBookTodo.findMany({ where: { project_id: input.projectId, done_at: null }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }], select: TODO_SELECT });
      const done = await db.sfBookTodo.findMany({ where: { project_id: input.projectId, done_at: { not: null } }, orderBy: [{ done_at: "desc" }, { id: "desc" }], take: BOOK_TODO_DONE_LIMIT, select: TODO_SELECT });
      return views([...open, ...done]);
    },

    /**
     * The caller's own open to-dos across every non-archived project whose book they read: those assigned to them, and
     * unassigned ones they created. Late-ness is the screen's business (it knows today's date in the platform zone).
     */
    async listMyTasks(input: WorkSectionReadContext): Promise<MyTaskView[]> {
      requireRead(input.grants);
      const actorId = input.actorId;
      const rows = await db.sfBookTodo.findMany({
        where: {
          done_at: null,
          OR: [{ assignee_id: actorId }, { assignee_id: null, created_by_id: actorId }],
          project: { archived_at: null, OR: [{ pic_designer_id: actorId }, { pic_drafter_id: actorId }, { book_members: { some: { user_id: actorId } } }] },
        },
        orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }, { id: "asc" }],
        take: BOOK_MY_TASKS_LIMIT,
        select: { id: true, label: true, due_date: true, source_card_id: true, version: true, project: { select: { id: true, name: true } } },
      });
      return rows.map((row) => ({ id: row.id, projectId: row.project.id, projectName: row.project.name, label: row.label, dueDate: dateToDateOnly(row.due_date), sourceCardId: row.source_card_id, version: row.version }));
    },

    async createTodo(input: ProjectInput & { label: string; assigneeId?: string | null; dueDate?: string | null }) {
      const label = requiredText(input.label, "BOOK_TODO_LABEL_REQUIRED", "To-do", CHECKLIST_LABEL_MAX_LENGTH);
      const dueDate = dueDateOf(input.dueDate);
      return runTransaction(async (tx) => {
        const { actorId, project } = await writableBook(tx, input);
        const assigneeId = input.assigneeId || null;
        if (assigneeId) await requireAssigneeReader(tx, project, assigneeId);
        const last = await tx.sfBookTodo.aggregate({ where: { project_id: input.projectId, done_at: null }, _max: { sort_order: true } });
        const created = await tx.sfBookTodo.create({
          data: { id: randomUUID(), project_id: input.projectId, label, assignee_id: assigneeId, due_date: dueDate, created_by_id: actorId, created_by_name: input.actor.label, created_at: nowOf(ports), sort_order: (last._max.sort_order ?? -1) + 1 },
          select: { id: true, version: true },
        });
        await audit(tx, input, "created", created.id, { metadata: { assigneeId, dueDate: dateToDateOnly(dueDate) } });
        return { todoId: created.id, version: created.version };
      });
    },

    /** Label, assignee and due date; only the fields given change (`null` clears an assignee or a due date). */
    async updateTodo(input: ProjectInput & { todoId: string; version: number; label?: string; assigneeId?: string | null; dueDate?: string | null }) {
      const label = input.label === undefined ? undefined : requiredText(input.label, "BOOK_TODO_LABEL_REQUIRED", "To-do", CHECKLIST_LABEL_MAX_LENGTH);
      const dueDate = input.dueDate === undefined ? undefined : dueDateOf(input.dueDate);
      return runTransaction(async (tx) => {
        const { project } = await writableBook(tx, input);
        const todo = await loadTodo(tx, input);
        if (todo.version !== input.version) throw staleTodo();
        const assigneeId = input.assigneeId === undefined ? undefined : input.assigneeId || null;
        if (assigneeId && assigneeId !== todo.assignee_id) await requireAssigneeReader(tx, project, assigneeId);
        const data: Prisma.SfBookTodoUpdateManyMutationInput = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (label !== undefined && label !== todo.label) { data.label = label; changes.label = { from: todo.label, to: label }; }
        if (assigneeId !== undefined && assigneeId !== todo.assignee_id) { data.assignee_id = assigneeId; changes.assigneeId = { from: todo.assignee_id, to: assigneeId }; }
        if (dueDate !== undefined && dateToDateOnly(dueDate) !== dateToDateOnly(todo.due_date)) { data.due_date = dueDate; changes.dueDate = { from: dateToDateOnly(todo.due_date), to: dateToDateOnly(dueDate) }; }
        if (!Object.keys(changes).length) return { todoId: todo.id, version: todo.version };
        const updated = await tx.sfBookTodo.updateMany({ where: { id: todo.id, version: todo.version }, data: { ...data, version: { increment: 1 } } });
        if (updated.count !== 1) throw staleTodo();
        await audit(tx, input, "updated", todo.id, { changes });
        return { todoId: todo.id, version: todo.version + 1 };
      });
    },

    /** Done or not done. Repeating the state it already has is a no-op; a given `version` must still be current. */
    async setTodoDone(input: ProjectInput & { todoId: string; done: boolean; version?: number }) {
      return runTransaction(async (tx) => {
        await writableBook(tx, input);
        const todo = await loadTodo(tx, input);
        if (input.version !== undefined && input.version !== todo.version) throw staleTodo();
        if (Boolean(todo.done_at) === input.done) return { todoId: todo.id, version: todo.version };
        const updated = await tx.sfBookTodo.updateMany({ where: { id: todo.id, version: todo.version }, data: { done_at: input.done ? nowOf(ports) : null, version: { increment: 1 } } });
        if (updated.count !== 1) throw staleTodo();
        await audit(tx, input, input.done ? "done" : "reopened", todo.id);
        return { todoId: todo.id, version: todo.version + 1 };
      });
    },

    /** The new order of the project's open to-dos: every open to-do exactly once. */
    async reorderTodos(input: ProjectInput & { orderedIds: readonly string[] }) {
      return runTransaction(async (tx) => {
        await writableBook(tx, input);
        const open = await tx.sfBookTodo.findMany({ where: { project_id: input.projectId, done_at: null }, select: { id: true, sort_order: true } });
        const known = new Set(open.map((row) => row.id));
        if (new Set(input.orderedIds).size !== input.orderedIds.length || input.orderedIds.length !== known.size || input.orderedIds.some((id) => !known.has(id))) {
          throw invalid("BOOK_TODO_ORDER_INVALID", "Order every open to-do of this project exactly once.");
        }
        const current = new Map(open.map((row) => [row.id, row.sort_order]));
        let moved = 0;
        for (const [index, id] of input.orderedIds.entries()) {
          if (current.get(id) === index) continue;
          await tx.sfBookTodo.update({ where: { id }, data: { sort_order: index } });
          moved += 1;
        }
        if (moved) await audit(tx, input, "reordered", input.orderedIds[0] ?? input.projectId, { metadata: { count: input.orderedIds.length } });
        return { count: input.orderedIds.length };
      });
    },

    /** Any book reader may delete, on an open project. */
    async deleteTodo(input: ProjectInput & { todoId: string }) {
      return runTransaction(async (tx) => {
        await writableBook(tx, input);
        const todo = await loadTodo(tx, input);
        await tx.sfBookTodo.delete({ where: { id: todo.id } });
        await audit(tx, input, "deleted", todo.id, { metadata: { label: todo.label, assigneeId: todo.assignee_id, wasDone: Boolean(todo.done_at) } });
        return { todoId: todo.id };
      });
    },
  };
}

export type BookTodoService = ReturnType<typeof createBookTodoService>;
