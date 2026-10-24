import { randomUUID } from "node:crypto";

import { AppError } from "@platform/core/errors";

import { CHECKLIST_LABEL_MAX_LENGTH } from "../domain/checklist";
import { dateToDateOnly } from "../domain/dates";
import {
  conflict,
  getProjectAccess,
  invalid,
  notFound,
  nowOf,
  requireRead,
  writeAudit,
  type CommandContext,
  type Db,
  type StudioFlowPorts,
  type TxClient,
  type WorkSectionReadContext,
} from "../shared";
import { PHASE_NOTE_MAX } from "../workspace/service";
import { dueDateOf, requireAssigneeReader, writableBook } from "./todo-service";

/**
 * Client feedback points of the Project book (WO-SF-BOOK-03). A point is one thing the client said in one round. Writing
 * the points answers the round exactly as the phase dialog does (the same shared step); a point can become a to-do;
 * a point is handled when it is ticked or when its to-do is done. Every read and write needs a book reader.
 */

export const BOOK_FEEDBACK_MAX_POINTS = 30;
export const BOOK_FEEDBACK_POINT_MAX_LENGTH = 500;

type ProjectInput = CommandContext & { projectId: string };

/** The phase service's door for answering a round inside the caller's transaction. */
export type RoundAnswerStep = (
  tx: TxClient,
  input: CommandContext & { projectId: string; phaseId: string; iterationId: string },
  note: string | null,
) => Promise<{ iterationId: string; noteId: string | null }>;

const POINT_SELECT = {
  id: true, iteration_id: true, card_id: true, body: true, sort_order: true, handled_at: true, version: true,
  todo: { select: { id: true, assignee_id: true, due_date: true, done_at: true } },
} as const;

export type FeedbackPointView = {
  id: string;
  text: string;
  /** Ticked here, or its to-do is done. */
  handled: boolean;
  ticked: boolean;
  todo: { id: string; assigneeId: string | null; dueDate: string | null; done: boolean } | null;
  version: number;
};

export type OpenRoundView = {
  iterationId: string;
  phaseId: string;
  phaseLabel: string;
  roundName: string;
  status: "SENT" | "ANSWERED";
  answeredAt: Date | null;
  points: FeedbackPointView[];
  handled: number;
  total: number;
};

function pointNotFound() {
  return new AppError("NOT_FOUND", "BOOK_POINT_NOT_FOUND", "This client point no longer exists.");
}

function stalePoint() {
  return conflict("BOOK_POINT_STALE", "Someone changed this point in the meantime. Reload to see the latest version.");
}

function cleanPoints(points: readonly string[]): string[] {
  const cleaned = points.map((point) => point.trim()).filter((point) => point.length > 0);
  if (cleaned.length === 0) throw invalid("BOOK_FEEDBACK_REQUIRED", "Write at least one thing the client said.");
  if (cleaned.length > BOOK_FEEDBACK_MAX_POINTS) throw invalid("BOOK_FEEDBACK_TOO_MANY", `At most ${BOOK_FEEDBACK_MAX_POINTS} points at a time.`);
  if (cleaned.some((point) => point.length > BOOK_FEEDBACK_POINT_MAX_LENGTH)) throw invalid("BOOK_FEEDBACK_POINT_TOO_LONG", `One point is at most ${BOOK_FEEDBACK_POINT_MAX_LENGTH} characters.`);
  if (cleaned.join("\n").length > PHASE_NOTE_MAX) throw invalid("BOOK_FEEDBACK_TOO_LONG", "That is more text than one client answer can hold. Split it in two.");
  return cleaned;
}

function pointView(row: { id: string; body: string; handled_at: Date | null; version: number; todo: { id: string; assignee_id: string | null; due_date: Date | null; done_at: Date | null } | null }): FeedbackPointView {
  const ticked = row.handled_at !== null;
  const todoDone = row.todo?.done_at != null;
  return {
    id: row.id, text: row.body, ticked, handled: ticked || todoDone, version: row.version,
    todo: row.todo ? { id: row.todo.id, assigneeId: row.todo.assignee_id, dueDate: dateToDateOnly(row.todo.due_date), done: row.todo.done_at !== null } : null,
  };
}

