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
import type { PrismaClient } from "@/generated/prisma/client";

import { APP_REGISTRATIONS } from "../../app/app-registrations";
import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { createStudioFlowService, type StudioFlowService } from "./service";

const ALL = [...Object.values(P)];
const DRAFTER_GRANTS = [P.access, P.projectRead, P.phaseWork, P.taskManage];

let testDb: TestDb;
let sf: StudioFlowService;
let storage: FakeObjectStorage;
let designer: { id: string; actor: { kind: "USER"; userId: string; label: string } };
let drafter: { id: string; actor: { kind: "USER"; userId: string; label: string } };
let clock = new Date("2026-09-15T03:00:00Z");

function code(error: unknown): string | undefined {
  return error instanceof AppError ? error.code : undefined;
}

async function rejectsWith(promise: Promise<unknown>, expected: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal(code(error), expected);
    return true;
  });
}

async function seedUser(name: string, grants: readonly string[]) {
  const db = testDb.prisma;
  const userId = randomUUID();
  const roleId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${name.toLowerCase()}-${userId}@test.local`, display_name: name, password_hash: "x" } });
  await db.role.create({ data: { id: roleId, code: `role-${roleId}`, name: `${name} role` } });
  await db.rolePermission.createMany({ data: grants.map((permission) => ({ id: randomUUID(), role_id: roleId, permission_id: permission })) });
  await db.userRole.create({ data: { id: randomUUID(), user_id: userId, role_id: roleId } });
  return { id: userId, actor: { kind: "USER" as const, userId, label: name } };
}

async function reset() {
  await testDb.pool.query(`TRUNCATE TABLE ${[
    "sf_schedule_option", "sf_schedule_entry", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix",
    "sf_mom_image", "sf_mom_point", "sf_mom_item", "sf_mom_document",
    "sf_checklist_item_label", "sf_checklist_label", "sf_checklist_filter_view", "sf_checklist_item", "sf_checklist_template",
    "sf_activity", "sf_revision", "sf_phase", "sf_project", "sf_client", "sf_project_sequence", "sf_settings",
  ].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await truncatePlatformTables(testDb);
  designer = await seedUser("Dina Designer", ALL);
  drafter = await seedUser("Dodi Drafter", DRAFTER_GRANTS);
  clock = new Date("2026-09-15T03:00:00Z");
}

before(async () => {
  initializePermissionRegistry(APP_REGISTRATIONS);
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  const db = testDb.prisma;
  storage = new FakeObjectStorage();
  sf = createStudioFlowService(db, {
    runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
    auditWriter: createAuditEventWriter(),
    people: createPeopleDirectory(db),
    storage,
    masterData: createMasterDataPublicRead(db),
    now: () => clock,
  });
});
beforeEach(reset);
after(async () => closeTestDb(testDb));

const as = (user: typeof designer, grants: readonly string[] = ALL) => ({ grants, actor: user.actor });

async function newProject(name = "Heloskin Cimanggu") {
  return sf.projects.createProject({ ...as(designer), name, newClientName: "Heloskin", picDesignerId: designer.id, picDrafterId: drafter.id, area: "120.5" });
}

async function phaseOf(projectId: string, key: string) {
  return testDb.prisma.sfPhase.findFirstOrThrow({ where: { project_id: projectId, key: key as never } });
}

async function revisions(phaseId: string) {
  return (await testDb.prisma.sfRevision.findMany({ where: { phase_id: phaseId }, orderBy: [{ major: "asc" }, { minor: "asc" }] })).map((r) => `v${r.major}.${r.minor}:${r.status}`);
}

describe("SF-R1 bootstrap and naming", () => {
  it("creates the legacy project skeleton with auto naming and template seeding", async () => {
    await sf.tasks.createTemplate({ ...as(designer), phaseKey: null, label: "Kick-off meeting" });
    await sf.tasks.createTemplate({ ...as(designer), phaseKey: "MOODBOARD", label: "Collect references" });
    const first = await newProject();
    const second = await newProject("Kopi Kenangan");
    assert.equal(first.name, "2026-001 Heloskin Cimanggu");
    assert.equal(second.name, "2026-002 Kopi Kenangan");

    const phases = await testDb.prisma.sfPhase.findMany({ where: { project_id: first.projectId }, orderBy: { order_index: "asc" } });
    assert.deepEqual(phases.map((p) => [p.key, p.status, p.allow_parallel]), [
      ["MOODBOARD", "IN_PROGRESS", false], ["LAYOUT", "PENDING", true], ["DESIGN_3D", "PENDING", true], ["CD", "PENDING", true], ["SUPERVISION", "PENDING", false],
    ]);
    assert.deepEqual(await revisions(phases[0].id), ["v1.0:ACTIVE"]);
    const items = await testDb.prisma.sfChecklistItem.findMany({ where: { project_id: first.projectId } });
    assert.deepEqual(items.map((i) => [i.label, i.phase_id === null]).sort(), [["Collect references", false], ["Kick-off meeting", true]]);
    const clients = await sf.projects.listClients({ grants: ALL });
    assert.equal(clients.length, 1);
    assert.equal(clients[0].activeProjects, 2);
  });

  it("rejects prefixed names in auto mode and validates manual format", async () => {
    await rejectsWith(sf.projects.createProject({ ...as(designer), name: "2026-010 Manual", picDesignerId: designer.id, picDrafterId: drafter.id }), "PROJECT_NAME_AUTO_CONFLICT");
    await sf.projects.setAutoNaming({ ...as(designer), enabled: false });
    await rejectsWith(sf.projects.createProject({ ...as(designer), name: "No Number", picDesignerId: designer.id, picDrafterId: drafter.id }), "PROJECT_NAME_FORMAT");
    const manual = await sf.projects.createProject({ ...as(designer), name: "2026-050 Manual", picDesignerId: designer.id, picDrafterId: drafter.id });
    assert.equal(manual.name, "2026-050 Manual");
    await sf.projects.setAutoNaming({ ...as(designer), enabled: true });
    const next = await newProject("After Manual");
    assert.equal(next.name, "2026-051 After Manual");
  });

  it("requires eligible PICs and the manage grant", async () => {
    const outsider = await seedUser("Outsider", [P.access, P.projectRead]);
    await rejectsWith(sf.projects.createProject({ ...as(designer), name: "X", picDesignerId: outsider.id, picDrafterId: drafter.id }), "PIC_NOT_ELIGIBLE");
    await rejectsWith(sf.projects.createProject({ ...as(drafter, DRAFTER_GRANTS), name: "X", picDesignerId: designer.id, picDrafterId: drafter.id }), "PERMISSION_DENIED");
    const people = await sf.projects.listAssignablePeople({ grants: ALL });
    assert.deepEqual(people.map((p) => p.displayName), ["Dina Designer", "Dodi Drafter"]);
  });

  it("archives read-only and restores with audit", async () => {
    const { projectId } = await newProject();
    await rejectsWith(sf.projects.archiveProject({ ...as(designer), projectId, reason: " " }), "ARCHIVE_REASON_REQUIRED");
    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Client paused" });
    const moodboard = await phaseOf(projectId, "MOODBOARD");
    await rejectsWith(sf.phases.addActivity({ ...as(designer), projectId, phaseId: moodboard.id, content: "x", mode: "TODO" }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.projects.updateProject({ ...as(designer), projectId, address: "New" }), "PROJECT_ARCHIVED");
    assert.equal((await sf.projects.listProjects({ grants: ALL })).length, 0);
    assert.equal((await sf.projects.listProjects({ grants: ALL, archived: true })).length, 1);
    await sf.projects.restoreProject({ ...as(designer), projectId });
    const history = await sf.projects.getProjectHistory({ grants: ALL, projectId });
    assert.deepEqual(history.map((h) => h.action).slice(0, 3), ["studioflow.project.restored", "studioflow.project.archived", "studioflow.project.created"]);
  });
});

describe("SF-R1 phase workflow (legacy parity)", () => {
  it("walks internal review, internal and client rejection, and client approval", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "MOODBOARD");
    const base = { ...as(designer), projectId, phaseId: phase.id };

    const todo = await sf.phases.addActivity({ ...base, content: "Draft board", mode: "TODO" });
    await rejectsWith(sf.phases.submitForInternalReview(base), "PHASE_OPEN_TODOS");
    await sf.phases.setActivityDone({ ...base, activityId: todo.activityId, done: true });
    await sf.phases.submitForInternalReview(base);

    await sf.phases.addActivity({ ...base, content: "Warmer palette", mode: "FEEDBACK" });
    await rejectsWith(sf.phases.approveInternal(base), "PHASE_APPROVAL_BLOCKED");
    const rejected = await sf.phases.rejectPhase({ ...base, type: "INTERNAL" });
    assert.equal(rejected.revision, "v1.1");
    assert.equal(rejected.converted, 1);
    const converted = await testDb.prisma.sfActivity.findFirstOrThrow({ where: { phase_id: phase.id, mode: "TODO", status: "OPEN" } });
    assert.equal(converted.assigned_to_id, designer.id);

    await sf.phases.setActivityDone({ ...base, activityId: converted.id, done: true });
    await sf.phases.submitForInternalReview(base);
    await sf.phases.approveInternal(base);
    await sf.phases.submitForClientReview(base);
    await sf.phases.addActivity({ ...base, content: "Client wants marble", mode: "FEEDBACK" });
    const clientReject = await sf.phases.rejectPhase({ ...base, type: "CLIENT" });
    assert.equal(clientReject.revision, "v2.0");
    assert.deepEqual(await revisions(phase.id), ["v1.0:COMPLETED", "v1.1:COMPLETED", "v2.0:ACTIVE"]);

    const marble = await testDb.prisma.sfActivity.findFirstOrThrow({ where: { phase_id: phase.id, status: "OPEN", revision: { status: "ACTIVE" } } });
    await sf.phases.setActivityDone({ ...base, activityId: marble.id, done: true });
    await sf.phases.submitForClientReview(base);
    clock = new Date("2026-09-18T03:00:00Z");
    const approved = await sf.phases.approveClient(base);
    assert.equal(approved.projectCompleted, false);
    const after = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id } });
    assert.equal(after.status, "READY_FOR_NEXT");
    assert.equal(after.is_locked, true);
    await rejectsWith(sf.phases.addActivity({ ...base, content: "late", mode: "TODO" }), "PHASE_LOCKED");

    const actions = (await testDb.prisma.auditEvent.findMany({ where: { entity_id: phase.id }, orderBy: { occurred_at: "asc" } })).map((e) => e.action);
    assert.ok(actions.includes("studioflow.phase.rejected-internal"));
    assert.ok(actions.includes("studioflow.phase.approved-client"));
  });

  it("blocks approval on unchecked root checklist items only", async () => {
    await sf.tasks.createTemplate({ ...as(designer), phaseKey: "MOODBOARD", label: "Board printed" });
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "MOODBOARD");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.submitForClientReview(base).catch(() => undefined);
    const [root] = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id });
    await rejectsWith(sf.phases.submitForClientReview(base), "PHASE_APPROVAL_BLOCKED");
    const sub = await sf.tasks.createSubtask({ ...as(drafter, DRAFTER_GRANTS), projectId, parentId: root.id, label: "Print A3" });
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: root.id, checked: true });
    const child = await testDb.prisma.sfChecklistItem.findUniqueOrThrow({ where: { id: sub.itemId } });
    assert.equal(child.is_checked, true, "parent cascades down");
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: sub.itemId, checked: false });
    await sf.phases.submitForClientReview(base);
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(phases[0].blockers.total, 0);
  });

  it("enforces sequential activation, parallel phases, ON_HOLD and completion", async () => {
    const { projectId } = await newProject();
    const layout = await phaseOf(projectId, "LAYOUT");
    const supervision = await phaseOf(projectId, "SUPERVISION");
    await sf.phases.activatePhase({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: layout.id });
    await rejectsWith(sf.phases.activatePhase({ ...as(designer), projectId, phaseId: supervision.id }), "PHASE_SEQUENTIAL");
    const cd = await phaseOf(projectId, "CD");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" });
    await rejectsWith(sf.phases.activatePhase({ ...as(designer), projectId, phaseId: cd.id }), "PROJECT_NOT_ACTIVE");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ACTIVE" });
    const before = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(before.find((p) => p.key === "SUPERVISION")?.startBlockedReason, "Starts after Construction Drawing is approved.");
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: cd.id, reason: "Client does own drawings" });
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(phases.find((p) => p.key === "CD")?.status, "READY_FOR_NEXT");
    assert.equal(phases.find((p) => p.key === "SUPERVISION")?.startBlockedReason, null);
    // CD approved → Supervision can start (its predecessor is CD).
    await sf.phases.activatePhase({ ...as(designer), projectId, phaseId: supervision.id });
    await sf.phases.completeSupervision({ ...as(designer), projectId, phaseId: supervision.id });
    const project = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(project.status, "COMPLETED");
  });

  it("uses the drafter as fallback assignee on CD and restricts review to reviewers", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "CD");
    const base = { projectId, phaseId: cd.id };
    await sf.phases.activatePhase({ ...as(drafter, DRAFTER_GRANTS), ...base });
    await sf.phases.submitForInternalReview({ ...as(drafter, DRAFTER_GRANTS), ...base });
    await rejectsWith(sf.phases.approveInternal({ ...as(drafter, DRAFTER_GRANTS), ...base }), "PERMISSION_DENIED");
    await sf.phases.addActivity({ ...as(designer), ...base, content: "Fix section A", mode: "FEEDBACK" });
    await sf.phases.rejectPhase({ ...as(designer), ...base, type: "INTERNAL" });
    const todo = await testDb.prisma.sfActivity.findFirstOrThrow({ where: { phase_id: cd.id, mode: "TODO" } });
    assert.equal(todo.assigned_to_id, drafter.id);
  });

  it("defers to-dos, reopens with a reason, and overrides with a history snapshot", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "MOODBOARD");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const fb = await sf.phases.addActivity({ ...base, content: "feedback", mode: "FEEDBACK" });
    await rejectsWith(sf.phases.deferActivity({ ...base, activityId: fb.activityId }), "DEFER_FEEDBACK_BLOCKED");
    await sf.phases.deleteActivity({ ...base, activityId: fb.activityId });
    const todo = await sf.phases.addActivity({ ...base, content: "later", mode: "TODO" });
    await sf.phases.deferActivity({ ...base, activityId: todo.activityId });
    const deferred = await testDb.prisma.sfActivity.findUniqueOrThrow({ where: { id: todo.activityId } });
    assert.equal(deferred.revision_id, null);
    assert.equal(deferred.deferred_from_version, "v1.0");
    await rejectsWith(sf.phases.submitForInternalReview(base), "PHASE_OPEN_TODOS");
    await sf.phases.setActivityDone({ ...base, activityId: todo.activityId, done: true });
    await sf.phases.submitForClientReview(base);
    await sf.phases.approveClient(base);
    await rejectsWith(sf.phases.reopenPhase({ ...base, intent: "CLIENT", reason: "" }), "REOPEN_REASON_REQUIRED");
    const reopened = await sf.phases.reopenPhase({ ...base, intent: "CLIENT", reason: "Client changed brief" });
    assert.equal(reopened.revision, "v2.0");
    await rejectsWith(sf.phases.overrideRevision({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: phase.id, mode: "HARD_RESET_PENDING", note: "x" }), "PERMISSION_DENIED");
    await sf.phases.overrideRevision({ ...base, mode: "HARD_RESET_ACTIVE", major: 3, minor: 0, note: "Align with client numbering" });
    assert.deepEqual(await revisions(phase.id), ["v3.0:ACTIVE"]);
    const event = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { entity_id: phase.id, action: "studioflow.phase.revision-overridden" } });
    const history = (event.metadata as { history: Array<{ version: string }> }).history;
    assert.deepEqual(history.map((h) => h.version), ["v1.0", "v2.0"]);
  });
});

