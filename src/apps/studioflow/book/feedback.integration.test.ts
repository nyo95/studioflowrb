import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";
import { FakeObjectStorage } from "@platform/core/storage";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { createNotificationWriter } from "@platform/core/notifications/persistence";
import type { PrismaClient } from "@/generated/prisma/client";

import { APP_REGISTRATIONS } from "../../../app/app-registrations";
import { LEGACY_PHASE_DEFINITION_IDS as LEGACY } from "../domain/phase";
import { STUDIOFLOW_PERMISSIONS as P } from "../permissions";
import { createStudioFlowService, type StudioFlowService } from "../service";
import type { StudioFlowPorts } from "../shared";

const ALL = [...Object.values(P)];
const MEMBER_GRANTS = [P.access, P.projectRead, P.phaseWork];
const OVERRIDE_GRANTS = [P.access, P.projectRead, P.phaseWork, P.projectManage, P.projectOverride];
const DRAFTER_GRANTS = [P.access, P.projectRead, P.phaseWork, P.taskManage, P.projectPicDrafter];

type Person = { id: string; actor: { kind: "USER"; userId: string; label: string } };

let testDb: TestDb;
let sf: StudioFlowService;
let designer: Person;
let drafter: Person;
let clock = new Date("2026-10-24T03:00:00Z");

async function rejectsWith(promise: Promise<unknown>, expected: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError, `expected an AppError, got ${String(error)}`);
    assert.equal(error.code, expected);
    return true;
  });
}

async function seedUser(name: string, grants: readonly string[]): Promise<Person> {
  const db = testDb.prisma;
  const userId = randomUUID();
  const roleId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${name.toLowerCase()}-${userId}@test.local`, display_name: name, password_hash: "x" } });
  await db.role.create({ data: { id: roleId, code: `role-${roleId}`, name: `${name} role` } });
  await db.rolePermission.createMany({ data: grants.map((permission) => ({ id: randomUUID(), role_id: roleId, permission_id: permission })) });
  await db.userRole.create({ data: { id: randomUUID(), user_id: userId, role_id: roleId } });
  return { id: userId, actor: { kind: "USER" as const, userId, label: name } };
}

async function seedDefaultTemplate() {
  const db = testDb.prisma;
  const template = await db.sfPhaseTemplate.create({ data: { name: "Standard", is_default: true, is_active: true } });
  const defs = [
    { id: LEGACY.moodboard, name: "Moodboard", prefix: "MB", orderIndex: 1, allowParallel: false, seat: "designer" },
    { id: LEGACY.layout, name: "Layout Plan", prefix: "L", orderIndex: 2, allowParallel: true, seat: "designer" },
    { id: LEGACY.design3d, name: "Design 3D", prefix: "D", orderIndex: 3, allowParallel: true, seat: "designer" },
    { id: LEGACY.cd, name: "Construction Drawing", prefix: "CD", orderIndex: 4, allowParallel: true, seat: "drafter" },
    { id: LEGACY.supervision, name: "Supervision", prefix: "SV", orderIndex: 5, allowParallel: false, seat: "designer" },
  ];
  for (const d of defs) {
    await db.sfPhaseDefinition.create({ data: { id: d.id, template_id: template.id, name: d.name, prefix: d.prefix, order_index: d.orderIndex, allow_parallel: d.allowParallel, seat: d.seat } });
  }
}

async function reset() {
  await testDb.pool.query(`TRUNCATE TABLE ${["sf_book_feedback_point", "sf_book_todo", "sf_book_member", "sf_phase_event", "sf_checklist_item", "sf_checklist_template", "sf_workspace_card", "sf_workspace_section", "sf_activity", "sf_revision", "sf_phase", "sf_phase_definition", "sf_phase_template", "sf_project", "sf_client", "sf_settings"].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await truncatePlatformTables(testDb);
  await seedDefaultTemplate();
  designer = await seedUser("Dina Designer", ALL);
  drafter = await seedUser("Dodi Drafter", DRAFTER_GRANTS);
  clock = new Date("2026-10-24T03:00:00Z");
}

before(async () => {
  initializePermissionRegistry(APP_REGISTRATIONS);
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  const db = testDb.prisma;
  const ports: StudioFlowPorts = {
    runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
    auditWriter: createAuditEventWriter(),
    people: createPeopleDirectory(db),
    storage: new FakeObjectStorage(),
    notificationWriter: createNotificationWriter(),
    masterData: createMasterDataPublicRead(db),
    now: () => (clock = new Date(clock.getTime() + 1000)),
  };
  sf = createStudioFlowService(db, ports);
});
beforeEach(reset);
after(async () => closeTestDb(testDb));

const as = (user: Person, grants: readonly string[] = ALL) => ({ grants, actor: user.actor });

async function newProject(name = "Feedback project") {
  return (await sf.projects.createProject({ ...as(designer), name, newClientName: "Client", picDesignerId: designer.id, picDrafterId: drafter.id, area: "100" })).projectId;
}

async function phaseOf(projectId: string, definitionId: string) {
  return testDb.prisma.sfPhase.findFirstOrThrow({ where: { project_id: projectId, definition_id: definitionId } });
}

/** The moodboard round, sent to the client and waiting for an answer. */
async function setup(name?: string) {
  const projectId = await newProject(name);
  const moodboard = await phaseOf(projectId, LEGACY.moodboard);
  const round = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id, status: "NOT_SENT" } });
  await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: round.id });
  const manager = await seedUser("Mona Manager", OVERRIDE_GRANTS);
  const member = await seedUser("Mia Member", MEMBER_GRANTS);
  const outsider = await seedUser("Omar Outsider", MEMBER_GRANTS);
  const ctx = (user: Person, grants: readonly string[] = ALL) => ({ ...as(user, grants), projectId });
  const read = (user: Person, grants: readonly string[] = ALL) => ({ grants, actorId: user.id, projectId });
  await sf.workspace.addBookMember({ ...ctx(designer), userId: member.id });
  return { projectId, moodboard, round, manager, member, outsider, ctx, read, pic: ctx(designer), memberCtx: ctx(member, MEMBER_GRANTS) };
}

