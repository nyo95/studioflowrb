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
import { dateToDateOnly } from "./domain/dates";
import { LEGACY_PHASE_DEFINITION_IDS as LEGACY } from "./domain/phase";
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

async function seedDefaultTemplate() {
  const db = testDb.prisma;
  const template = await db.sfPhaseTemplate.create({ data: { name: "Standard", is_default: true, is_active: true } });
  const defs: Array<{ id: string; name: string; prefix: string; orderIndex: number; allowParallel: boolean; seat: string }> = [
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
  await testDb.pool.query(`TRUNCATE TABLE ${[
    "sf_schedule_option", "sf_schedule_entry", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix",
    "sf_mom_image", "sf_mom_item", "sf_mom_document",
    "sf_checklist_item_label", "sf_checklist_label", "sf_checklist_filter_view", "sf_checklist_item", "sf_checklist_template",
    "sf_deliverable",
    "sf_activity", "sf_revision", "sf_phase",
    "sf_phase_definition", "sf_phase_template",
    "sf_project", "sf_client", "sf_project_sequence", "sf_settings",
  ].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await truncatePlatformTables(testDb);
  await seedDefaultTemplate();
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

async function phaseOf(projectId: string, legacy: keyof typeof LEGACY) {
  return testDb.prisma.sfPhase.findFirstOrThrow({ where: { project_id: projectId, definition_id: LEGACY[legacy] } });
}

async function revisions(phaseId: string) {
  return (await testDb.prisma.sfRevision.findMany({ where: { phase_id: phaseId }, orderBy: [{ major: "asc" }, { minor: "asc" }] })).map((r) => `v${r.major}.${r.minor}:${r.status}`);
}

describe("SF-R1 bootstrap and naming", () => {
  it("creates the legacy project skeleton with auto naming and template seeding", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: null, label: "Kick-off meeting" });
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Collect references" });
    const first = await newProject();
    const second = await newProject("Kopi Kenangan");
    assert.equal(first.name, "2026-001 Heloskin Cimanggu");
    assert.equal(second.name, "2026-002 Kopi Kenangan");

    const phases = await testDb.prisma.sfPhase.findMany({ where: { project_id: first.projectId }, orderBy: { order_index: "asc" } });
    assert.deepEqual(phases.map((p) => [p.definition_id, p.status, p.allow_parallel]), [
      [LEGACY.moodboard, "IN_PROGRESS", false], [LEGACY.layout, "PENDING", true], [LEGACY.design3d, "PENDING", true], [LEGACY.cd, "PENDING", true], [LEGACY.supervision, "PENDING", false],
    ]);
    assert.deepEqual(await revisions(phases[0].id), ["v1.0:ACTIVE"]);
    const items = await testDb.prisma.sfChecklistItem.findMany({ where: { project_id: first.projectId } });
    assert.deepEqual(items.map((i) => [i.label, i.phase_id === null]).sort(), [["Collect references", false], ["Kick-off meeting", true]]);
    const clients = await sf.projects.listClients({ grants: ALL });
    assert.equal(clients.length, 1);
    assert.equal(clients[0].activeProjects, 2);
  });

  it("SF-05: a concurrent client-name race converges on one client row instead of failing the loser", async () => {
    const clientName = `Concurrent Client ${randomUUID().slice(0, 6)}`;
    const results = await Promise.all([
      sf.projects.createProject({ ...as(designer), name: "Race A", newClientName: clientName, picDesignerId: designer.id, picDrafterId: drafter.id }),
      sf.projects.createProject({ ...as(designer), name: "Race B", newClientName: clientName, picDesignerId: designer.id, picDrafterId: drafter.id }),
    ]);
    assert.equal(results.length, 2, "upsertClientByName re-fetches on a name-uniqueness conflict instead of erroring, so both concurrent creates succeed");
    const clients = await sf.projects.listClients({ grants: ALL });
    const matching = clients.filter((c) => c.name === clientName);
    assert.equal(matching.length, 1, "only one client row is ever created for the race");
    assert.equal(matching[0].activeProjects, 2, "both projects resolved to the same client row");
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
    const moodboard = await phaseOf(projectId, "moodboard");
    await rejectsWith(sf.phases.addActivity({ ...as(designer), projectId, phaseId: moodboard.id, content: "x", mode: "FEEDBACK" }), "PROJECT_ARCHIVED");
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
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };

    // V2: to-dos are checklist items; activities are FEEDBACK-only
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Draft board" });
    await sf.tasks.syncProjectChecklist({ ...as(designer), projectId });
    const items = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id });
    const todo = items[0];
    await rejectsWith(sf.phases.submitForInternalReview(base), "PHASE_OPEN_TODOS");
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: todo.id, checked: true });
    await sf.phases.submitForInternalReview(base);

    await sf.phases.addActivity({ ...base, content: "Warmer palette", mode: "FEEDBACK" });
    await rejectsWith(sf.phases.approveInternal(base), "PHASE_APPROVAL_BLOCKED");
    const rejected = await sf.phases.rejectPhase({ ...base, type: "INTERNAL" });
    assert.equal(rejected.revision, "MB1.1");
    assert.equal(rejected.converted, 1);
    // V2: converted feedback becomes a SfChecklistItem, not a SfActivity(TODO)
    const converted = await testDb.prisma.sfChecklistItem.findFirstOrThrow({ where: { phase_id: phase.id, is_checked: false } });
    assert.equal(converted.assigned_to_id, designer.id);
    const original = await testDb.prisma.sfActivity.findFirstOrThrow({ where: { phase_id: phase.id, mode: "FEEDBACK" } });
    assert.equal(original.status, "COMPLETED", "carried-forward feedback no longer counts as open work");
    const [listed] = (await sf.projects.listProjects({ grants: ALL })).filter((p) => p.id === projectId);
    assert.ok(listed, "project is listed");

    // An item kept on someone who lost phase.work stays editable when the assignee is unchanged.
    const former = await seedUser("Former Staff", [P.access, P.projectRead]);
    await testDb.prisma.sfActivity.update({ where: { id: original.id }, data: { assigned_to_id: former.id } });
    await sf.phases.updateActivity({ ...base, activityId: original.id, content: "Warmer palette v2", assignedToId: former.id });
    const viewer = await seedUser("Viewer Only", [P.access, P.projectRead]);
    await rejectsWith(sf.phases.updateActivity({ ...base, activityId: original.id, assignedToId: viewer.id }), "ASSIGNEE_NOT_ELIGIBLE");

    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: converted.id, checked: true });
    await sf.phases.submitForInternalReview(base);
    await sf.phases.approveInternal(base);
    await sf.phases.submitForClientReview(base);
    await sf.phases.addActivity({ ...base, content: "Client wants marble", mode: "FEEDBACK" });
    const clientReject = await sf.phases.rejectPhase({ ...base, type: "CLIENT" });
    assert.equal(clientReject.revision, "MB2.0");
    assert.deepEqual(await revisions(phase.id), ["v1.0:COMPLETED", "v1.1:COMPLETED", "v2.0:ACTIVE"]);

    // V2: client feedback converts to checklist item on rejection, so complete that instead.
    const marble = await testDb.prisma.sfChecklistItem.findFirstOrThrow({ where: { phase_id: phase.id, label: "Client wants marble", is_checked: false } });
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: marble.id, checked: true });
    await sf.phases.submitForClientReview(base);
    clock = new Date("2026-09-18T03:00:00Z");
    const approved = await sf.phases.approveClient(base);
    assert.equal(approved.projectCompleted, false);
    const after = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id } });
    assert.equal(after.status, "READY_FOR_NEXT");
    assert.equal(after.is_locked, true);
    await rejectsWith(sf.phases.addActivity({ ...base, content: "late", mode: "FEEDBACK" }), "PHASE_LOCKED");

    const actions = (await testDb.prisma.auditEvent.findMany({ where: { entity_id: phase.id }, orderBy: { occurred_at: "asc" } })).map((e) => e.action);
    assert.ok(actions.includes("studioflow.phase.rejected-internal"));
    assert.ok(actions.includes("studioflow.phase.approved-client"));
  });

  it("blocks approval on unchecked root checklist items only", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Board printed" });
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
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
    const layout = await phaseOf(projectId, "layout");
    const supervision = await phaseOf(projectId, "supervision");
    await sf.phases.activatePhase({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: layout.id });
    await rejectsWith(sf.phases.activatePhase({ ...as(designer), projectId, phaseId: supervision.id }), "PHASE_SEQUENTIAL");
    // "Reopen" must not sidestep the start rules for a phase that has not started.
    await rejectsWith(sf.phases.reopenPhase({ ...as(designer), projectId, phaseId: supervision.id, intent: "INTERNAL", reason: "early" }), "PHASE_SEQUENTIAL");
    const supervisionDetail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: supervision.id });
    assert.equal(supervisionDetail.commands.includes("reopen"), false);
    const cd = await phaseOf(projectId, "cd");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" });
    await rejectsWith(sf.phases.activatePhase({ ...as(designer), projectId, phaseId: cd.id }), "PROJECT_NOT_ACTIVE");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ACTIVE" });
    const before = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(before.find((p) => p.definitionId === LEGACY.supervision)?.startBlockedReason, "Starts after Construction Drawing is approved.");
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: cd.id, reason: "Client does own drawings" });
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(phases.find((p) => p.definitionId === LEGACY.cd)?.status, "READY_FOR_NEXT");
    assert.equal(phases.find((p) => p.definitionId === LEGACY.supervision)?.startBlockedReason, null);
    // CD approved → Supervision can start (its predecessor is CD).
    await sf.phases.activatePhase({ ...as(designer), projectId, phaseId: supervision.id });
    await sf.phases.completeSupervision({ ...as(designer), projectId, phaseId: supervision.id });
    const project = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(project.status, "COMPLETED");
  });

  it("uses the drafter as fallback assignee on CD and restricts review to reviewers", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    const base = { projectId, phaseId: cd.id };
    await sf.phases.activatePhase({ ...as(drafter, DRAFTER_GRANTS), ...base });
    await sf.phases.submitForInternalReview({ ...as(drafter, DRAFTER_GRANTS), ...base });
    await rejectsWith(sf.phases.approveInternal({ ...as(drafter, DRAFTER_GRANTS), ...base }), "PERMISSION_DENIED");
    await sf.phases.addActivity({ ...as(designer), ...base, content: "Fix section A", mode: "FEEDBACK" });
    await sf.phases.rejectPhase({ ...as(designer), ...base, type: "INTERNAL" });
    // V2: rejected feedback converts to SfChecklistItem with drafter as fallback assignee
    const todo = await testDb.prisma.sfChecklistItem.findFirstOrThrow({ where: { phase_id: cd.id } });
    assert.equal(todo.assigned_to_id, drafter.id);
  });

  it("reopens with a reason and overrides with a history snapshot", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const fb = await sf.phases.addActivity({ ...base, content: "feedback", mode: "FEEDBACK" });
    await sf.phases.deleteActivity({ ...base, activityId: fb.activityId });
    // Reach approved state: submit → approve internal → submit client → approve
    await sf.phases.submitForInternalReview(base);
    await sf.phases.approveInternal(base);
    await sf.phases.submitForClientReview(base);
    await sf.phases.approveClient(base);
    await rejectsWith(sf.phases.reopenPhase({ ...base, intent: "CLIENT", reason: "" }), "REOPEN_REASON_REQUIRED");
    const reopened = await sf.phases.reopenPhase({ ...base, intent: "CLIENT", reason: "Client changed brief" });
    assert.equal(reopened.revision, "MB2.0");
    await rejectsWith(sf.phases.overrideRevision({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: phase.id, mode: "HARD_RESET_PENDING", note: "x" }), "PERMISSION_DENIED");
    await sf.phases.overrideRevision({ ...base, mode: "HARD_RESET_ACTIVE", major: 3, minor: 0, note: "Align with client numbering" });
    assert.deepEqual(await revisions(phase.id), ["v3.0:ACTIVE"]);
    const event = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { entity_id: phase.id, action: "studioflow.phase.revision-overridden" } });
    const history = (event.metadata as { history: Array<{ version: string }> }).history;
    assert.deepEqual(history.map((h) => h.version), ["MB1.0", "MB2.0"]);
  });
});

describe("SF-R1 checklist and Today", () => {
  it("keeps template rows, syncs idempotently, reorders, labels, and detaches", async () => {
    const general = await sf.tasks.createTemplate({ ...as(designer), definitionId: null, label: "Site survey" });
    const { projectId } = await newProject();
    assert.equal((await sf.tasks.syncProjectChecklist({ ...as(designer), projectId })).created, 0);
    await sf.tasks.createTemplate({ ...as(designer), definitionId: null, label: "Contract signed" });
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
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.layout, label: "Layout checklist" });
    const one = await newProject("One");
    await newProject("Two");
    await sf.projects.setProjectPriority({ ...as(designer), projectId: one.projectId, priority: "URGENT" });
    // V2: general tasks are checklist items (phaseId: null); FEEDBACK requires a phase
    await sf.tasks.createItem({ ...as(designer), projectId: one.projectId, phaseId: null, label: "Call client", dueDate: "2026-09-14" });
    // V2: phaseId: null is rejected by TypeScript (addActivity requires phaseId: string); runtime guard is FEEDBACK_PHASE_REQUIRED
    const moodboard = await phaseOf(one.projectId, "moodboard");
    await sf.tasks.createItem({ ...as(designer), projectId: one.projectId, phaseId: moodboard.id, label: "Board", assignedToId: drafter.id });

    const today = await sf.today.getToday({ ...as(drafter, DRAFTER_GRANTS), scope: "all" });
    assert.equal(today.scope, "mine", "scope all needs manage grant");
    assert.deepEqual(today.groups.map((g) => [g.project.name, g.project.isUrgent, g.tasks.length]), [["2026-001 One", true, 2], ["2026-002 Two", false, 0]]);
    assert.deepEqual(today.groups[0].tasks.map((t) => t.label), ["Call client", "Board"], "layout items stay quiet until the phase starts");
    const layoutTarget = today.addTargets[0].targets.find((t) => t.label === "Layout Plan");
    assert.equal(layoutTarget?.disabledReason, "Not started");

    const outsider = await seedUser("Other", ALL);
    const empty = await sf.today.getToday({ ...as(outsider) });
    assert.equal(empty.groups.length, 0);
    const all = await sf.today.getToday({ ...as(outsider), scope: "all" });
    assert.equal(all.groups.length, 2);
  });

  it("stores saved filters per user", async () => {
    await sf.tasks.saveFilterView({ ...as(designer), name: "My P1", query: { status: "OPEN", priority: "P1", assignee: "ME", due: null } });
    await rejectsWith(sf.tasks.saveFilterView({ ...as(designer), name: "Bad", query: { status: "X" } as never }), "FILTER_QUERY_INVALID");
    assert.equal((await sf.tasks.listFilterViews({ ...as(designer) })).length, 1);
    assert.equal((await sf.tasks.listFilterViews({ ...as(drafter) })).length, 0);
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const png = () => ({ body: PNG, contentType: "image/png" });

async function momShape(projectId: string, documentId: string) {
  const doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
  return doc.items.map((item) => ({ content: item.content, slots: item.images.map((i) => i.slot) }));
}

describe("SF-R2 MOM revisions", () => {
  const editFirstPoint = async (projectId: string, documentId: string, text: string) => {
    const item = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0];
    await sf.mom.updateItemContent({ ...as(designer), projectId, itemId: item.id, content: text });
  };
  const firstText = async (projectId: string, documentId: string) =>
    (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].content;

  it("saves numbered revisions, detects unsaved edits, and restores without losing work", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    await editFirstPoint(projectId, documentId, "A");

    assert.deepEqual(await sf.mom.saveRevision({ ...as(designer), projectId, documentId }), { number: 1 });
    let doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(doc.hasUnsavedChanges, false);
    assert.equal((await sf.mom.listDocuments({ grants: ALL, projectId }))[0].latestRevision, 1);
    await rejectsWith(sf.mom.saveRevision({ ...as(designer), projectId, documentId }), "MOM_REVISION_NO_CHANGES");

    await editFirstPoint(projectId, documentId, "B");
    assert.equal((await sf.mom.getDocument({ grants: ALL, projectId, documentId })).hasUnsavedChanges, true);
    assert.deepEqual(await sf.mom.saveRevision({ ...as(designer), projectId, documentId, note: " Sent to client " }), { number: 2 });

    await editFirstPoint(projectId, documentId, "C");
    doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    const v1 = doc.revisions.find((revision) => revision.number === 1)!;
    assert.deepEqual(doc.revisions.map((revision) => [revision.number, revision.note]), [[2, "Sent to client"], [1, null]]);

    await sf.mom.restoreRevision({ ...as(designer), projectId, documentId, revisionId: v1.id });
    assert.equal(await firstText(projectId, documentId), "A");
    doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.deepEqual(doc.revisions.map((revision) => [revision.number, revision.note]), [[3, "Before restoring v1"], [2, "Sent to client"], [1, null]]);
    assert.equal(doc.hasUnsavedChanges, true, "restored content differs from the newest revision until it is saved");

    const backup = doc.revisions[0];
    await sf.mom.restoreRevision({ ...as(designer), projectId, documentId, revisionId: backup.id });
    assert.equal(await firstText(projectId, documentId), "C", "the pre-restore state is recoverable");
    await rejectsWith(sf.mom.restoreRevision({ ...as(designer), projectId, documentId, revisionId: backup.id }), "MOM_REVISION_ALREADY_CURRENT");

    const audit = await testDb.prisma.auditEvent.findMany({ where: { entity_id: documentId, action: { startsWith: "studioflow.mom.revision" } }, orderBy: { occurred_at: "asc" } });
    assert.deepEqual(audit.map((entry) => entry.action), [
      "studioflow.mom.revision-saved", "studioflow.mom.revision-saved", "studioflow.mom.revision-restored", "studioflow.mom.revision-restored",
    ]);
  });

  it("keeps only the newest revisions and never reuses a number", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    for (let round = 1; round <= 7; round += 1) {
      await editFirstPoint(projectId, documentId, `text ${round}`);
      await sf.mom.saveRevision({ ...as(designer), projectId, documentId });
    }
    const doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(doc.revisionRetention, 5);
    assert.deepEqual(doc.revisions.map((revision) => revision.number), [7, 6, 5, 4, 3]);
  });

  it("keeps photos alive while a revision needs them and frees them afterwards", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    const itemId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].id;
    await sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 0, file: png() });
    await sf.mom.saveRevision({ ...as(designer), projectId, documentId });

    const imageId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].images[0].id;
    await sf.mom.deleteImage({ ...as(designer), projectId, imageId });
    assert.equal(storage.objects.size, 1, "v1 still references the photo");

    const v1 = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).revisions[0];
    await sf.mom.restoreRevision({ ...as(designer), projectId, documentId, revisionId: v1.id });
    const restored = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(restored.items[0].images.length, 1, "the photo comes back with the restore");
    assert.ok(restored.items[0].images[0].url);

    await sf.mom.deleteDocument({ ...as(designer), projectId, documentId });
    assert.equal(storage.objects.size, 0, "deleting the MOM frees every photo, including revision-only ones");
  });

  it("frees a photo when the last revision holding it is overwritten", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    const itemId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].id;
    await sf.mom.setImage({ ...as(designer), projectId, itemId, slot: 0, file: png() });
    await sf.mom.saveRevision({ ...as(designer), projectId, documentId });
    const imageId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].images[0].id;
    await sf.mom.deleteImage({ ...as(designer), projectId, imageId });
    for (let round = 1; round <= 5; round += 1) {
      await editFirstPoint(projectId, documentId, `text ${round}`);
      await sf.mom.saveRevision({ ...as(designer), projectId, documentId });
    }
    assert.equal(storage.objects.size, 0, "v1 was overwritten and nothing else referenced its photo");
  });

  it("requires MOM permission and a writable project", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    await editFirstPoint(projectId, documentId, "A");
    await sf.mom.saveRevision({ ...as(designer), projectId, documentId });
    const v1 = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).revisions[0];
    await assert.rejects(sf.mom.saveRevision({ ...as(drafter, DRAFTER_GRANTS), projectId, documentId }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");
    await assert.rejects(sf.mom.restoreRevision({ ...as(drafter, DRAFTER_GRANTS), projectId, documentId, revisionId: v1.id }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");

    const other = await newProject("Other project");
    await rejectsWith(sf.mom.restoreRevision({ ...as(designer), projectId: other.projectId, documentId, revisionId: v1.id }), "MOM_RECORD_NOT_FOUND");

    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Done" });
    await rejectsWith(sf.mom.saveRevision({ ...as(designer), projectId, documentId }), "PROJECT_ARCHIVED");
  });
});

describe("SF-R2 MOM", () => {
  it("creates a legacy-shaped document and edits its header", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    const doc = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.equal(doc.topic, "Weekly meeting");
    assert.equal(doc.hasUnsavedChanges, true, "a new MOM is a draft until its first revision");
    await rejectsWith(sf.mom.createDocument({ ...as(designer), projectId, topic: "  " }), "MOM_TOPIC_REQUIRED");
    assert.equal(doc.meetingDate, "2026-09-15");
    assert.equal(doc.preparedByName, "Dina Designer");
    assert.deepEqual(await momShape(projectId, documentId), [{ content: "", slots: [] }]);

    await sf.mom.updateDocument({ ...as(designer), projectId, documentId, topic: "Weekly meeting", meetingDate: "2026-09-20", venue: " Site ", attendees: "Client\nContractor", preparedByName: "Dina" });
    const list = await sf.mom.listDocuments({ grants: DRAFTER_GRANTS, projectId });
    assert.deepEqual(list.map((d) => [d.topic, d.meetingDate, d.venue, d.sectionCount]), [["Weekly meeting", "2026-09-20", "Site", 1]]);
    await rejectsWith(sf.mom.updateDocument({ ...as(designer), projectId, documentId, topic: " ", meetingDate: "2026-09-20", preparedByName: "D" }), "MOM_TOPIC_REQUIRED");
    await rejectsWith(sf.mom.updateDocument({ ...as(designer), projectId, documentId, topic: "T", meetingDate: "20-09-2026", preparedByName: "D" }), "MOM_DATE_INVALID");
    const audit = await testDb.prisma.auditEvent.findMany({ where: { entity_id: documentId }, orderBy: { occurred_at: "asc" } });
    assert.deepEqual(audit.map((a) => a.action), ["studioflow.mom.created", "studioflow.mom.updated"]);
  });

  it("orders sections and edits a section's free-typed content", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    const first = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0];
    await sf.mom.updateItemContent({ ...as(designer), projectId, itemId: first.id, content: "1. A\n2. B" });
    const second = await sf.mom.addItem({ ...as(designer), projectId, documentId });
    await sf.mom.moveItem({ ...as(designer), projectId, itemId: second.itemId, direction: "up" });
    assert.deepEqual(await momShape(projectId, documentId), [{ content: "", slots: [] }, { content: "1. A\n2. B", slots: [] }]);

    await rejectsWith(sf.mom.reorderItems({ ...as(designer), projectId, documentId, itemIds: [second.itemId] }), "MOM_REORDER_INVALID");
    await sf.mom.reorderItems({ ...as(designer), projectId, documentId, itemIds: [first.id, second.itemId] });

    await sf.mom.updateItem({ ...as(designer), projectId, itemId: first.id, isTextOnly: true });
    await sf.mom.deleteItem({ ...as(designer), projectId, itemId: second.itemId });
    const final = await sf.mom.getDocument({ grants: ALL, projectId, documentId });
    assert.deepEqual(final.items.map((i) => [i.isTextOnly, i.content]), [[true, "1. A\n2. B"]]);
  });

  it("stores at most two images per section and cleans storage", async () => {
    const { projectId } = await newProject();
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
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
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Weekly meeting" });
    const itemId = (await sf.mom.getDocument({ grants: ALL, projectId, documentId })).items[0].id;

    await assert.rejects(sf.mom.createDocument({ ...as(drafter, DRAFTER_GRANTS), projectId, topic: "Weekly meeting" }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");
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
      snapshot: { productName: "Dulux Easy Clean - DX-01", brandName: "Dulux", color: "Warm White", extra: [{ label: "Coverage", value: "12 m²/L" }] },
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

  it("tracks a physical sample request through to received, blocking a second pending request but allowing a re-request after", async () => {
    const { projectId } = await newProject();
    const { entryId } = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Dulux Easy Clean - DX-01", brandName: "Dulux" } });
    const entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!;
    const optionId = entry.options[0].id;
    assert.equal(entry.options[0].sampleRequest, null);

    const { requestId } = await sf.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "PT Sumber Jaya", note: "Ask for the matte finish" });
    let updated = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entry.id)!;
    assert.deepEqual(
      [updated.options[0].sampleRequest?.status, updated.options[0].sampleRequest?.requestedFrom, updated.options[0].sampleRequest?.note],
      ["REQUESTED", "PT Sumber Jaya", "Ask for the matte finish"],
    );

    await rejectsWith(sf.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Another vendor" }), "SAMPLE_ALREADY_REQUESTED");

    await sf.schedule.receiveSample({ ...as(designer), projectId, requestId, note: "Arrived slightly darker than swatch" });
    updated = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entry.id)!;
    assert.deepEqual(
      [updated.options[0].sampleRequest?.status, updated.options[0].sampleRequest?.receivedNote, updated.options[0].sampleRequest?.receivedByName],
      ["RECEIVED", "Arrived slightly darker than swatch", "Dina Designer"],
    );

    await rejectsWith(sf.schedule.receiveSample({ ...as(designer), projectId, requestId, note: null }), "SAMPLE_NOT_PENDING");

    // A new request is allowed once the previous one is resolved.
    await sf.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "PT Sumber Jaya (again)" });
    updated = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entry.id)!;
    assert.equal(updated.options[0].sampleRequest?.requestedFrom, "PT Sumber Jaya (again)");
  });

  it("applies templates idempotently and snapshots Master Data Brand through the public port", async () => {
    const tag = randomUUID().slice(0, 8);
    const brand = await testDb.prisma.brand.create({ data: { id: randomUUID(), name: `TACO ${tag}`, slug: `taco-${tag}` } });
    const category = await sf.schedule.upsertTemplateCategory({ ...as(designer), section: "MATERIAL", category: "HPL", isDefaultEntry: true });
    await sf.schedule.createTemplateItem({
      ...as(designer),
      templateCategoryId: category.templateCategoryId,
      section: "MATERIAL",
      category: "HPL",
      snapshot: { brandId: brand.id, productName: "TH 121 AA - TH-121", finishing: "Doff" },
      qty: "1",
      unit: "sheet",
      location: "Cabinet",
    });
    const { projectId } = await newProject();
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId })).length, 1, "seeded when the project was created");
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 0 });
    const older = await testDb.prisma.sfScheduleEntry.deleteMany({ where: { project_id: projectId } });
    assert.equal(older.count, 1);
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 1 });
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 0 });
    const [entry] = await sf.schedule.listSchedule({ grants: ALL, projectId });
    assert.equal(entry.category, "HPL");
    assert.equal(entry.options[0].brandId, brand.id);
    assert.equal(entry.options[0].brandName, `TACO ${tag}`);
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
    // An article-code column is appended to Type rather than stored twice (R8.111).
    assert.ok((await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId, section: "MATERIAL" })).some((row) => row.options[0].productName === "Granitio - GR-1"));
    assert.notEqual(sourceEntry.entryId, targetEntry.entryId);
  });

  it("roundtrips pattern field and uses PAINT → PT prefix fallback", async () => {
    const { projectId } = await newProject();
    const { entryId } = await sf.schedule.createEntry({
      ...as(designer),
      projectId,
      section: "MATERIAL",
      category: "Paint",
      snapshot: { productName: "Dulux Easy Clean", brandName: "Dulux", color: "Warm White", pattern: "Solid", finishing: "Matt" },
    });
    const listed = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((r) => r.id === entryId)!;
    assert.equal(listed.code, "PT-01", "Paint category defaults to PT prefix");
    assert.equal(listed.options[0].pattern, "Solid", "pattern roundtrips through create and list");

    const updated = await sf.schedule.updateOption({
      ...as(designer),
      projectId,
      optionId: listed.options[0].id,
      snapshot: { productName: "Dulux Easy Clean", brandName: "Dulux", color: "Warm White", pattern: "Woodgrain", finishing: "Satin" },
    });
    const listed2 = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((r) => r.id === entryId)!;
    assert.equal(listed2.options[0].pattern, "Woodgrain", "pattern updates correctly");
  });

  it("keeps the existing project prefix for a category (PA compat) instead of mixing codes", async () => {
    const { projectId } = await newProject();
    const first = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    // Simulate persisted legacy rows that predate the PT fallback and already use PA.
    await testDb.prisma.sfScheduleEntry.update({ where: { id: first.entryId }, data: { prefix: "PA" } });
    const second = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "More paint" } });
    const rows = await sf.schedule.listSchedule({ grants: ALL, projectId });
    const codes = rows.map((r) => r.code);
    assert.deepEqual(codes, ["PA-01", "PA-02"], "a new Paint row follows the existing project prefix (PA)");
    assert.ok(codes.every((c) => c.startsWith("PA-")), `no mixed PA/PT codes, got ${codes.join(", ")}`);
    assert.equal(second.entryId.length > 0, true);
  });

  it("preserves pattern through template items, seeding, reuse, and search", async () => {
    const category = await sf.schedule.upsertTemplateCategory({ ...as(designer), section: "MATERIAL", category: "Paint" });
    await sf.schedule.createTemplateItem({
      ...as(designer),
      templateCategoryId: category.templateCategoryId,
      section: "MATERIAL",
      category: "Paint",
      snapshot: { productName: "Easy Clean", pattern: "Marble" },
      qty: "1",
      unit: "pail",
      location: "Lobby",
    });
    const seeded = await testDb.prisma.sfScheduleTemplateItem.findFirst({ where: { product_name: "Easy Clean" } });
    assert.equal(seeded?.pattern, "Marble", "template item create preserves pattern");

    await sf.schedule.updateTemplateItem({
      ...as(designer),
      templateItemId: seeded!.id,
      snapshot: { productName: "Easy Clean", pattern: "Marble", color: "White" },
      qty: "1",
      unit: "pail",
      location: "Lobby",
    });
    const after = await testDb.prisma.sfScheduleTemplateItem.findUniqueOrThrow({ where: { id: seeded!.id } });
    assert.equal(after.pattern, "Marble", "editing an unrelated template field keeps pattern");
    assert.equal(after.color, "White");

    const seededProject = (await sf.schedule.listSchedule({ grants: ALL, projectId: (await newProject()).projectId })).find((r) => r.category === "Paint")!;
    assert.equal(seededProject.options[0]?.pattern, "Marble", "template seeding propagates pattern to the project row");

    const source = await newProject("Source");
    const sourceEntry = await sf.schedule.createEntry({ ...as(designer), projectId: source.projectId, section: "MATERIAL", category: "Stone", snapshot: { productName: "Granite Slab", brandName: "Cotto", pattern: "Flaming" } });
    const sourceOption = await testDb.prisma.sfScheduleOption.findFirstOrThrow({ where: { entry_id: sourceEntry.entryId } });
    const target = await newProject("Target");
    const hits = await sf.schedule.searchReusableOptions({ grants: ALL, projectId: target.projectId, query: "flaming", section: "MATERIAL" });
    assert.ok(hits.some((h) => h.pattern === "Flaming"), "search key includes pattern");

    const targetEntry = await sf.schedule.createEntry({ ...as(designer), projectId: target.projectId, section: "MATERIAL", category: "Stone" });
    await sf.schedule.copyReusableOption({ ...as(designer), projectId: target.projectId, entryId: targetEntry.entryId, sourceOptionId: sourceOption.id });
    const copied = (await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId })).find((r) => r.id === targetEntry.entryId)!;
    assert.equal(copied.options[0].pattern, "Flaming", "reuse copies pattern");

    const edited = await sf.schedule.updateOption({
      ...as(designer),
      projectId: target.projectId,
      optionId: copied.options[0].id,
      snapshot: { productName: "Granite Slab", brandName: "Cotto", pattern: "Flaming", color: "Grey" },
    });
    const editedRow = (await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId })).find((r) => r.id === targetEntry.entryId)!;
    assert.equal(editedRow.options[0].pattern, "Flaming", "editing another option field preserves pattern");
    assert.equal(editedRow.options[0].color, "Grey");
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

  it("keeps labels unique, edits options and items partially, and moves rows between groups", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Wallpaper", prefix: "WP" });
    const a = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", qty: "2", unit: "pail", snapshot: { productName: "A paint" } });
    const b = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "B paint" } });
    const c = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });

    const optB = await sf.schedule.createOption({ ...as(designer), projectId, entryId: a.entryId, snapshot: { productName: "Alt B" } });
    await sf.schedule.createOption({ ...as(designer), projectId, entryId: a.entryId, snapshot: { productName: "Alt C" } });
    await sf.schedule.deleteOption({ ...as(designer), projectId, optionId: optB.optionId });
    await sf.schedule.createOption({ ...as(designer), projectId, entryId: a.entryId, snapshot: { productName: "Alt D" } });
    const list = async () => sf.schedule.listSchedule({ grants: ALL, projectId });
    let rowA = (await list()).find((row) => row.id === a.entryId)!;
    assert.deepEqual(rowA.options.map((o) => o.label), ["A", "C", "D"], "a deleted label is never reused");

    const optD = rowA.options.find((o) => o.label === "D")!;
    await sf.schedule.markFinal({ ...as(designer), projectId, optionId: optD.id });
    const entryRow = await testDb.prisma.sfScheduleEntry.findUniqueOrThrow({ where: { id: a.entryId } });
    assert.equal(entryRow.active_index, 2);
    assert.equal(entryRow.version_locked, false, "approval does not lock the row (legacy)");

    await sf.schedule.updateOption({ ...as(designer), projectId, optionId: optD.id, snapshot: { productName: "Alt D2", brandName: "Jotun", color: "Ivory" } });
    rowA = (await list()).find((row) => row.id === a.entryId)!;
    assert.deepEqual([rowA.options[2].productName, rowA.options[2].brandName, rowA.options[2].color], ["Alt D2", "Jotun", "Ivory"]);
    const hits = await sf.schedule.searchReusableOptions({ grants: ALL, projectId: (await newProject("Other")).projectId, query: "ivory" });
    assert.equal(hits[0]?.sourceProjectName, "2026-001 Heloskin Cimanggu", "edited snapshot is searchable");

    await sf.schedule.updateEntry({ ...as(designer), projectId, entryId: a.entryId, location: "Lobby" });
    rowA = (await list()).find((row) => row.id === a.entryId)!;
    assert.deepEqual([rowA.qty, rowA.unit, rowA.location], ["2", "pail", "Lobby"], "omitted fields keep their value");

    await sf.schedule.moveEntry({ ...as(designer), projectId, entryId: c.entryId, direction: "up" });
    assert.deepEqual((await list()).map((row) => [row.code, row.id]), [["PT-01", a.entryId], ["PT-02", c.entryId], ["PT-03", b.entryId]]);

    const moved = await sf.schedule.moveEntryToCategory({ ...as(designer), projectId, entryId: a.entryId, category: "wallpaper" });
    assert.equal(moved.code, "WP-01");
    assert.deepEqual((await list()).map((row) => [row.code, row.category]), [["PT-01", "Paint"], ["PT-02", "Paint"], ["WP-01", "Wallpaper"]]);
  });

  it("imports the legacy Google Sheets export and updates existing codes", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    const existing = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Old paint" } });
    const sheet = [
      "MATERIAL SCHEDULE,,,,,,,,,",
      "Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit",
      "PT-01,,Dulux,Easy Clean,EC,,Bedroom,Budi 0812,9,pail",
      "FL-01,Floor Tile,Roman,Granitio,,,Lobby,,,m2",
      "FL-02,Floor Tile,Roman,dBasic,,,Toilet,,,m2",
    ].join("\n");
    const result = await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: sheet });
    assert.deepEqual(result, { created: 2, updated: 1 });
    const rows = await sf.schedule.listSchedule({ grants: ALL, projectId, section: "MATERIAL" });
    const pt = rows.find((row) => row.id === existing.entryId)!;
    assert.deepEqual([pt.code, pt.options[0].productName, pt.options[0].brandName, pt.location, pt.qty], ["PT-01", "Easy Clean", "Dulux", "Bedroom", null]);
    assert.match(pt.options[0].notes ?? "", /Contact: Budi 0812/);
    assert.deepEqual(rows.filter((row) => row.category === "Floor Tile").map((row) => row.code), ["FL-01", "FL-02"], "a new category keeps the sheet prefix");

    await rejectsWith(sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: "Code,Product Category,Ex,Type\nZZ-01,,Brand,Thing" }), "SCHEDULE_CSV_CATEGORY");
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Tile Wall", prefix: "FL" });
    await rejectsWith(sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: "Code,Product Category,Ex,Type\nFL-09,,Brand,Thing" }), "SCHEDULE_CSV_CATEGORY");
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId })).length, 3, "a failed import writes nothing");
  });

  it("manages template items and skips inactive ones", async () => {
    const one = await sf.schedule.createTemplateItem({ ...as(designer), section: "FIXTURE", category: "Lighting", snapshot: { productName: "Downlight" } });
    const two = await sf.schedule.createTemplateItem({ ...as(designer), section: "FIXTURE", category: "Lighting", snapshot: { productName: "Track light" } });
    const templates = await sf.schedule.listTemplates({ grants: ALL });
    assert.deepEqual(templates.map((t) => [t.category, t.items.length, t.is_default_entry]), [["Lighting", 2, false]], "items get a category row");
    await sf.schedule.setTemplateItemActive({ ...as(designer), templateItemId: two.templateItemId, isActive: false });
    await sf.schedule.upsertTemplateCategory({ ...as(designer), section: "MATERIAL", category: "Paint", isDefaultEntry: true });
    const { projectId } = await newProject();
    const seeded = await sf.schedule.listSchedule({ grants: ALL, projectId });
    assert.deepEqual(seeded.map((row) => [row.category, row.options.length]).sort(), [["Lighting", 1], ["Paint", 0]], "new projects get template items and reserve rows");
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 0 });
    await sf.schedule.deleteTemplateItem({ ...as(designer), templateItemId: one.templateItemId });
    const row = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((r) => r.category === "Lighting")!;
    assert.equal(row.templateItemId, null, "project rows keep their snapshot after the template is deleted");
    assert.equal(row.options[0].productName, "Downlight");
    await rejectsWith(sf.schedule.deleteTemplateItem({ ...as(drafter, DRAFTER_GRANTS), templateItemId: two.templateItemId }).catch((e) => { throw e instanceof AppError && e.kind === "FORBIDDEN" ? new AppError("FORBIDDEN", "FORBIDDEN_OK", "x") : e; }), "FORBIDDEN_OK");
  });

  it("stores one photo per option, shares it on reuse and templates, and releases unreferenced objects", async () => {
    const { projectId } = await newProject();
    const other = await newProject("Other");
    const entry = await sf.schedule.createEntry({ ...as(designer), projectId, section: "FIXTURE", category: "Lamp", qty: "3", unit: "pcs", location: "Lobby", snapshot: { productName: "Pendant", brandName: "Louis" } });
    const [row] = await sf.schedule.listSchedule({ grants: ALL, projectId });
    const optionId = row.options[0].id;
    assert.equal(row.options[0].imageUrl, null);

    await rejectsWith(sf.schedule.setOptionImage({ ...as(designer), projectId, optionId, file: { body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), contentType: "image/png" } }), "SCHEDULE_IMAGE_TYPE");
    await rejectsWith(sf.schedule.setOptionImage({ ...as(designer), projectId: other.projectId, optionId, file: png() }), "SCHEDULE_ITEM_NOT_FOUND");
    await assert.rejects(sf.schedule.setOptionImage({ ...as(drafter, DRAFTER_GRANTS), projectId, optionId, file: png() }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");
    assert.equal(storage.objects.size, 0, "rejected uploads write nothing");

    await sf.schedule.setOptionImage({ ...as(designer), projectId, optionId, file: png() });
    await sf.schedule.setOptionImage({ ...as(designer), projectId, optionId, file: png() });
    assert.equal(storage.objects.size, 1, "replacing releases the previous object");
    const url = (await sf.schedule.listSchedule({ grants: ALL, projectId }))[0].options[0].imageUrl;
    assert.ok(url?.startsWith("https://storage.invalid/"));

    // A client-sent key is never trusted: editing keeps the stored photo.
    await sf.schedule.updateOption({ ...as(designer), projectId, optionId, snapshot: { productName: "Pendant L", imageKey: "studioflow/mom/other.png" } });
    const stored = await testDb.prisma.sfScheduleOption.findUniqueOrThrow({ where: { id: optionId } });
    assert.ok(stored.image_key?.startsWith(`studioflow/schedule/${projectId}`));

    // Reuse and save-as-template share the object.
    const target = await sf.schedule.createEntry({ ...as(designer), projectId: other.projectId, section: "FIXTURE", category: "Lamp" });
    await sf.schedule.copyReusableOption({ ...as(designer), projectId: other.projectId, entryId: target.entryId, sourceOptionId: optionId });
    const template = await sf.schedule.saveEntryAsTemplate({ ...as(designer), projectId, entryId: entry.entryId });
    const templateRow = await testDb.prisma.sfScheduleTemplateItem.findUniqueOrThrow({ where: { id: template.templateItemId } });
    assert.equal(templateRow.image_key, stored.image_key);
    assert.equal(templateRow.qty?.toString(), "3");
    assert.equal(templateRow.location, "Lobby");

    await sf.schedule.removeOptionImage({ ...as(designer), projectId, optionId });
    assert.equal(storage.objects.size, 1, "still referenced by the reused option and the template");
    await sf.schedule.deleteEntry({ ...as(designer), projectId: other.projectId, entryId: target.entryId });
    assert.equal(storage.objects.size, 1, "still referenced by the template");
    await sf.schedule.deleteTemplateItem({ ...as(designer), templateItemId: template.templateItemId });
    assert.equal(storage.objects.size, 0, "released once nothing points at it");
  });

  it("edits template items without touching their photo or seeded project rows", async () => {
    const created = await sf.schedule.createTemplateItem({ ...as(designer), section: "MATERIAL", category: `Veneer ${randomUUID().slice(0, 6)}`, snapshot: { productName: "Oak", imageKey: "forged/key.png" }, qty: "1", unit: "sheet" });
    let item = await testDb.prisma.sfScheduleTemplateItem.findUniqueOrThrow({ where: { id: created.templateItemId } });
    assert.equal(item.image_key, null, "client keys are ignored on create");
    const { projectId } = await newProject();
    await sf.schedule.updateTemplateItem({ ...as(designer), templateItemId: created.templateItemId, snapshot: { productName: "Walnut", finishing: "Matte" }, qty: "2", unit: "sheet", location: null });
    item = await testDb.prisma.sfScheduleTemplateItem.findUniqueOrThrow({ where: { id: created.templateItemId } });
    assert.deepEqual([item.product_name, item.finishing, item.qty?.toString()], ["Walnut", "Matte", "2"]);
    const seeded = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.options[0]?.productName === "Oak");
    assert.ok(seeded, "rows seeded before the edit keep their snapshot");
    await assert.rejects(sf.schedule.updateTemplateItem({ ...as(drafter, DRAFTER_GRANTS), templateItemId: created.templateItemId, snapshot: { productName: "x" } }), (e: unknown) => e instanceof AppError && e.kind === "FORBIDDEN");
    await rejectsWith(sf.schedule.saveEntryAsTemplate({ ...as(designer), projectId, entryId: (await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Empty" })).entryId }), "SCHEDULE_TEMPLATE_SOURCE_REQUIRED");
  });
});

describe("StudioFlow Library", () => {
  it("reads Master Data's Brand catalog read-only, filterable by name/category/hashtag", async () => {
    const tag = randomUUID().slice(0, 8);
    const category = await testDb.prisma.category.create({ data: { id: randomUUID(), name: `Sanitary ${tag}`, slug: `sanitary-${tag}`, kind: "PRODUCT", status: "ACTIVE" } });
    const brand = await testDb.prisma.brand.create({
      data: {
        id: randomUUID(),
        name: `TOTO ${tag}`,
        slug: `toto-${tag}`,
        notes: "Premium sanitaryware",
        categories: { create: [{ id: randomUUID(), category_id: category.id }] },
        hashtags: { create: [{ id: randomUUID(), label: "Bathroom", normalized: "bathroom" }] },
      },
    });

    const all = await sf.library.listBrands({ grants: ALL });
    const found = all.find((row) => row.id === brand.id)!;
    assert.ok(found, "the seeded brand is readable through the Library service");
    assert.equal(found.notes, "Premium sanitaryware");
    assert.deepEqual(found.categories.map((c) => c.name), [`Sanitary ${tag}`]);
    assert.deepEqual(found.hashtags.map((h) => h.label), ["Bathroom"]);

    const searched = await sf.library.listBrands({ grants: ALL, search: `TOTO ${tag}` });
    assert.deepEqual(searched.map((row) => row.id), [brand.id]);

    const noMatch = await sf.library.listBrands({ grants: ALL, search: `nonexistent-${tag}` });
    assert.deepEqual(noMatch, []);
  });
});

// ── R2.7: Phase Template V2 integration tests ──────────────────────────────

describe("Phase Template V2 invariants", () => {
  it("default template bootstrap works", async () => {
    const templates = await sf.phases.listPhaseTemplates({ grants: ALL });
    const defaults = templates.filter((t) => t.isDefault && t.isActive);
    assert.equal(defaults.length, 1, "exactly one active default template");
    assert.ok(defaults[0].definitions.length > 0, "default template has definitions");
  });

  it("template snapshot copied into project", async () => {
    const { projectId } = await newProject();
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    for (const phase of phases) {
      assert.ok(phase.label, "phase has snapshot label");
      assert.ok(phase.seat, "phase has snapshot seat");
    }
  });

  it("template edit does not mutate existing project", async () => {
    const { projectId } = await newProject();
    const before = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    const moodboardLabel = before.find((p) => p.definitionId === LEGACY.moodboard)?.label;
    const templates = await sf.phases.listPhaseTemplates({ grants: ALL });
    const defaultTemplate = templates.find((t) => t.isDefault);
    assert.ok(defaultTemplate);
    const moodboardDef = defaultTemplate.definitions.find((d) => d.name === "Moodboard");
    if (moodboardDef) {
      await sf.phases.updatePhaseDefinition({ ...as(designer), definitionId: moodboardDef.id, name: "Moodboard Renamed" });
    }
    const after = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(after.find((p) => p.definitionId === LEGACY.moodboard)?.label, moodboardLabel, "project phase label unchanged by template edit");
  });

  it("V2-E: a template with an arbitrary phase name is a valid default (no legacy-name mapping required)", async () => {
    const { templateId } = await sf.phases.createPhaseTemplate({ ...as(designer), name: `Custom ${randomUUID().slice(0, 4)}` });
    const { definitionId } = await sf.phases.createPhaseDefinition({ ...as(designer), templateId, name: "Custom Phase", prefix: "CP" });
    await sf.phases.updatePhaseTemplate({ ...as(designer), templateId, isDefault: true });
    const { projectId } = await newProject("Arbitrary name project");
    const phase = await testDb.prisma.sfPhase.findFirstOrThrow({ where: { project_id: projectId } });
    assert.equal(phase.definition_id, definitionId);
    assert.equal(phase.name_snapshot, "Custom Phase");
    const templates = await sf.phases.listPhaseTemplates({ grants: ALL });
    const original = templates.find((t) => t.name === "Standard");
    if (original) await sf.phases.updatePhaseTemplate({ ...as(designer), templateId: original.id, isDefault: true });
  });

  it("SF-02: deleting a phase definition with checklist templates is rejected instead of silently cascading", async () => {
    const { templateId } = await sf.phases.createPhaseTemplate({ ...as(designer), name: `WithChecklist ${randomUUID().slice(0, 4)}` });
    const { definitionId } = await sf.phases.createPhaseDefinition({ ...as(designer), templateId, name: "Checklist Phase", prefix: "CK" });
    const { templateId: checklistTemplateId } = await sf.tasks.createTemplate({ ...as(designer), definitionId, label: "Pre-flight check" });
    await rejectsWith(sf.phases.deletePhaseDefinition({ ...as(designer), definitionId }), "PHASE_DEFINITION_HAS_CHECKLIST_TEMPLATES");
    // Definition and its checklist template both survive the rejected delete.
    assert.ok(await testDb.prisma.sfPhaseDefinition.findUnique({ where: { id: definitionId } }));
    assert.ok(await testDb.prisma.sfChecklistTemplate.findUnique({ where: { id: checklistTemplateId } }));
    await sf.tasks.deleteTemplate({ ...as(designer), templateId: checklistTemplateId });
    await sf.phases.deletePhaseDefinition({ ...as(designer), definitionId });
  });

  it("default template cannot become empty — deleting the last definition is rejected", async () => {
    const { templateId } = await sf.phases.createPhaseTemplate({ ...as(designer), name: `Single ${randomUUID().slice(0, 4)}` });
    const { definitionId } = await sf.phases.createPhaseDefinition({ ...as(designer), templateId, name: "Solo Phase", prefix: "SP", seat: "designer" });
    await sf.phases.updatePhaseTemplate({ ...as(designer), templateId, isDefault: true });
    await rejectsWith(sf.phases.deletePhaseDefinition({ ...as(designer), definitionId }), "DEFAULT_TEMPLATE_REQUIRES_PHASE");
    // Cleanup: restore original default
    const templates = await sf.phases.listPhaseTemplates({ grants: ALL });
    const original = templates.find((t) => t.name === "Standard");
    if (original) await sf.phases.updatePhaseTemplate({ ...as(designer), templateId: original.id, isDefault: true });
  });

  it("deactivating the default template is rejected when no other template is default", async () => {
    const templates = await sf.phases.listPhaseTemplates({ grants: ALL });
    const defaultTemplate = templates.find((t) => t.isDefault && t.isActive);
    assert.ok(defaultTemplate);
    await rejectsWith(sf.phases.updatePhaseTemplate({ ...as(designer), templateId: defaultTemplate.id, isActive: false }), "CANNOT_DEACTIVATE_DEFAULT");
  });

  it("safe phase reorder persists without constraint violations", async () => {
    const templates = await sf.phases.listPhaseTemplates({ grants: ALL });
    const defaultTemplate = templates.find((t) => t.isDefault);
    assert.ok(defaultTemplate);
    const ids = defaultTemplate.definitions.map((d) => d.id);
    assert.ok(ids.length >= 2, "need at least 2 definitions to reorder");
    const reversed = [...ids].reverse();
    await sf.phases.reorderPhaseDefinitions({ ...as(designer), templateId: defaultTemplate.id, orderedIds: reversed });
    const after = await sf.phases.listPhaseTemplates({ grants: ALL });
    const updated = after.find((t) => t.id === defaultTemplate.id);
    assert.deepEqual(updated?.definitions.map((d) => d.id), reversed, "definitions reordered to reverse order");
  });
});

describe("Snapshot runtime truth", () => {
  it("custom phase name used in reads", async () => {
    const { projectId } = await newProject();
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: (await phaseOf(projectId, "moodboard")).id });
    assert.equal(detail.label, "Moodboard", "detail uses snapshot label");
  });

  it("custom prefix used in revision labels", async () => {
    const { projectId } = await newProject();
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: (await phaseOf(projectId, "moodboard")).id });
    assert.ok(detail.activeRevision?.label.startsWith("MB"), "revision uses snapshot prefix");
  });

  it("custom seat controls fallback assignee", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    await sf.phases.activatePhase({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    await sf.phases.submitForInternalReview({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    await sf.phases.addActivity({ ...as(designer), projectId, phaseId: cd.id, content: "Fix", mode: "FEEDBACK" });
    await sf.phases.rejectPhase({ ...as(designer), projectId, phaseId: cd.id, type: "INTERNAL" });
    const todo = await testDb.prisma.sfChecklistItem.findFirstOrThrow({ where: { phase_id: cd.id } });
    assert.equal(todo.assigned_to_id, drafter.id, "CD fallback assignee is drafter from snapshot");
  });

  it("getPhaseDetail returns warnings with deliverable status and open optional count", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: phase.id });
    assert.ok(detail.warnings, "warnings field present");
    assert.equal(typeof detail.warnings.optionalOpen, "number");
    assert.ok(["MISSING", "CURRENT", "OUTDATED"].includes(detail.warnings.deliverableStatus), "deliverableStatus is a valid enum value");
    assert.equal(detail.warnings.deliverableStatus, "MISSING", "no deliverables yet");
  });

  it("listProjectPhases returns snapshot labels from phase_snapshot", async () => {
    const { projectId } = await newProject();
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    const moodboard = phases.find((p) => p.definitionId === LEGACY.moodboard);
    assert.ok(moodboard);
    assert.equal(moodboard.label, "Moodboard", "label from snapshot, not legacy key");
  });

  it("today feed uses snapshot phase names", async () => {
    const { projectId } = await newProject();
    const result = await sf.today.getToday({ ...as(designer) });
    const project = result.addTargets.find((t) => t.projectId === projectId);
    assert.ok(project, "project in today targets");
    const moodboardTarget = project.targets.find((t) => t.label === "Moodboard");
    assert.ok(moodboardTarget, "Today addTargets uses snapshot label, not legacy key");
  });

  it("project directory uses snapshot phase labels", async () => {
    const { projectId } = await newProject();
    const projects = await sf.projects.listProjects({ ...as(designer) });
    const project = projects.find((p) => p.id === projectId);
    assert.ok(project);
    const moodboardPhase = project.phases.find((p) => p.definitionId === LEGACY.moodboard);
    assert.ok(moodboardPhase);
    assert.equal(moodboardPhase.label, "Moodboard", "listProjects uses snapshot label");
  });
});

/**
 * Requirements merged into the checklist (2026-09-22): a warning-only item is an
 * ordinary checklist item with `is_blocking = false`, so it inherits phase-lock
 * enforcement and must stay out of the approval gate.
 */
describe("Optional (warning-only) checklist items", () => {
  async function optionalItem(projectId: string, phaseId: string) {
    const { itemId } = await sf.tasks.createItem({ ...as(designer), projectId, phaseId, label: "Verify site access", isBlocking: false });
    return itemId;
  }

  it("does not block approval but is reported as a warning", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    await optionalItem(projectId, phase.id);
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(detail.blockers.total, 0, "an optional item never gates approval");
    assert.equal(detail.warnings.optionalOpen, 1, "it surfaces as a warning instead");
  });

  it("blocks approval once made blocking", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const itemId = await optionalItem(projectId, phase.id);
    await sf.tasks.updateItem({ ...as(designer), projectId, itemId, isBlocking: true });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(detail.blockers.total, 1, "flipping the flag moves it into the gate");
    assert.equal(detail.warnings.optionalOpen, 0);
  });

  it("locked phase blocks tick and delete", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const itemId = await optionalItem(projectId, phase.id);
    await testDb.prisma.sfPhase.update({ where: { id: phase.id }, data: { is_locked: true } });
    await rejectsWith(sf.tasks.setItemChecked({ ...as(designer), projectId, itemId, checked: true }), "PHASE_LOCKED");
    await rejectsWith(sf.tasks.deleteItem({ ...as(designer), projectId, itemId }), "PHASE_LOCKED");
  });

  it("refuses to make a subtask blocking", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const parentId = await optionalItem(projectId, phase.id);
    const { itemId: subtaskId } = await sf.tasks.createSubtask({ ...as(designer), projectId, parentId, label: "Call the building manager" });
    await rejectsWith(sf.tasks.updateItem({ ...as(designer), projectId, itemId: subtaskId, isBlocking: true }), "CHECKLIST_SUBTASK_NEVER_BLOCKS");
  });
});

describe("Deliverable reference revision", () => {
  it("upload requires active revision", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "supervision");
    await rejectsWith(sf.phases.uploadDeliverable({ ...as(designer), projectId, phaseId: phase.id, name: "test.pdf", file: { body: new Uint8Array(10), contentType: "application/pdf" } }), "ACTIVE_REVISION_REQUIRED");
  });

  it("deliverable status: no file → MISSING", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const result = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(result.status, "MISSING");
  });

  it("deliverable status: upload on active revision → CURRENT", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.uploadDeliverable({ ...base, name: "design.pdf", file: { body: new Uint8Array(100), contentType: "application/pdf" } });
    const result = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(result.status, "CURRENT");
    assert.equal(result.items.length, 1);
  });

  it("deliverable status: old files after reject → OUTDATED", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.uploadDeliverable({ ...base, name: "design.pdf", file: { body: new Uint8Array(100), contentType: "application/pdf" } });
    const before = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(before.status, "CURRENT");
    await sf.phases.submitForInternalReview(base);
    await sf.phases.addActivity({ ...base, content: "Needs revision", mode: "FEEDBACK" });
    await sf.phases.rejectPhase({ ...base, type: "INTERNAL" });
    const after = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(after.status, "OUTDATED", "files belong to old revision after reject");
  });
});

describe("Project code immutability", () => {
  it("normal edit preserves project_code", async () => {
    const { projectId } = await newProject("Test Project");
    const before = await sf.projects.getProject({ grants: ALL, projectId });
    const originalCode = before.code;
    await sf.projects.updateProject({ ...as(designer), projectId, name: "Renamed Project" });
    const after = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(after.code, originalCode, "project code preserved after rename");
  });
});

describe("Project timeline start (Gantt, owner 2026-09-23)", () => {
  it("defaults to createdAt's date, accepts an override, and resets on clear", async () => {
    const { projectId } = await newProject();
    const created = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(created.timelineStartDate, dateToDateOnly(created.createdAt), "defaults to the createdAt date when never overridden");

    await sf.projects.updateProject({ ...as(designer), projectId, timelineStartDate: "2026-01-15" });
    let updated = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(updated.timelineStartDate, "2026-01-15");
    assert.deepEqual((await sf.projects.listProjects({ grants: ALL, status: "ALL" })).find((p) => p.id === projectId)?.timelineStartDate, "2026-01-15", "listProjects reflects the override too");

    await sf.projects.updateProject({ ...as(designer), projectId, timelineStartDate: null });
    updated = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(updated.timelineStartDate, dateToDateOnly(created.createdAt), "clearing the override resets to the createdAt fallback");
  });
});

// ── SF-V2-E: phases come from definitions, never from a fixed enum ───────────

type CustomDef = { name: string; prefix: string; seat?: "designer" | "drafter"; parallel?: boolean };

const SIX_PHASES: CustomDef[] = [
  { name: "Concept", prefix: "CN" },
  { name: "Planning", prefix: "PL" },
  { name: "Visualization", prefix: "VZ" },
  { name: "Documentation", prefix: "DC", seat: "drafter" },
  { name: "Site Works", prefix: "SW" },
  { name: "Handover", prefix: "HO" },
];

async function seedTemplate(name: string, defs: readonly CustomDef[], isDefault = true) {
  const { templateId } = await sf.phases.createPhaseTemplate({ ...as(designer), name, isDefault });
  const ids: string[] = [];
  for (const d of defs) {
    ids.push((await sf.phases.createPhaseDefinition({ ...as(designer), templateId, name: d.name, prefix: d.prefix, seat: d.seat, allowParallel: d.parallel })).definitionId);
  }
  return { templateId, ids };
}

async function phasesOf(projectId: string) {
  return testDb.prisma.sfPhase.findMany({ where: { project_id: projectId }, orderBy: { order_index: "asc" } });
}

describe("SF-V2-E phase definitions", () => {
  it("bootstraps the standard five-phase template with legacy identities", async () => {
    const { projectId } = await newProject();
    const phases = await phasesOf(projectId);
    assert.deepEqual(phases.map((p) => [p.name_snapshot, p.prefix_snapshot, p.seat_snapshot, p.definition_id]), [
      ["Moodboard", "MB", "designer", LEGACY.moodboard],
      ["Layout Plan", "L", "designer", LEGACY.layout],
      ["Design 3D", "D", "designer", LEGACY.design3d],
      ["Construction Drawing", "CD", "drafter", LEGACY.cd],
      ["Supervision", "SV", "designer", LEGACY.supervision],
    ]);
    assert.deepEqual(await revisions(phases[0].id), ["v1.0:ACTIVE"]);
    const listed = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(listed[0].activeRevision, "MB1.0");
  });

  it("bootstraps a six-phase template with arbitrary names", async () => {
    const { ids } = await seedTemplate("Studio flow", SIX_PHASES);
    const { projectId } = await newProject();
    const phases = await phasesOf(projectId);
    assert.deepEqual(phases.map((p) => p.name_snapshot), SIX_PHASES.map((d) => d.name));
    assert.deepEqual(phases.map((p) => p.prefix_snapshot), SIX_PHASES.map((d) => d.prefix));
    assert.deepEqual(phases.map((p) => p.definition_id), ids);
    assert.deepEqual(phases.map((p) => p.status), ["IN_PROGRESS", "PENDING", "PENDING", "PENDING", "PENDING", "PENDING"]);
    assert.equal(phases[3].seat_snapshot, "drafter");
    const listed = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(listed[0].activeRevision, "CN1.0");
    assert.equal(listed.every((p) => !p.commands.includes("completeSupervision")), true);
  });

  it("runs a custom phase through the normal state machine with its own prefix", async () => {
    await seedTemplate("Studio flow", SIX_PHASES);
    const { projectId } = await newProject();
    const [concept, planning, visualization] = await phasesOf(projectId);
    const detail = (phaseId: string) => sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId });
    const run = { ...as(designer), projectId };

    assert.deepEqual((await detail(concept.id)).commands, ["submitInternal", "submitClient"]);
    await sf.phases.submitForInternalReview({ ...run, phaseId: concept.id });
    await sf.phases.approveInternal({ ...run, phaseId: concept.id });
    await sf.phases.submitForClientReview({ ...run, phaseId: concept.id });
    assert.deepEqual((await detail(concept.id)).commands, ["approveClient", "rejectClient"], "no rejectInternal from client review");

    const rejected = await sf.phases.rejectPhase({ ...run, phaseId: concept.id, type: "CLIENT" });
    assert.equal(rejected.revision, "CN2.0");
    await sf.phases.submitForClientReview({ ...run, phaseId: concept.id });
    await sf.phases.approveClient({ ...run, phaseId: concept.id });
    assert.equal((await detail(concept.id)).status, "READY_FOR_NEXT");

    await sf.phases.activatePhase({ ...run, phaseId: planning.id });
    assert.equal((await detail(planning.id)).activeRevision?.label, "PL1.0");
    await sf.phases.submitForClientReview({ ...run, phaseId: planning.id });
    assert.equal((await detail(planning.id)).status, "ON_REVIEW_CLIENT", "direct client submission from IN_PROGRESS");
    await sf.phases.approveClient({ ...run, phaseId: planning.id });

    await sf.phases.bypassPhase({ ...run, phaseId: visualization.id, reason: "Not needed" });
    assert.equal((await detail(visualization.id)).status, "READY_FOR_NEXT");

    const reopened = await sf.phases.reopenPhase({ ...run, phaseId: concept.id, intent: "CLIENT", reason: "New brief" });
    assert.equal(reopened.revision, "CN3.0");
  });

  it("gives the special completion only to the legacy Supervision definition", async () => {
    const custom = await seedTemplate("Custom", [{ name: "Concept", prefix: "CN" }, { name: "Supervision", prefix: "SV" }]);
    const customProject = await newProject("Custom named Supervision");
    const [conceptPhase, namedSupervision] = await phasesOf(customProject.projectId);
    const run = { ...as(designer), projectId: customProject.projectId };
    // Concept is the first phase and starts IN_PROGRESS, so it is finished via approval, not bypass.
    await sf.phases.submitForClientReview({ ...run, phaseId: conceptPhase.id });
    await sf.phases.approveClient({ ...run, phaseId: conceptPhase.id });
    await sf.phases.activatePhase({ ...run, phaseId: namedSupervision.id });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId: customProject.projectId, phaseId: namedSupervision.id });
    assert.deepEqual(detail.commands, ["submitInternal", "submitClient"], "a custom phase called Supervision is an ordinary phase");
    await rejectsWith(sf.phases.completeSupervision({ ...run, phaseId: namedSupervision.id }), "PHASE_INVALID_STATE");
    assert.equal(custom.ids.includes(namedSupervision.definition_id), true);

    // Back to the standard template: the migrated Supervision keeps its command.
    await sf.phases.updatePhaseTemplate({ ...as(designer), templateId: (await testDb.prisma.sfPhaseTemplate.findFirstOrThrow({ where: { name: "Standard" } })).id, isDefault: true });
    const standard = await newProject("Standard supervision");
    const supervision = await phaseOf(standard.projectId, "supervision");
    // Moodboard (order 1) starts IN_PROGRESS, so it cannot be bypassed; Supervision only
    // cares about its immediate predecessor CD, so Moodboard's state is irrelevant here.
    for (const key of ["layout", "design3d", "cd"] as const) {
      await sf.phases.bypassPhase({ ...as(designer), projectId: standard.projectId, phaseId: (await phaseOf(standard.projectId, key)).id, reason: "Skip" });
    }
    await sf.phases.activatePhase({ ...as(designer), projectId: standard.projectId, phaseId: supervision.id });
    assert.deepEqual((await sf.phases.getPhaseDetail({ grants: ALL, projectId: standard.projectId, phaseId: supervision.id })).commands, ["completeSupervision"]);
    await sf.phases.completeSupervision({ ...as(designer), projectId: standard.projectId, phaseId: supervision.id });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId: standard.projectId })).status, "COMPLETED");
  });

  it("completes the project when the last custom phase is approved", async () => {
    await seedTemplate("Two phases", [{ name: "Concept", prefix: "CN" }, { name: "Handover", prefix: "HO" }]);
    const { projectId } = await newProject();
    const [concept, handover] = await phasesOf(projectId);
    const run = { ...as(designer), projectId };
    await sf.phases.submitForClientReview({ ...run, phaseId: concept.id });
    await sf.phases.approveClient({ ...run, phaseId: concept.id });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE");
    await sf.phases.activatePhase({ ...run, phaseId: handover.id });
    await sf.phases.submitForClientReview({ ...run, phaseId: handover.id });
    await sf.phases.approveClient({ ...run, phaseId: handover.id });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "COMPLETED");

    // Reopening the phase that completed the project must not leave the
    // project stuck COMPLETED while the phase itself is IN_PROGRESS again —
    // it would silently vanish from Today (which excludes COMPLETED projects)
    // even though there is now active work on it.
    await sf.phases.reopenPhase({ ...run, phaseId: handover.id, intent: "CLIENT", reason: "One more revision" });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE");
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: handover.id })).status, "IN_PROGRESS");
  });

  it("converts open feedback instead of orphaning it when completeSupervision closes the revision (the one lock path with no blocker check)", async () => {
    // approveInternal/approveClient refuse to lock a phase with open feedback
    // (assertFullyUnblocked), and rejectPhase converts it explicitly — but
    // completeSupervision is legacy-parity lenient (no blocker gate) and used
    // to close the revision without doing either, permanently orphaning any
    // still-OPEN feedback (invisible to Today/blockers once the revision is
    // no longer ACTIVE, with nothing left to resurface it on).
    const { projectId } = await newProject();
    // Moodboard starts IN_PROGRESS (cannot be bypassed); finish it normally.
    const moodboard = await phaseOf(projectId, "moodboard");
    await sf.phases.submitForClientReview({ ...as(designer), projectId, phaseId: moodboard.id });
    await sf.phases.approveClient({ ...as(designer), projectId, phaseId: moodboard.id });
    for (const key of ["layout", "design3d", "cd"] as const) {
      await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: (await phaseOf(projectId, key)).id, reason: "Skip" });
    }
    const supervision = await phaseOf(projectId, "supervision");
    const base = { ...as(designer), projectId, phaseId: supervision.id };
    await sf.phases.activatePhase(base);
    await sf.phases.addActivity({ ...base, content: "Open note on the closed revision", mode: "FEEDBACK" });

    await sf.phases.completeSupervision(base);

    const todo = await testDb.prisma.sfChecklistItem.findFirst({ where: { phase_id: supervision.id, label: "Open note on the closed revision" } });
    assert.ok(todo, "the open feedback must convert to a checklist item, not vanish once its revision closes");
    const activity = await testDb.prisma.sfActivity.findFirstOrThrow({ where: { phase_id: supervision.id, content: "Open note on the closed revision" } });
    assert.equal(activity.status, "COMPLETED", "the original feedback activity must be marked done so it no longer double-counts as open work");
  });

  it("never rewrites project snapshots when the template is edited, and protects definitions in use", async () => {
    const { projectId } = await newProject();
    const before = await phasesOf(projectId);
    const template = await testDb.prisma.sfPhaseTemplate.findFirstOrThrow({ where: { name: "Standard" } });
    await sf.phases.updatePhaseDefinition({ ...as(designer), definitionId: LEGACY.moodboard, name: "Concept board", prefix: "CB", seat: "drafter", allowParallel: true });
    await sf.phases.reorderPhaseDefinitions({ ...as(designer), templateId: template.id, orderedIds: [LEGACY.supervision, LEGACY.cd, LEGACY.design3d, LEGACY.layout, LEGACY.moodboard] });
    const after = await phasesOf(projectId);
    const snapshot = (rows: typeof before) => rows.map((p) => [p.id, p.definition_id, p.order_index, p.allow_parallel, p.name_snapshot, p.prefix_snapshot, p.seat_snapshot]);
    assert.deepEqual(snapshot(after), snapshot(before));
    assert.equal((await sf.phases.listProjectPhases({ grants: ALL, projectId }))[0].activeRevision, "MB1.0");

    await rejectsWith(sf.phases.deletePhaseDefinition({ ...as(designer), definitionId: LEGACY.moodboard }), "PHASE_DEFINITION_IN_USE");
    const other = await seedTemplate("Other", [{ name: "Concept", prefix: "CN" }, { name: "Handover", prefix: "HO" }]);
    await newProject("Uses other");
    await sf.phases.updatePhaseTemplate({ ...as(designer), templateId: template.id, isDefault: true });
    await rejectsWith(sf.phases.deletePhaseTemplate({ ...as(designer), templateId: other.templateId }), "PHASE_TEMPLATE_IN_USE");
    const unused = await seedTemplate("Unused", [{ name: "Only", prefix: "ON" }], false);
    await sf.phases.deletePhaseTemplate({ ...as(designer), templateId: unused.templateId });
  });

  it("seeds checklist templates into the phases created from their definition", async () => {
    const { ids } = await seedTemplate("Studio flow", SIX_PHASES);
    await sf.tasks.createTemplate({ ...as(designer), definitionId: ids[1], label: "Collect measurements" });
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Standard-only item" });
    await rejectsWith(sf.tasks.createTemplate({ ...as(designer), definitionId: randomUUID(), label: "Nowhere" }), "PHASE_DEFINITION_INVALID");
    const { projectId } = await newProject();
    const planning = (await phasesOf(projectId))[1];
    const items = await testDb.prisma.sfChecklistItem.findMany({ where: { project_id: projectId } });
    assert.deepEqual(items.map((i) => [i.label, i.phase_id]), [["Collect measurements", planning.id]]);
  });
});