export function createBookFeedbackService(db: Db, ports: StudioFlowPorts, answerRound: RoundAnswerStep) {
  const { runTransaction } = ports;

  async function audit(tx: TxClient, input: ProjectInput, action: string, entityId: string, metadata: Record<string, unknown>) {
    await writeAudit(ports, tx, { action: `studioflow.book-feedback.${action}`, entityType: "book-feedback", entityId, actor: input.actor, metadata: { projectId: input.projectId, ...metadata } });
  }

  async function loadPoint(tx: TxClient, input: ProjectInput & { pointId: string }) {
    const point = await tx.sfBookFeedbackPoint.findFirst({ where: { id: input.pointId, project_id: input.projectId }, select: POINT_SELECT });
    if (!point) throw pointNotFound();
    return point;
  }

  return {
    /**
     * The project's rounds that are with the client, or answered without an outcome yet, each with its points and the
     * "n of m handled" counts. A non-reader gets exactly the answer for an unknown project.
     */
    async listOpenRounds(input: WorkSectionReadContext & { projectId: string }): Promise<OpenRoundView[]> {
      requireRead(input.grants);
      const access = await getProjectAccess(db, input);
      if (!access.canReadBook) throw notFound("project");
      const rounds = await db.sfRevision.findMany({
        where: { phase: { project_id: input.projectId }, status: { in: ["SENT", "ANSWERED"] } },
        orderBy: [{ phase: { order_index: "asc" } }, { major: "asc" }],
        select: { id: true, name: true, status: true, answered_at: true, phase: { select: { id: true, name_snapshot: true } } },
      });
      const points = rounds.length
        ? await db.sfBookFeedbackPoint.findMany({
            where: { project_id: input.projectId, iteration_id: { in: rounds.map((round) => round.id) } },
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
            select: POINT_SELECT,
          })
        : [];
      return rounds.map((round) => {
        const mine = points.filter((point) => point.iteration_id === round.id).map(pointView);
        return {
          iterationId: round.id, phaseId: round.phase.id, phaseLabel: round.phase.name_snapshot, roundName: round.name,
          status: round.status as "SENT" | "ANSWERED", answeredAt: round.answered_at, points: mine,
          handled: mine.filter((point) => point.handled).length, total: mine.length,
        };
      });
    },

    /**
     * What the client said, one point each. A round with the client becomes answered exactly as the phase dialog does;
     * a round already answered (no outcome yet) takes more points. Needs a book reader who may also answer that round.
     */
    async recordClientFeedback(input: ProjectInput & { iterationId: string; points: readonly string[] }) {
      const points = cleanPoints(input.points);
      return runTransaction(async (tx) => {
        const { actorId } = await writableBook(tx, input);
        const round = await tx.sfRevision.findFirst({ where: { id: input.iterationId, phase: { project_id: input.projectId } }, select: { id: true, phase_id: true } });
        if (!round) throw notFound("round");
        const answered = await answerRound(tx, { grants: input.grants, actor: input.actor, projectId: input.projectId, phaseId: round.phase_id, iterationId: round.id }, points.join("\n"));
        const last = await tx.sfBookFeedbackPoint.aggregate({ where: { iteration_id: round.id }, _max: { sort_order: true } });
        let order = (last._max.sort_order ?? -1) + 1;
        const ids: string[] = [];
        for (const body of points) {
          const id = randomUUID();
          await tx.sfBookFeedbackPoint.create({ data: { id, project_id: input.projectId, iteration_id: round.id, card_id: answered.noteId, body, sort_order: order++, created_by_id: actorId, created_by_name: input.actor.label, created_at: nowOf(ports) } });
          ids.push(id);
        }
        await audit(tx, input, "recorded", round.id, { iterationId: round.id, count: ids.length, cardId: answered.noteId });
        return { iterationId: round.id, noteId: answered.noteId, pointIds: ids };
      });
    },

    /** One to-do per point: the label is the point's text unless given; the to-do keeps the card the point came from. */
    async convertPointToTodo(input: ProjectInput & { pointId: string; label?: string; assigneeId?: string | null; dueDate?: string | null }) {
      const dueDate = dueDateOf(input.dueDate);
      return runTransaction(async (tx) => {
        const { actorId, project } = await writableBook(tx, input);
        const point = await loadPoint(tx, input);
        if (point.todo) throw new AppError("CONFLICT", "BOOK_POINT_ALREADY_TODO", "This point already has a to-do.", { details: { todoId: point.todo.id } });
        const label = (input.label ?? point.body).trim().slice(0, CHECKLIST_LABEL_MAX_LENGTH);
        if (!label) throw invalid("BOOK_TODO_LABEL_REQUIRED", "To-do is required.");
        const assigneeId = input.assigneeId || null;
        if (assigneeId) await requireAssigneeReader(tx, project, assigneeId);
        const last = await tx.sfBookTodo.aggregate({ where: { project_id: input.projectId, done_at: null }, _max: { sort_order: true } });
        const todo = await tx.sfBookTodo.create({
          data: {
            id: randomUUID(), project_id: input.projectId, label, assignee_id: assigneeId, due_date: dueDate, source_card_id: point.card_id, feedback_point_id: point.id,
            created_by_id: actorId, created_by_name: input.actor.label, created_at: nowOf(ports), sort_order: (last._max.sort_order ?? -1) + 1,
          },
          select: { id: true, version: true },
        });
        await audit(tx, input, "converted", point.id, { pointId: point.id, todoId: todo.id, assigneeId, dueDate: dateToDateOnly(dueDate) });
        await writeAudit(ports, tx, { action: "studioflow.book-todo.created", entityType: "book-todo", entityId: todo.id, actor: input.actor, metadata: { projectId: input.projectId, assigneeId, dueDate: dateToDateOnly(dueDate), pointId: point.id } });
        return { todoId: todo.id, version: todo.version };
      });
    },

    /** Tick or untick the point itself. Repeating the state it has is a no-op; a given `version` must still be current. */
    async setPointHandled(input: ProjectInput & { pointId: string; handled: boolean; version?: number }) {
      return runTransaction(async (tx) => {
        const { actorId } = await writableBook(tx, input);
        const point = await loadPoint(tx, input);
        if (input.version !== undefined && input.version !== point.version) throw stalePoint();
        if ((point.handled_at !== null) === input.handled) return { pointId: point.id, version: point.version };
        const updated = await tx.sfBookFeedbackPoint.updateMany({
          where: { id: point.id, version: point.version },
          data: input.handled
            ? { handled_at: nowOf(ports), handled_by_id: actorId, handled_by_name: input.actor.label, version: { increment: 1 } }
            : { handled_at: null, handled_by_id: null, handled_by_name: null, version: { increment: 1 } },
        });
        if (updated.count !== 1) throw stalePoint();
        await audit(tx, input, input.handled ? "handled" : "reopened", point.id, { pointId: point.id });
        return { pointId: point.id, version: point.version + 1 };
      });
    },
  };
}

export type BookFeedbackService = ReturnType<typeof createBookFeedbackService>;