describe("Project book client feedback points (WO-SF-BOOK-03)", () => {
  it("answers a round exactly as the phase dialog does, posts one workflow card, and keeps the points in order", async () => {
    const { projectId, round, pic, manager, read } = await setup();
    const result = await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["  Floor too dark ", "", "Counter top feels heavy", "Add a mirror"] });
    assert.equal(result.pointIds.length, 3);
    assert.ok(result.noteId);

    const answered = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: round.id } });
    assert.equal(answered.status, "ANSWERED");
    assert.ok(answered.answered_at);
    const event = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { iteration_id: round.id, to_state: "ANSWERED" } });
    assert.equal(event.from_state, "SENT");
    assert.ok(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.phase.client-answer-recorded" } }) === 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.book-feedback.recorded" } }), 1);

    const card = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: result.noteId! } });
    assert.equal(card.origin, "CLIENT_ANSWER");
    assert.equal(card.workflow_record, true);
    assert.equal(card.body, "Floor too dark\nCounter top feels heavy\nAdd a mirror");
    // A manager who is not a book reader still sees the client's answer as a workflow record.
    const managerNotes = await sf.workspace.listProjectNotes({ grants: OVERRIDE_GRANTS, actorId: manager.id, projectId, limit: 50 });
    assert.ok(managerNotes.notes.some((note) => note.id === result.noteId));

    const rounds = await sf.bookFeedback.listOpenRounds(read(designer));
    assert.equal(rounds.length, 1);
    assert.deepEqual(rounds[0].points.map((point) => point.text), ["Floor too dark", "Counter top feels heavy", "Add a mirror"]);
    assert.deepEqual([rounds[0].status, rounds[0].handled, rounds[0].total], ["ANSWERED", 0, 3]);

    // The dialog path on a twin project leaves the same round state and the same event shape.
    const twin = await newProject("Twin");
    const twinPhase = await phaseOf(twin, LEGACY.moodboard);
    const twinRound = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: twinPhase.id, status: "NOT_SENT" } });
    await sf.phases.sendIteration({ ...as(designer), projectId: twin, phaseId: twinPhase.id, iterationId: twinRound.id });
    await sf.phases.recordClientAnswer({ ...as(designer), projectId: twin, phaseId: twinPhase.id, iterationId: twinRound.id, note: "Same" });
    const twinEvent = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { iteration_id: twinRound.id, to_state: "ANSWERED" } });
    assert.deepEqual([twinEvent.from_state, twinEvent.to_state, twinEvent.phase_id === twinPhase.id], [event.from_state, event.to_state, true]);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: twinRound.id } })).status, "ANSWERED");
  });

  it("appends to an answered round, refuses other states, and lists every open round when two are out", async () => {
    const { projectId, moodboard, round, pic, read } = await setup();
    await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["First"] });
    await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["Late one", "Another"] });
    let rounds = await sf.bookFeedback.listOpenRounds(read(designer));
    assert.deepEqual(rounds[0].points.map((point) => point.text), ["First", "Late one", "Another"]);
    assert.equal(await testDb.prisma.sfWorkspaceCard.count({ where: { project_id: projectId, origin: "CLIENT_ANSWER" } }), 2);

    // A second phase with its own round out.
    const layout = await phaseOf(projectId, LEGACY.layout);
    const added = await sf.phases.addIteration({ ...as(designer), projectId, phaseId: layout.id });
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: layout.id, iterationId: added.iterationId });
    rounds = await sf.bookFeedback.listOpenRounds(read(designer));
    assert.deepEqual(rounds.map((entry) => [entry.phaseLabel, entry.status]), [["Moodboard", "ANSWERED"], ["Layout Plan", "SENT"]]);
    await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: added.iterationId, points: ["Layout point"] });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: added.iterationId } })).status, "ANSWERED");
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: round.id } })).status, "ANSWERED");

    // Once the outcome is chosen the round no longer takes points; a never-sent round never does.
    await sf.phases.chooseIterationOutcome({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: round.id, outcome: "REVISION" });
    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["Too late"] }), "PHASE_INVALID_STATE");
    const next = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id, status: "NOT_SENT" } });
    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: next.id, points: ["Not sent yet"] }), "PHASE_INVALID_STATE");
    assert.equal(await testDb.prisma.sfBookFeedbackPoint.count({ where: { iteration_id: next.id } }), 0);

    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: next.id, points: ["  ", ""] }), "BOOK_FEEDBACK_REQUIRED");
    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: next.id, points: ["x".repeat(501)] }), "BOOK_FEEDBACK_POINT_TOO_LONG");
    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: next.id, points: Array.from({ length: 31 }, (_, index) => `p${index}`) }), "BOOK_FEEDBACK_TOO_MANY");
  });

  it("lets an invited member read, convert and tick points but never answer a round; refuses non-readers", async () => {
    const { projectId, round, pic, member, memberCtx, manager, outsider, ctx, read } = await setup();
    const { pointIds } = await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["One", "Two"] });

    const memberRead = await sf.bookFeedback.listOpenRounds(read(member, MEMBER_GRANTS));
    assert.equal(memberRead[0].points.length, 2);
    const converted = await sf.bookFeedback.convertPointToTodo({ ...memberCtx, pointId: pointIds[0], assigneeId: member.id });
    assert.ok(converted.todoId);
    await sf.bookFeedback.setPointHandled({ ...memberCtx, pointId: pointIds[1], handled: true });
    // The member cannot change a phase: the round that is with the client cannot be answered by them.
    const second = await testDb.prisma.sfRevision.count({ where: { phase: { project_id: projectId } } });
    const sentAgain = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { id: round.id } });
    await assert.rejects(sf.bookFeedback.recordClientFeedback({ ...memberCtx, iterationId: sentAgain.id, points: ["Member says"] }), (error: unknown) => error instanceof AppError);
    assert.equal(await testDb.prisma.sfBookFeedbackPoint.count({ where: { iteration_id: round.id } }), 2);
    assert.equal(await testDb.prisma.sfRevision.count({ where: { phase: { project_id: projectId } } }), second);

    const unknown = randomUUID();
    await rejectsWith(sf.bookFeedback.listOpenRounds({ grants: ALL, actorId: unknown, projectId: unknown }), "PROJECT_NOT_FOUND");
    const owner = await seedUser("Olga Owner", ALL);
    for (const [person, grants] of [[manager, OVERRIDE_GRANTS], [outsider, MEMBER_GRANTS], [owner, ALL]] as const) {
      const c = ctx(person, grants);
      await rejectsWith(sf.bookFeedback.listOpenRounds(read(person, grants)), "PROJECT_NOT_FOUND");
      await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...c, iterationId: round.id, points: ["Nope"] }), "PERMISSION_DENIED");
      await rejectsWith(sf.bookFeedback.convertPointToTodo({ ...c, pointId: pointIds[1] }), "PERMISSION_DENIED");
      await rejectsWith(sf.bookFeedback.setPointHandled({ ...c, pointId: pointIds[1], handled: false }), "PERMISSION_DENIED");
    }
    assert.equal(await testDb.prisma.sfBookFeedbackPoint.count({ where: { iteration_id: round.id } }), 2);
  });

  it("makes one to-do per point, refuses a second with the existing id, and lets a deleted to-do be converted again", async () => {
    const { projectId, round, pic, member, read } = await setup();
    const { pointIds, noteId } = await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["Floor too dark", "Mirror please"] });
    const first = await sf.bookFeedback.convertPointToTodo({ ...pic, pointId: pointIds[0], assigneeId: member.id, dueDate: "2026-10-28" });
    const todo = await testDb.prisma.sfBookTodo.findUniqueOrThrow({ where: { id: first.todoId } });
    assert.deepEqual([todo.label, todo.assignee_id, todo.source_card_id, todo.feedback_point_id], ["Floor too dark", member.id, noteId, pointIds[0]]);

    await assert.rejects(sf.bookFeedback.convertPointToTodo({ ...pic, pointId: pointIds[0] }), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "BOOK_POINT_ALREADY_TODO");
      assert.equal(error.details?.todoId, first.todoId);
      return true;
    });
    const outsider = await seedUser("Omar Outsider", MEMBER_GRANTS);
    await rejectsWith(sf.bookFeedback.convertPointToTodo({ ...pic, pointId: pointIds[1], assigneeId: outsider.id }), "BOOK_TODO_ASSIGNEE_NOT_READER");

    const mine = await sf.bookTodos.listMyTasks({ grants: MEMBER_GRANTS, actorId: member.id });
    assert.deepEqual(mine.map((task) => [task.label, task.roundName, task.feedbackPointId]), [["Floor too dark", round.name, pointIds[0]]]);
    const listed = await sf.bookTodos.listProjectTodos(read(designer));
    assert.equal(listed[0].feedbackPointId, pointIds[0]);

    await sf.bookTodos.deleteTodo({ ...pic, todoId: first.todoId });
    assert.equal(await testDb.prisma.sfBookFeedbackPoint.count({ where: { project_id: projectId } }), 2, "the point outlives its to-do");
    const again = await sf.bookFeedback.convertPointToTodo({ ...pic, pointId: pointIds[0], label: "Floor lighter, see FL-01" });
    assert.notEqual(again.todoId, first.todoId);
    assert.equal((await testDb.prisma.sfBookTodo.findUniqueOrThrow({ where: { id: again.todoId } })).label, "Floor lighter, see FL-01");
  });

  it("counts handled points when ticked or when their to-do is done, and reopens with the to-do", async () => {
    const { round, pic, read } = await setup();
    const { pointIds } = await sf.bookFeedback.recordClientFeedback({ ...pic, iterationId: round.id, points: ["A", "B", "C"] });
    const counts = async () => {
      const [entry] = await sf.bookFeedback.listOpenRounds(read(designer));
      return [entry.handled, entry.total];
    };
    assert.deepEqual(await counts(), [0, 3]);

    const ticked = await sf.bookFeedback.setPointHandled({ ...pic, pointId: pointIds[0], handled: true });
    assert.deepEqual(await counts(), [1, 3]);
    const repeat = await sf.bookFeedback.setPointHandled({ ...pic, pointId: pointIds[0], handled: true });
    assert.equal(repeat.version, ticked.version, "repeating the state is a no-op");
    await rejectsWith(sf.bookFeedback.setPointHandled({ ...pic, pointId: pointIds[0], handled: false, version: ticked.version - 1 }), "BOOK_POINT_STALE");
    await sf.bookFeedback.setPointHandled({ ...pic, pointId: pointIds[0], handled: false, version: ticked.version });
    assert.deepEqual(await counts(), [0, 3]);

    const todo = await sf.bookFeedback.convertPointToTodo({ ...pic, pointId: pointIds[1] });
    assert.deepEqual(await counts(), [0, 3], "a to-do alone does not handle the point");
    await sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: true });
    assert.deepEqual(await counts(), [1, 3]);
    await sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: false });
    assert.deepEqual(await counts(), [0, 3]);

    // Ticked itself and with a done to-do: reopening the to-do keeps it handled.
    await sf.bookFeedback.setPointHandled({ ...pic, pointId: pointIds[1], handled: true });
    await sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: true });
    await sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: false });
    assert.deepEqual(await counts(), [1, 3]);

    for (const action of ["recorded", "converted", "handled", "reopened"]) {
      assert.ok(await testDb.prisma.auditEvent.count({ where: { action: `studioflow.book-feedback.${action}` } }) >= 1, `audited: ${action}`);
    }
  });

  it("refuses ids from another project and leaves approval, blockers and the checklist as they were", async () => {
    const one = await setup("One");
    const { pointIds } = await sf.bookFeedback.recordClientFeedback({ ...one.pic, iterationId: one.round.id, points: ["Mine"] });
    const otherProject = await newProject("Other");
    const other = (id: string) => ({ ...as(designer), projectId: otherProject, pointId: id });
    await rejectsWith(sf.bookFeedback.convertPointToTodo(other(pointIds[0])), "BOOK_POINT_NOT_FOUND");
    await rejectsWith(sf.bookFeedback.setPointHandled({ ...other(pointIds[0]), handled: true }), "BOOK_POINT_NOT_FOUND");
    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...as(designer), projectId: otherProject, iterationId: one.round.id, points: ["Cross"] }), "ROUND_NOT_FOUND");
    await rejectsWith(sf.bookFeedback.convertPointToTodo({ ...one.pic, pointId: randomUUID() }), "BOOK_POINT_NOT_FOUND");

    const checklistBefore = await testDb.prisma.sfChecklistItem.count();
    await sf.bookFeedback.convertPointToTodo({ ...one.pic, pointId: pointIds[0] });
    assert.equal(await testDb.prisma.sfChecklistItem.count(), checklistBefore);
    // The answered round still takes the normal outcome step.
    await sf.phases.chooseIterationOutcome({ ...as(designer), projectId: one.projectId, phaseId: one.moodboard.id, iterationId: one.round.id, outcome: "DONE" });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: one.moodboard.id } })).status, "DONE");
    // Deleting the project removes its points and to-dos with it.
    await testDb.prisma.sfProject.delete({ where: { id: one.projectId } });
    assert.equal(await testDb.prisma.sfBookFeedbackPoint.count({ where: { project_id: one.projectId } }), 0);
  });
});