describe("SF-R1 checklist and Today", () => {
  it("keeps template rows, syncs idempotently, reorders, labels, and detaches", async () => {
    const general = await sf.tasks.createTemplate({ ...as(designer), phaseKey: null, label: "Site survey" });
    const { projectId } = await newProject();
    assert.equal((await sf.tasks.syncProjectChecklist({ ...as(designer), projectId })).created, 0);
    await sf.tasks.createTemplate({ ...as(designer), phaseKey: null, label: "Contract signed" });
    await sf.tasks.updateTemplate({ ...as(designer), templateId: general.templateId, label: "Site survey (renamed)" });
    assert.equal((await sf.tasks.syncProjectChecklist({ ...as(designer), projectId })).created, 1);
    const roots = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: null });
    assert.deepEqual(roots.map((r) => r.label), ["Site survey", "Contract signed"]);
    await rejectsWith(sf.tasks.deleteItem({ ...as(designer), projectId, itemId: roots[0].id }), "CHECKLIST_TEMPLATE_ROW");
    const sub = await sf.tasks.createSubtask({ ...as(designer), projectId, parentId: roots[0].id, label: "Measure", priority: 1, dueDate: "2026-09-10" });
    await rejectsWith(sf.tasks.createSubtask({ ...as(designer), projectId, parentId: sub.itemId, label: "too deep" }), "CHECKLIST_DEPTH");
    await sf.tasks.reorderItems({ ...as(designer), projectId, orderedIds: [roots[1].id, roots[0].id] });
    await rejectsWith(sf.tasks.reorderItems({ ...as(designer), projectId, orderedIds: [roots[1].id] }), "REORDER_SCOPE");
    await sf.tasks.attachLabel({ ...as(designer), projectId, itemId: sub.itemId, name: "Urgent", color: "danger" });
    await sf.tasks.detachFromTemplate({ ...as(designer), projectId, itemId: roots[0].id });
    await sf.tasks.deleteTemplate({ ...as(designer), templateId: general.templateId });
    const after = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: null });
    assert.deepEqual(after.map((r) => [r.label, r.children.map((c) => c.labels.map((l) => l.name))]), [["Contract signed", []], ["Site survey", [["urgent"]]]]);
    await sf.tasks.deleteItem({ ...as(designer), projectId, itemId: roots[0].id });
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { parent_id: roots[0].id } }), 0);
  });

  it("builds Today per project for the PIC, including empty and general work", async () => {
    await sf.tasks.createTemplate({ ...as(designer), phaseKey: "LAYOUT", label: "Layout checklist" });
    const one = await newProject("One");
    await newProject("Two");
    await sf.projects.setProjectPriority({ ...as(designer), projectId: one.projectId, priority: "URGENT" });
    await sf.phases.addActivity({ ...as(designer), projectId: one.projectId, phaseId: null, content: "Call client", mode: "TODO", dueDate: "2026-09-14" });
    await rejectsWith(sf.phases.addActivity({ ...as(designer), projectId: one.projectId, phaseId: null, content: "fb", mode: "FEEDBACK" }), "GENERAL_FEEDBACK_NOT_ALLOWED");
    const moodboard = await phaseOf(one.projectId, "MOODBOARD");
    await sf.phases.addActivity({ ...as(designer), projectId: one.projectId, phaseId: moodboard.id, content: "Board", mode: "TODO", assignedToId: drafter.id });

    const today = await sf.today.getToday({ grants: DRAFTER_GRANTS, userId: drafter.id, scope: "all" });
    assert.equal(today.scope, "mine", "scope all needs manage grant");
    assert.deepEqual(today.groups.map((g) => [g.project.name, g.project.isUrgent, g.tasks.length]), [["2026-001 One", true, 2], ["2026-002 Two", false, 0]]);
    assert.deepEqual(today.groups[0].tasks.map((t) => t.label), ["Call client", "Board"], "layout items stay quiet until the phase starts");
    const layoutTarget = today.addTargets[0].targets.find((t) => t.label === "Layout Plan");
    assert.equal(layoutTarget?.disabledReason, "Not started");

    const outsider = await seedUser("Other", ALL);
    const empty = await sf.today.getToday({ grants: ALL, userId: outsider.id });
    assert.equal(empty.groups.length, 0);
    const all = await sf.today.getToday({ grants: ALL, userId: outsider.id, scope: "all" });
    assert.equal(all.groups.length, 2);
  });

  it("stores saved filters per user", async () => {
    await sf.tasks.saveFilterView({ ...as(designer), name: "My P1", query: { status: "OPEN", priority: "P1", assignee: "ME", due: null } });
    await rejectsWith(sf.tasks.saveFilterView({ ...as(designer), name: "Bad", query: { status: "X" } as never }), "FILTER_QUERY_INVALID");
    assert.equal((await sf.tasks.listFilterViews({ grants: ALL, ownerId: designer.id })).length, 1);
    assert.equal((await sf.tasks.listFilterViews({ grants: ALL, ownerId: drafter.id })).length, 0);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const png = () => ({ body: PNG, contentType: "image/png" });

async function momShape(projectId: string, documentId: string) {
  const doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
  return doc.items.map((item) => ({ points: item.points.map((p) => p.text), slots: item.images.map((i) => i.slot) }));
}

describe("SF-R2 MOM", () => {
  it("creates a legacy-shaped document and edits its header", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId });
    const doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(doc.topic, "SITE INSPECTION REPORT");
    assert.equal(doc.meetingDate, "2026-09-15");
    assert.equal(doc.preparedByName, "Dina Designer");
    assert.deepEqual(await momShape(projectId, documentId), [{ points: [""], slots: [] }]);

    await sf.mom.updateDocument({ ...as(designer), projectId, documentId, topic: "Weekly meeting", meetingDate: "2026-09-20", venue: " Site ", attendees: "Client\nContractor", preparedByName: "Dina" });
    const list = await sf.mom.listDocuments({ grants: DRAFTER_GRANTS, projectId });
    assert.deepEqual(list.map((d) => [d.topic, d.meetingDate, d.venue, d.sectionCount]), [["Weekly meeting", "2026-09-20", "Site", 1]]);
    await rejectsWith(sf.mom.updateDocument({ ...as(designer), projectId, documentId, topic: " ", meetingDate: "2026-09-20", preparedByName: "D" }), "MOM_TOPIC_REQUIRED");
    await rejectsWith(sf.mom.updateDocument({ ...as(designer), projectId, documentId, topic: "T", meetingDate: "20-09-2026", preparedByName: "D" }), "MOM_DATE_INVALID");
    const audit = await testDb.prisma.auditEvent.findMany({ where: { entity_id: documentId }, orderBy: { occurred_at: "asc" } });
    assert.deepEqual(audit.map((a) => a.action), ["studioflow.mom.created", "studioflow.mom.updated"]);
  });

  it("orders sections and points, and keeps one point per section", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId });
    const first = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0];
    await sf.mom.updatePoint({ ...as(designer), projectId, pointId: first.points[0].id, text: "A", style: "DEFAULT" });
    const b = await sf.mom.addPoint({ ...as(designer), projectId, itemId: first.id, text: "B" });
    await sf.mom.movePoint({ ...as(designer), projectId, pointId: b.pointId, direction: "up" });
    const second = await sf.mom.addItem({ ...as(designer), projectId, documentId });
    await sf.mom.moveItem({ ...as(designer), projectId, itemId: second.itemId, direction: "up" });
    assert.deepEqual(await momShape(projectId, documentId), [{ points: [""], slots: [] }, { points: ["B", "A"], slots: [] }]);

    await rejectsWith(sf.mom.reorderItems({ ...as(designer), projectId, documentId, itemIds: [second.itemId] }), "MOM_REORDER_INVALID");
    await sf.mom.reorderItems({ ...as(designer), projectId, documentId, itemIds: [first.id, second.itemId] });
    const onlyPoint = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[1].points[0];
    await sf.mom.deletePoint({ ...as(designer), projectId, pointId: onlyPoint.id });
    const after = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(after.items[1].points.length, 1);
    assert.equal(after.items[1].points[0].text, "");
    assert.notEqual(after.items[1].points[0].id, onlyPoint.id);

    await sf.mom.updateItem({ ...as(designer), projectId, itemId: first.id, isTextOnly: true, listStyle: "DASH" });
    await rejectsWith(sf.mom.updateItem({ ...as(designer), projectId, itemId: first.id, isTextOnly: true, listStyle: "ROMAN" }), "MOM_LIST_STYLE_INVALID");
    await sf.mom.deleteItem({ ...as(designer), projectId, itemId: second.itemId });
    const final = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.deepEqual(final.items.map((i) => [i.isTextOnly, i.listStyle, i.points.map((p) => p.text)]), [[true, "DASH", ["B", "A"]]]);
  });

  it("stores at most two images per section and cleans storage", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId });
    const itemId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].id;

    const placed = await sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 1, file: png() });
    assert.equal(placed.slot, 0, "slot 1 on an empty section lands in slot 0");
    await sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 1, file: png() });
    assert.equal(storage.objects.size, 2);
    await rejectsWith(sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 2, file: png() }), "MOM_IMAGE_LIMIT");
    await rejectsWith(sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 0, file: { body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), contentType: "image/png" } }), "MOM_IMAGE_TYPE");
    await rejectsWith(sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 0, file: { body: PNG, contentType: "image/gif" } }), "MOM_IMAGE_TYPE");

    let doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    const [img0, img1] = doc.items[0].images;
    assert.ok(img0.url?.startsWith("https://storage.invalid/"));
    await sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 0, file: png() });
    assert.equal(storage.objects.size, 2, "replacing removes the previous object");

    await sf.mom.swapImages({ ...as(designer), projectId, itemId });
    doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(doc.items[0].images[0].url, img1.url, "swap moves the second image first");

    await sf.mom.deleteImage({ ...as(designer), projectId, imageId: doc.items[0].images[0].id });
    doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.deepEqual(doc.items[0].images.map((i) => i.slot), [0], "remaining image shifts to slot 0");
    assert.equal(storage.objects.size, 1);
    await rejectsWith(sf.mom.swapImages({ ...as(designer), projectId, itemId }), "MOM_IMAGE_SWAP_UNAVAILABLE");

    await sf.mom.deleteDocument({ ...as(designer), projectId, documentId });
    assert.equal(storage.objects.size, 0);
    assert.equal((await sf.mom.listDocuments({ grants: ALL, projectId })).length, 0);
    const deleted = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { action: "studioflow.mom.deleted" } });
    assert.deepEqual((deleted.metadata as { snapshot: { sections: number; images: number } }).snapshot.images, 1);
  });

  it("enforces permission, project scope, and archive read-only", async () => {
    const { projectId } = await newProject();
    const other = await newProject("Other project");
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId });
    const itemId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].id;

    await assert.rejects(sf.mom.createDocument({ ...as(drafter, DRAFTER_GRANTS), projectId }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");
    assert.equal(sf.mom.canManage(DRAFTER_GRANTS), false);
    await rejectsWith(sf.mom.getDocument({ grants: ALL, projectId: other.projectId, documentId }), "MOM_RECORD_NOT_FOUND");
    await rejectsWith(sf.mom.addItem({ ...as(designer), projectId: other.projectId, documentId }), "MOM_RECORD_NOT_FOUND");
    await rejectsWith(sf.mom.setImage({ ...as(designer), projectId: other.projectId, itemId, slot: 0, file: png() }), "MOM_RECORD_NOT_FOUND");
    assert.equal(storage.objects.size, 0, "no object is written for an out-of-scope item");

    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Done" });
    await rejectsWith(sf.mom.addItem({ ...as(designer), projectId, documentId }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 0, file: png() }), "PROJECT_ARCHIVED");
    assert.equal(storage.objects.size, 0, "a rejected upload leaves no orphan object");
    assert.equal((await sf.mom.listDocuments({ grants: DRAFTER_GRANTS, projectId })).length, 1);
  });
});

