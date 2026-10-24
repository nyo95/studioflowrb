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
  await testDb.pool.query(`TRUNCATE TABLE ${["sf_book_todo", "sf_book_member", "sf_checklist_item", "sf_checklist_template", "sf_workspace_card", "sf_workspace_section", "sf_activity", "sf_revision", "sf_phase", "sf_phase_definition", "sf_phase_template", "sf_project", "sf_client", "sf_settings"].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
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
    // Every reading moves the clock on, so rows created one after the other keep a strict creation order.
    now: () => (clock = new Date(clock.getTime() + 1000)),
  };
  sf = createStudioFlowService(db, ports);
});
beforeEach(reset);
after(async () => closeTestDb(testDb));

const as = (user: Person, grants: readonly string[] = ALL) => ({ grants, actor: user.actor });

async function newProject(name = "Book project") {
  return (await sf.projects.createProject({ ...as(designer), name, newClientName: "Client", picDesignerId: designer.id, picDrafterId: drafter.id, area: "100" })).projectId;
}

async function setup(name?: string) {
  const projectId = await newProject(name);
  const manager = await seedUser("Mona Manager", OVERRIDE_GRANTS);
  const member = await seedUser("Mia Member", MEMBER_GRANTS);
  const outsider = await seedUser("Omar Outsider", MEMBER_GRANTS);
  const ctx = (user: Person, grants: readonly string[] = ALL) => ({ ...as(user, grants), projectId });
  const read = (user: Person, grants: readonly string[] = ALL) => ({ grants, actorId: user.id, projectId });
  await sf.workspace.addBookMember({ ...ctx(designer), userId: member.id });
  return { projectId, manager, member, outsider, ctx, read, pic: ctx(designer), picDrafter: ctx(drafter, DRAFTER_GRANTS), memberCtx: ctx(member, MEMBER_GRANTS) };
}

describe("Project book to-dos (WO-SF-BOOK-02)", () => {
  it("lets a PIC and a member create, edit, complete, reopen, reorder and delete, auditing every write", async () => {
    const { projectId, pic, picDrafter, memberCtx, read, member } = await setup();
    const first = await sf.bookTodos.createTodo({ ...pic, label: "  Call   the vendor ", assigneeId: member.id, dueDate: "2026-10-30" });
    const second = await sf.bookTodos.createTodo({ ...memberCtx, label: "Measure the lobby" });
    const third = await sf.bookTodos.createTodo({ ...picDrafter, label: "Check the ceiling plan", assigneeId: drafter.id });

    let listed = await sf.bookTodos.listProjectTodos(read(designer));
    assert.deepEqual(listed.map((todo) => todo.label), ["Call the vendor", "Measure the lobby", "Check the ceiling plan"]);
    assert.equal(listed[0].assigneeName, "Mia Member");
    assert.equal(listed[0].dueDate, "2026-10-30");
    assert.equal(listed[1].createdByName, "Mia Member");

    const edited = await sf.bookTodos.updateTodo({ ...memberCtx, todoId: first.todoId, version: first.version, label: "Call the vendor today", dueDate: "2026-10-31", assigneeId: designer.id });
    assert.equal(edited.version, first.version + 1);
    await sf.bookTodos.updateTodo({ ...pic, todoId: first.todoId, version: edited.version, dueDate: null, assigneeId: null });
    listed = await sf.bookTodos.listProjectTodos(read(designer));
    assert.deepEqual([listed[0].label, listed[0].assigneeId, listed[0].dueDate], ["Call the vendor today", null, null]);

    // A no-op update changes nothing and writes no audit row.
    const before = await testDb.prisma.auditEvent.count({ where: { action: "studioflow.book-todo.updated" } });
    const same = await sf.bookTodos.updateTodo({ ...pic, todoId: first.todoId, version: listed[0].version, label: "Call the vendor today" });
    assert.equal(same.version, listed[0].version);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.book-todo.updated" } }), before);

    await sf.bookTodos.setTodoDone({ ...memberCtx, todoId: second.todoId, done: true });
    listed = await sf.bookTodos.listProjectTodos(read(member, MEMBER_GRANTS));
    assert.deepEqual(listed.map((todo) => [todo.label, Boolean(todo.doneAt)]), [["Call the vendor today", false], ["Check the ceiling plan", false], ["Measure the lobby", true]], "open first, then done");
    await sf.bookTodos.setTodoDone({ ...pic, todoId: second.todoId, done: false });
    await sf.bookTodos.reorderTodos({ ...picDrafter, orderedIds: [third.todoId, second.todoId, first.todoId] });
    assert.deepEqual((await sf.bookTodos.listProjectTodos(read(designer))).map((todo) => todo.id), [third.todoId, second.todoId, first.todoId]);
    await rejectsWith(sf.bookTodos.reorderTodos({ ...pic, orderedIds: [third.todoId, second.todoId] }), "BOOK_TODO_ORDER_INVALID");
    await rejectsWith(sf.bookTodos.reorderTodos({ ...pic, orderedIds: [third.todoId, third.todoId, second.todoId] }), "BOOK_TODO_ORDER_INVALID");

    await sf.bookTodos.deleteTodo({ ...memberCtx, todoId: third.todoId });
    await rejectsWith(sf.bookTodos.deleteTodo({ ...pic, todoId: third.todoId }), "BOOK_TODO_NOT_FOUND");
    assert.equal(await testDb.prisma.sfBookTodo.count({ where: { project_id: projectId } }), 2);

    for (const action of ["created", "updated", "done", "reopened", "reordered", "deleted"]) {
      assert.ok(await testDb.prisma.auditEvent.count({ where: { action: `studioflow.book-todo.${action}` } }) >= 1, `audited: ${action}`);
    }
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.book-todo.created" } }), 3);
  });

  it("refuses every read and write for a manager, override holder, outsider and unknown project, and answers a list like an unknown project", async () => {
    const { projectId, pic, manager, outsider, ctx, read } = await setup();
    const todo = await sf.bookTodos.createTodo({ ...pic, label: "Private to-do" });
    const unknown = randomUUID();
    await rejectsWith(sf.bookTodos.listProjectTodos({ grants: ALL, actorId: unknown, projectId: unknown }), "PROJECT_NOT_FOUND");

    for (const [person, grants] of [[manager, OVERRIDE_GRANTS], [outsider, MEMBER_GRANTS]] as const) {
      const c = ctx(person, grants);
      await rejectsWith(sf.bookTodos.listProjectTodos(read(person, grants)), "PROJECT_NOT_FOUND");
      await rejectsWith(sf.bookTodos.createTodo({ ...c, label: "Nope" }), "PERMISSION_DENIED");
      await rejectsWith(sf.bookTodos.updateTodo({ ...c, todoId: todo.todoId, version: todo.version, label: "Nope" }), "PERMISSION_DENIED");
      await rejectsWith(sf.bookTodos.setTodoDone({ ...c, todoId: todo.todoId, done: true }), "PERMISSION_DENIED");
      await rejectsWith(sf.bookTodos.reorderTodos({ ...c, orderedIds: [todo.todoId] }), "PERMISSION_DENIED");
      await rejectsWith(sf.bookTodos.deleteTodo({ ...c, todoId: todo.todoId }), "PERMISSION_DENIED");
      assert.deepEqual(await sf.bookTodos.listMyTasks({ grants, actorId: person.id }), []);
    }
    // The Platform Owner holds every permission and is still not a reader.
    const owner = await seedUser("Olga Owner", ALL);
    await rejectsWith(sf.bookTodos.listProjectTodos(read(owner)), "PROJECT_NOT_FOUND");
    await rejectsWith(sf.bookTodos.createTodo({ ...ctx(owner), label: "Nope" }), "PERMISSION_DENIED");
    // Without the module permission nothing works for a PIC either.
    await rejectsWith(sf.bookTodos.createTodo({ ...ctx(designer, [P.access, P.projectRead]), label: "No phase.work" }), "PERMISSION_DENIED");
    assert.equal(await testDb.prisma.sfBookTodo.count({ where: { project_id: projectId } }), 1);
    assert.equal((await testDb.prisma.sfBookTodo.findFirstOrThrow({ where: { id: todo.todoId } })).label, "Private to-do");
  });

  it("assigns only to a PIC or an invited member, or leaves the to-do unassigned", async () => {
    const { pic, outsider, manager, member, read } = await setup();
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "A", assigneeId: outsider.id }), "BOOK_TODO_ASSIGNEE_NOT_READER");
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "A", assigneeId: manager.id }), "BOOK_TODO_ASSIGNEE_NOT_READER");
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "A", assigneeId: randomUUID() }), "BOOK_TODO_ASSIGNEE_NOT_READER");
    const toMember = await sf.bookTodos.createTodo({ ...pic, label: "B", assigneeId: member.id });
    await sf.bookTodos.createTodo({ ...pic, label: "C", assigneeId: drafter.id });
    await sf.bookTodos.createTodo({ ...pic, label: "D", assigneeId: null });
    await rejectsWith(sf.bookTodos.updateTodo({ ...pic, todoId: toMember.todoId, version: toMember.version, assigneeId: outsider.id }), "BOOK_TODO_ASSIGNEE_NOT_READER");
    assert.equal((await sf.bookTodos.listProjectTodos(read(designer))).length, 3);
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "   " }), "BOOK_TODO_LABEL_REQUIRED");
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "x".repeat(201) }), "BOOK_TODO_LABEL_REQUIRED");
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "E", dueDate: "2026-02-30" }), "BOOK_TODO_DUE_INVALID");
  });

  it("returns My tasks only from the caller's own books, assigned to them or unassigned and created by them, and drops a removed member", async () => {
    const { projectId, pic, memberCtx, member, outsider, manager } = await setup("Alpha");
    const other = await newProject("Beta");
    const otherPic = { ...as(designer), projectId: other };
    await sf.bookTodos.createTodo({ ...pic, label: "Designer own, no date" });
    await sf.bookTodos.createTodo({ ...pic, label: "For Mia late", assigneeId: member.id, dueDate: "2026-10-20" });
    await sf.bookTodos.createTodo({ ...pic, label: "For Mia later", assigneeId: member.id, dueDate: "2026-11-02" });
    await sf.bookTodos.createTodo({ ...memberCtx, label: "Mia unassigned, her own" });
    await sf.bookTodos.createTodo({ ...pic, label: "Unassigned, designer's" });
    await sf.bookTodos.createTodo({ ...pic, label: "For the drafter", assigneeId: drafter.id, dueDate: "2026-10-25" });
    const done = await sf.bookTodos.createTodo({ ...pic, label: "Mia, already done", assigneeId: member.id });
    await sf.bookTodos.setTodoDone({ ...pic, todoId: done.todoId, done: true });
    await sf.bookTodos.createTodo({ ...otherPic, label: "Beta, designer", assigneeId: designer.id, dueDate: "2026-10-22" });

    const mia = await sf.bookTodos.listMyTasks({ grants: MEMBER_GRANTS, actorId: member.id });
    assert.deepEqual(mia.map((task) => task.label), ["For Mia late", "For Mia later", "Mia unassigned, her own"], "due date first, empty last; no done, no others");
    assert.deepEqual([mia[0].projectId, mia[0].projectName, mia[0].dueDate, mia[0].sourceCardId], [projectId, "Alpha", "2026-10-20", null]);

    const mine = await sf.bookTodos.listMyTasks({ grants: ALL, actorId: designer.id });
    assert.deepEqual(mine.map((task) => task.label), ["Beta, designer", "Designer own, no date", "Unassigned, designer's"]);
    assert.deepEqual((await sf.bookTodos.listMyTasks({ grants: ALL, actorId: drafter.id })).map((task) => task.label), ["For the drafter"]);
    assert.deepEqual(await sf.bookTodos.listMyTasks({ grants: MEMBER_GRANTS, actorId: outsider.id }), []);
    assert.deepEqual(await sf.bookTodos.listMyTasks({ grants: OVERRIDE_GRANTS, actorId: manager.id }), []);

    // Mia leaves the book: her to-dos stay assigned to her but vanish from her tasks.
    await sf.workspace.removeBookMember({ ...pic, userId: member.id });
    assert.deepEqual(await sf.bookTodos.listMyTasks({ grants: MEMBER_GRANTS, actorId: member.id }), []);
    assert.equal(await testDb.prisma.sfBookTodo.count({ where: { project_id: projectId, assignee_id: member.id } }), 3);

    // An archived project drops out of everyone's tasks.
    await sf.projects.archiveProject({ ...as(designer), projectId: other, reason: "Paused" });
    assert.ok(!(await sf.bookTodos.listMyTasks({ grants: ALL, actorId: designer.id })).some((task) => task.projectId === other));
  });

  it("refuses a stale version, and an archived, completed or (for a member) paused project", async () => {
    const { projectId, pic, memberCtx } = await setup();
    const todo = await sf.bookTodos.createTodo({ ...pic, label: "Versioned" });
    const edited = await sf.bookTodos.updateTodo({ ...pic, todoId: todo.todoId, version: todo.version, label: "Versioned 2" });
    await rejectsWith(sf.bookTodos.updateTodo({ ...memberCtx, todoId: todo.todoId, version: todo.version, label: "Stale write" }), "BOOK_TODO_STALE");
    await rejectsWith(sf.bookTodos.setTodoDone({ ...memberCtx, todoId: todo.todoId, done: true, version: todo.version }), "BOOK_TODO_STALE");
    assert.equal((await testDb.prisma.sfBookTodo.findFirstOrThrow({ where: { id: todo.todoId } })).label, "Versioned 2");
    const done = await sf.bookTodos.setTodoDone({ ...memberCtx, todoId: todo.todoId, done: true, version: edited.version });
    assert.equal((await sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: true })).version, done.version, "repeating the state is a no-op");

    // On hold: a PIC still writes (a to-do has no phase), a member does not.
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { status: "ON_HOLD" } });
    await sf.bookTodos.createTodo({ ...pic, label: "PIC on hold" });
    await rejectsWith(sf.bookTodos.createTodo({ ...memberCtx, label: "Member on hold" }), "PROJECT_NOT_ACTIVE");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { status: "COMPLETED" } });
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "Completed" }), "PROJECT_COMPLETED");
    await rejectsWith(sf.bookTodos.deleteTodo({ ...pic, todoId: todo.todoId }), "PROJECT_COMPLETED");
    await rejectsWith(sf.bookTodos.reorderTodos({ ...pic, orderedIds: [] }), "PROJECT_COMPLETED");
    assert.equal((await sf.bookTodos.listProjectTodos({ grants: ALL, actorId: designer.id, projectId })).length, 2, "reads stay open");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { status: "ACTIVE", archived_at: clock } });
    await rejectsWith(sf.bookTodos.createTodo({ ...pic, label: "Archived" }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: false }), "PROJECT_ARCHIVED");
  });

  it("bounds the done list and leaves the phase checklist, blockers and approval untouched", async () => {
    const { projectId, pic, read } = await setup();
    const checklistBefore = await testDb.prisma.sfChecklistItem.count({ where: { project_id: projectId } });
    const phases = await testDb.prisma.sfPhase.findMany({ where: { project_id: projectId }, select: { id: true, status: true, is_locked: true }, orderBy: { id: "asc" } });
    const open = await sf.bookTodos.createTodo({ ...pic, label: "Stays open and blocks nothing" });
    for (let i = 0; i < 53; i += 1) {
      const todo = await sf.bookTodos.createTodo({ ...pic, label: `Done ${i}` });
      clock = new Date(clock.getTime() + 60_000);
      await sf.bookTodos.setTodoDone({ ...pic, todoId: todo.todoId, done: true });
    }
    const listed = await sf.bookTodos.listProjectTodos(read(designer));
    assert.equal(listed.length, 1 + 50);
    assert.equal(listed[0].id, open.todoId);
    assert.equal(listed[1].label, "Done 52", "most recently done first");
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { project_id: projectId } }), checklistBefore);
    assert.deepEqual(await testDb.prisma.sfPhase.findMany({ where: { project_id: projectId }, select: { id: true, status: true, is_locked: true }, orderBy: { id: "asc" } }), phases);
    await sf.bookTodos.deleteTodo({ ...pic, todoId: open.todoId });
    // A project deleted with its to-dos leaves none behind.
    await testDb.prisma.sfProject.delete({ where: { id: projectId } });
    assert.equal(await testDb.prisma.sfBookTodo.count({ where: { project_id: projectId } }), 0);
  });
});