describe("SF-R3 Product Schedule", () => {
  it("creates entries with gapless codes, options, final approval, and promotion on delete", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    const first = await sf.schedule.createEntry({
      ...as(designer),
      projectId,
      section: "MATERIAL",
      category: "Paint",
      qty: "2",
      unit: "pail",
      location: "Bedroom",
      snapshot: { productName: "Dulux Easy Clean", brandName: "Dulux", skuText: "DX-01", color: "Warm White" },
    });
    const second = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Jotun Majestic", brandName: "Jotun" } });
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => [e.code, e.category, e.options[0]?.label, e.options[0]?.isFinal]), [
      ["PT-01", "Paint", "A", true],
      ["PT-02", "Paint", "A", true],
    ]);

    const option = await sf.schedule.createOption({ ...as(designer), projectId, entryId: first.entryId, snapshot: { productName: "Nippon Spotless", brandName: "Nippon", color: "Bone" } });
    await sf.schedule.markFinal({ ...as(designer), projectId, optionId: option.optionId });
    let entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.id === first.entryId)!;
    assert.deepEqual(entry.options.map((o) => [o.label, o.status, o.isFinal]), [["A", "NOT_USED", false], ["B", "APPROVED", true]]);

    await sf.schedule.deleteOption({ ...as(designer), projectId, optionId: option.optionId });
    entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.id === first.entryId)!;
    assert.deepEqual(entry.options.map((o) => [o.label, o.status, o.isFinal]), [["A", "APPROVED", true]]);

    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: first.entryId });
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code), ["PT-01"]);
    assert.equal(second.entryId.length > 0, true);
  });

  it("applies templates idempotently and snapshots Master Data Brand through the public port", async () => {
    const brand = await testDb.prisma.brand.create({ data: { id: randomUUID(), name: "TACO", slug: "taco" } });
    const category = await sf.schedule.upsertTemplateCategory({ ...as(designer), section: "MATERIAL", category: "HPL", isDefaultEntry: true });
    await sf.schedule.createTemplateItem({
      ...as(designer),
      templateCategoryId: category.templateCategoryId,
      section: "MATERIAL",
      category: "HPL",
      snapshot: { brandId: brand.id, productName: "TH 121 AA", skuText: "TH-121", finishing: "Doff" },
      qty: "1",
      unit: "sheet",
      location: "Cabinet",
    });
    const { projectId } = await newProject();
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 1 });
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 0 });
    const [entry] = await sf.schedule.listSchedule({ grants: ALL, projectId });
    assert.equal(entry.category, "HPL");
    assert.equal(entry.options[0].brandId, brand.id);
    assert.equal(entry.options[0].brandName, "TACO");
  });

  it("reuses past project snapshots and imports legacy CSV rows", async () => {
    const source = await newProject("Source");
    const target = await newProject("Target");
    const sourceEntry = await sf.schedule.createEntry({ ...as(designer), projectId: source.projectId, section: "FIXTURE", category: "Loose Furniture", snapshot: { productName: "Aria Chair", brandName: "Cellini", color: "Grey" } });
    const reusable = await sf.schedule.searchReusableOptions({ grants: ALL, projectId: target.projectId, query: "aria", section: "FIXTURE" });
    assert.equal(reusable.length, 1);

    const targetEntry = await sf.schedule.createEntry({ ...as(designer), projectId: target.projectId, section: "FIXTURE", category: "Loose Furniture" });
    await sf.schedule.copyReusableOption({ ...as(designer), projectId: target.projectId, entryId: targetEntry.entryId, sourceOptionId: reusable[0].optionId });
    const copied = (await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId })).find((row) => row.id === targetEntry.entryId)!;
    assert.equal(copied.options[0].productName, "Aria Chair");

    const imported = await sf.schedule.importCsv({
      ...as(designer),
      projectId: target.projectId,
      section: "MATERIAL",
      csv: "category,brand,product,sku,color,qty,unit,location\nTile,Roman,Granitio,GR-1,Ivory,12,m2,Lobby\n",
    });
    assert.equal(imported.created, 1);
    assert.ok((await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId, section: "MATERIAL" })).some((row) => row.options[0].productName === "Granitio"));
    assert.notEqual(sourceEntry.entryId, targetEntry.entryId);
  });

  it("enforces permissions, project scope, and archive read-only", async () => {
    const { projectId } = await newProject();
    const other = await newProject("Other");
    const entry = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    await assert.rejects(sf.schedule.createEntry({ ...as(drafter, DRAFTER_GRANTS), projectId, section: "MATERIAL", category: "Stone" }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");
    assert.equal(sf.schedule.canManage(DRAFTER_GRANTS), false);
    await rejectsWith(sf.schedule.createOption({ ...as(designer), projectId: other.projectId, entryId: entry.entryId, snapshot: { productName: "x" } }), "SCHEDULE_ITEM_NOT_FOUND");
    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Done" });
    await rejectsWith(sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" }), "PROJECT_ARCHIVED");
    assert.equal((await sf.schedule.listSchedule({ grants: DRAFTER_GRANTS, projectId })).length, 1);
  });
});
