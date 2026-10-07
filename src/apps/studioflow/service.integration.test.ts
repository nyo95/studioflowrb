import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { exportTable } from "@platform/utilities/tabular";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";
import { FakeObjectStorage, type ObjectStorage } from "@platform/core/storage";
import { createMasterDataPublicRead, MASTERDATA_PERMISSIONS } from "@/apps/masterdata/public";
import { createNotificationWriter } from "@platform/core/notifications/persistence";
import { createSampleRequestNotifier } from "./sample-request-notifier";
import { SfCdItemStatus, type PrismaClient } from "@/generated/prisma/client";

import { APP_REGISTRATIONS } from "../../app/app-registrations";
import { dateToDateOnly } from "./domain/dates";
import { LEGACY_PHASE_DEFINITION_IDS as LEGACY } from "./domain/phase";
import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { createStudioFlowService, type StudioFlowService } from "./service";
import { readBlockerCounts, readBlockerCountsBatch } from "./phases/blocker-query";
import { fullBlockers } from "./domain/blockers";
import { createAssetRetentionService } from "./projects/asset-retention";
import { createStudioFlowSampleRequestRead } from "./public/sample-request-read";
import { createStudioFlowSampleRequestCommand } from "./public/sample-request-command";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import type { StudioFlowPorts } from "./shared";

const ALL = [...Object.values(P)];
const DRAFTER_GRANTS = [P.access, P.projectRead, P.phaseWork, P.taskManage, P.projectPicDrafter];

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
    "sf_checklist_item", "sf_checklist_template",
    "sf_deliverable", "sf_asset_cleanup_failure",
    "sf_activity", "sf_revision", "sf_phase",
    "sf_phase_definition", "sf_phase_template",
    "sf_project", "sf_client", "sf_settings", "sf_holiday",
  ].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await truncatePlatformTables(testDb);
  await testDb.prisma.notification.deleteMany();
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
    notificationWriter: createNotificationWriter(),
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

/** The phase's open iteration (not sent, with the client, or answered). */
async function openIteration(phaseId: string) {
  return testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: phaseId, status: { in: ["NOT_SENT", "SENT", "ANSWERED"] } }, orderBy: { major: "desc" } });
}

/** One full client round on the open iteration: send it, record the answer, choose the outcome. */
async function clientRound(base: ReturnType<typeof as> & { projectId: string; phaseId: string }, outcome: "REVISION" | "DONE") {
  const iteration = await openIteration(base.phaseId);
  await sf.phases.sendIteration({ ...base, iterationId: iteration.id });
  await sf.phases.recordClientAnswer({ ...base, iterationId: iteration.id });
  return sf.phases.chooseIterationOutcome({ ...base, iterationId: iteration.id, outcome });
}

async function revisions(phaseId: string) {
  return (await testDb.prisma.sfRevision.findMany({ where: { phase_id: phaseId }, orderBy: { major: "asc" } })).map((r) => `${r.name}:${r.status}`);
}

describe("WO-SF-ITER-01 phase 2 iteration commands", () => {
  it("chains CD Mall to CD Final, auto-advances, and undoes only the latest event", async () => {
    const { projectId } = await newProject("Iteration chain");
    const moodboard = await phaseOf(projectId, "moodboard");
    const first = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id, status: "NOT_SENT" } });
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: first.id });
    await sf.phases.recordClientAnswer({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: first.id });
    await sf.phases.chooseIterationOutcome({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: first.id, outcome: "DONE" });
    const advanced = await testDb.prisma.sfPhase.findFirstOrThrow({ where: { project_id: projectId, definition_id: LEGACY.layout } });
    assert.equal(advanced.status, "ACTIVE");
    const event = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId, eventId: event.id });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: moodboard.id } })).status, "ACTIVE");
    await rejectsWith(sf.phases.undoPhaseEvent({ ...as(drafter, DRAFTER_GRANTS), projectId, eventId: event.id }), "UNDO_ACTOR_MISMATCH");
    const cd = await phaseOf(projectId, "cd");
    await testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.cd }, data: { default_iteration_kinds: [{ name: "CD Mall" }, { name: "CD Final" }] } });
    const mall = await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: mall.iterationId } })).name, "CD Mall");
  });

  it("completes explicitly and rejects phase writes until reopened", async () => {
    const { projectId } = await newProject("Explicit completion");
    await sf.phases.markProjectCompleted({ ...as(designer), projectId, overrideReason: "The project owner accepted the remaining work." });
    const moodboard = await phaseOf(projectId, "moodboard");
    const iteration = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id } });
    await rejectsWith(sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: iteration.id }), "PROJECT_COMPLETED");
    await sf.phases.reopenProject({ ...as(designer), projectId });
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: iteration.id });
  });

  it("keeps closed-phase requirements while applying the same project completion gate everywhere", async () => {
    const { projectId } = await newProject("Completion readiness");
    const supervision = await phaseOf(projectId, "supervision");
    const layout = await phaseOf(projectId, "layout");
    await testDb.prisma.sfPhase.updateMany({ where: { project_id: projectId, id: { not: layout.id } }, data: { status: "DONE", is_locked: true } });
    await testDb.prisma.sfChecklistItem.create({ data: { id: randomUUID(), project_id: projectId, phase_id: supervision.id, label: "Close-out detail" } });
    const notReady = await sf.phases.getProjectCompletionReadiness({ ...as(designer), projectId });
    assert.deepEqual(notReady.unfinishedPhases.map((phase) => phase.id), [layout.id]);
    assert.equal(notReady.openReminders, 1);
    assert.equal(notReady.ready, false);
    await rejectsWith(sf.phases.markProjectCompleted({ ...as(designer, ALL.filter((grant) => grant !== P.projectManage)), projectId }), "PROJECT_COMPLETION_NOT_READY");
    await rejectsWith(sf.phases.markProjectCompleted({ ...as(designer), projectId }), "PROJECT_COMPLETION_OVERRIDE_REASON_REQUIRED");
    await sf.phases.markProjectCompleted({ ...as(designer), projectId, overrideReason: "Client accepted the remaining close-out item." });
    const audit = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { action: "studioflow.project.completed", entity_id: projectId } });
    assert.equal((audit.metadata as { completionOverrideReason?: string }).completionOverrideReason, "Client accepted the remaining close-out item.");
  });

  it("keeps completion and reopening out of the generic status command", async () => {
    const { projectId } = await newProject("Generic status boundary");
    const status = async () => (await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: projectId } })).status;
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" });
    assert.equal(await status(), "ON_HOLD");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ACTIVE" });
    assert.equal(await status(), "ACTIVE");
    // A caller outside the typed surface (API, AI, another UI) still cannot complete through it.
    await rejectsWith(sf.projects.setProjectStatus({ ...as(designer), projectId, status: "COMPLETED" as "ACTIVE" }), "PROJECT_STATUS_USE_COMPLETION_FLOW");
    assert.equal(await status(), "ACTIVE");

    await testDb.prisma.sfPhase.updateMany({ where: { project_id: projectId }, data: { status: "DONE", is_locked: true } });
    await sf.phases.markProjectCompleted({ ...as(designer), projectId });
    assert.equal(await status(), "COMPLETED");
    await rejectsWith(sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ACTIVE" }), "PROJECT_COMPLETED");
    await rejectsWith(sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" }), "PROJECT_COMPLETED");
    assert.equal(await status(), "COMPLETED");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.project.status-changed", entity_id: projectId, changes: { path: ["status", "to"], equals: "COMPLETED" } } }), 0);

    await sf.phases.reopenProject({ ...as(designer), projectId });
    assert.equal(await status(), "ACTIVE");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.project.reopened", entity_id: projectId } }), 1);
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" });
    assert.equal(await status(), "ON_HOLD");
  });

  it("lets open requirements stay as reminders: only unfinished phases block completion", async () => {
    const { projectId } = await newProject("Reminders never block");
    const moodboard = await phaseOf(projectId, "moodboard");
    const layout = await phaseOf(projectId, "layout");
    await testDb.prisma.sfPhase.updateMany({ where: { project_id: projectId, id: { not: layout.id } }, data: { status: "DONE", is_locked: true } });
    await testDb.prisma.sfChecklistItem.create({ data: { id: randomUUID(), project_id: projectId, phase_id: moodboard.id, label: "Unticked reminder" } });
    await testDb.prisma.sfChecklistItem.create({ data: { id: randomUUID(), project_id: projectId, phase_id: null, label: "Unticked general to-do" } });
    const notReady = await sf.phases.getProjectCompletionReadiness({ ...as(designer), projectId });
    assert.deepEqual({ ready: notReady.ready, openReminders: notReady.openReminders, canChange: notReady.canChange }, { ready: false, openReminders: 2, canChange: true });
    const picOnly = ALL.filter((grant) => grant !== P.projectManage);
    await rejectsWith(sf.phases.markProjectCompleted({ ...as(designer, picOnly), projectId }), "PROJECT_COMPLETION_NOT_READY");
    await testDb.prisma.sfPhase.update({ where: { id: layout.id }, data: { status: "DONE", is_locked: true } });
    assert.equal((await sf.phases.getProjectCompletionReadiness({ ...as(designer), projectId })).ready, true);
    await sf.phases.markProjectCompleted({ ...as(designer, picOnly), projectId });
    const project = await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: projectId } });
    assert.equal(project.status, "COMPLETED");
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { project_id: projectId, is_checked: false } }), 2, "reminders stay on the project as they are");
  });

});

describe("WO-SF-ITER-01 phase 3 card reads", () => {
  it("returns one bounded project-card projection", async () => {
    const { projectId } = await newProject("Card projection");
    const moodboard = await phaseOf(projectId, "moodboard");
    await sf.phases.setPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, note: "Confirm palette" });
    const cards = await sf.projects.listProjectCards({ grants: ALL, filter: "mine", actorId: designer.id });
    const card = cards.find((item) => item.id === projectId)!;
    assert.ok(card);
    assert.equal(card.note_phases.includes(moodboard.id), true);
    assert.equal(card.phases[0]?.current_iteration?.state, "NOT_SENT");
  });
});

describe("WO-UI-V2-02 Home stats and rail counts", () => {
  it("counts a client answer as waiting only for someone who may act on that phase", async () => {
    const { projectId } = await newProject("Waiting on you");
    const moodboard = await phaseOf(projectId, "moodboard");
    const round = await openIteration(moodboard.id);
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: round.id });
    await sf.phases.recordClientAnswer({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: round.id, note: "Warmer" });
    const forDesigner = await sf.projects.getHomeStats({ grants: ALL, filter: "mine", actorId: designer.id });
    const forDrafter = await sf.projects.getHomeStats({ grants: DRAFTER_GRANTS, filter: "mine", actorId: drafter.id });
    assert.equal(forDesigner.waitingOnYou, 1);
    assert.equal(forDrafter.waitingOnYou, 0); // Moodboard is the designer's seat
    assert.equal(forDrafter.runningProjects, 1);
  });

  it("counts samples still waiting in running, unarchived projects", async () => {
    const { projectId } = await newProject("Samples waiting");
    const { entryId } = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Sample paint" } });
    const entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!;
    await sf.schedule.requestSample({ ...as(designer), projectId, optionId: entry.options[0].id });
    const read = createStudioFlowSampleRequestRead(testDb.prisma as unknown as PrismaClient);
    assert.equal((await sf.projects.getHomeStats({ grants: ALL, filter: "mine", actorId: designer.id })).samplesWaiting, 1);
    assert.equal(await read.countPendingSampleRequests(), 1);
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date(), archive_reason: "test" } });
    assert.equal(await read.countPendingSampleRequests(), 0);
  });
});

describe("WO-SF-PHASE-MENU-01 skip lifecycle", () => {
  const latestPhaseEvent = (projectId: string) => testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });

  it("skips an active phase and removes its empty never-sent round", async () => {
    const { projectId } = await newProject("Skip empty active round");
    const phase = await phaseOf(projectId, "moodboard");
    const open = await openIteration(phase.id);
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: phase.id, reason: "Client supplied the concept" });
    assert.equal(await testDb.prisma.sfRevision.count({ where: { id: open.id } }), 0);
    assert.deepEqual(await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id }, select: { status: true, is_locked: true } }), { status: "DONE", is_locked: true });
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: phase.id })).skippedReason, "Client supplied the concept");
    assert.equal((await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((card) => card.id === projectId)!.phases[0]!.skipped_reason, "Client supplied the concept");
  });

  it("keeps a sent round as closed history when its active phase is skipped", async () => {
    const { projectId } = await newProject("Skip sent round");
    const phase = await phaseOf(projectId, "moodboard");
    const open = await openIteration(phase.id);
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: phase.id, iterationId: open.id });
    const sentAt = (await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: open.id } })).sent_at;
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: phase.id, reason: "Client stopped review" });
    const kept = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: open.id } });
    assert.equal(kept.status, "DONE");
    assert.deepEqual(kept.sent_at, sentAt);
  });

  it("lets an active phase whose only unsent round was deleted take a new round", async () => {
    const { projectId } = await newProject("Active phase without a round");
    const phase = await phaseOf(projectId, "moodboard");
    const open = await openIteration(phase.id);
    await sf.phases.deleteNeverSentIteration({ ...as(designer), projectId, phaseId: phase.id, iterationId: open.id });
    assert.equal((await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((card) => card.id === projectId)!.phases[0]!.can_add_round, true);
    await sf.phases.addIteration({ ...as(designer), projectId, phaseId: phase.id });
    assert.equal((await openIteration(phase.id)).status, "NOT_SENT");
    await rejectsWith(sf.phases.addIteration({ ...as(designer), projectId, phaseId: phase.id }), "PHASE_INVALID_STATE");
  });

  it("refuses to delete a never-sent round that holds files or activities, and leaves them intact", async () => {
    const { projectId } = await newProject("Round with attached work");
    const phase = await phaseOf(projectId, "moodboard");
    const open = await openIteration(phase.id);
    const file = await testDb.prisma.sfDeliverable.create({ data: { project_id: projectId, phase_id: phase.id, revision_id: open.id, name: "Moodboard v1", storage_key: "studioflow/deliverables/attached.pdf" } });
    await rejectsWith(sf.phases.deleteNeverSentIteration({ ...as(designer), projectId, phaseId: phase.id, iterationId: open.id }), "ITERATION_HAS_ATTACHED_WORK");
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: open.id } })).status, "NOT_SENT");
    const kept = await testDb.prisma.sfDeliverable.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(kept.revision_id, open.id);
    assert.equal(kept.storage_key, "studioflow/deliverables/attached.pdf");

    await testDb.prisma.sfDeliverable.delete({ where: { id: file.id } });
    const activity = await testDb.prisma.sfActivity.create({ data: { project_id: projectId, phase_id: phase.id, revision_id: open.id, content: "Client asked for warmer tones" } });
    await rejectsWith(sf.phases.deleteNeverSentIteration({ ...as(designer), projectId, phaseId: phase.id, iterationId: open.id }), "ITERATION_HAS_ATTACHED_WORK");
    assert.equal((await testDb.prisma.sfActivity.findUniqueOrThrow({ where: { id: activity.id } })).revision_id, open.id);

    await testDb.prisma.sfActivity.delete({ where: { id: activity.id } });
    await sf.phases.deleteNeverSentIteration({ ...as(designer), projectId, phaseId: phase.id, iterationId: open.id });
    assert.equal(await testDb.prisma.sfRevision.count({ where: { id: open.id } }), 0);
  });

  it("undoes the deletion of an empty never-sent round back to the identical round", async () => {
    const { projectId } = await newProject("Undo empty round delete");
    const phase = await phaseOf(projectId, "moodboard");
    const open = await openIteration(phase.id);
    await sf.phases.deleteNeverSentIteration({ ...as(designer), projectId, phaseId: phase.id, iterationId: open.id });
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId, eventId: (await latestPhaseEvent(projectId)).id });
    const restored = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: open.id } });
    assert.deepEqual(
      { phase: restored.phase_id, major: restored.major, name: restored.name, status: restored.status, note: restored.note },
      { phase: open.phase_id, major: open.major, name: open.name, status: "NOT_SENT", note: open.note },
    );
    await rejectsWith(sf.phases.addIteration({ ...as(designer), projectId, phaseId: phase.id }), "PHASE_INVALID_STATE");
  });

  it("keeps a never-sent round with an activity as closed history when its phase is skipped", async () => {
    const { projectId } = await newProject("Skip round with activity");
    const phase = await phaseOf(projectId, "moodboard");
    const open = await openIteration(phase.id);
    const activity = await testDb.prisma.sfActivity.create({ data: { project_id: projectId, phase_id: phase.id, revision_id: open.id, content: "Keep me" } });
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: phase.id, reason: "Client supplied the concept" });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: open.id } })).status, "DONE");
    assert.equal((await testDb.prisma.sfActivity.findUniqueOrThrow({ where: { id: activity.id } })).revision_id, open.id);

    const filed = await newProject("Skip round with file");
    const filedPhase = await phaseOf(filed.projectId, "moodboard");
    const filedRound = await openIteration(filedPhase.id);
    const file = await testDb.prisma.sfDeliverable.create({ data: { project_id: filed.projectId, phase_id: filedPhase.id, revision_id: filedRound.id, name: "Concept", storage_key: "studioflow/deliverables/concept.pdf" } });
    await sf.phases.bypassPhase({ ...as(designer), projectId: filed.projectId, phaseId: filedPhase.id, reason: "Client supplied the concept" });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: filedRound.id } })).status, "DONE");
    assert.equal((await testDb.prisma.sfDeliverable.findUniqueOrThrow({ where: { id: file.id } })).revision_id, filedRound.id);
  });

  it("refuses to skip a phase that is already done", async () => {
    const { projectId } = await newProject("Skip done refusal");
    const phase = await phaseOf(projectId, "moodboard");
    await clientRound({ ...as(designer), projectId, phaseId: phase.id }, "DONE");
    await rejectsWith(sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: phase.id, reason: "Too late" }), "PHASE_INVALID_STATE");
  });

  it("auto-advances after a skip by the same rule as a normal finish", async () => {
    const { projectId } = await newProject("Skip auto advance");
    const phase = await phaseOf(projectId, "moodboard");
    const result = await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: phase.id, reason: "No concept phase needed" });
    const next = await phaseOf(projectId, "layout");
    assert.deepEqual(result.autoAdvance, { phaseId: next.id, iterationId: (await openIteration(next.id)).id });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: next.id } })).status, "ACTIVE");
  });

  it("undoes pending, empty-active, and sent-active skips with their exact round state", async () => {
    const emptyProject = await newProject("Undo empty skip");
    const emptyPhase = await phaseOf(emptyProject.projectId, "moodboard");
    const emptyRound = await openIteration(emptyPhase.id);
    await sf.phases.bypassPhase({ ...as(designer), projectId: emptyProject.projectId, phaseId: emptyPhase.id, reason: "Temporary" });
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId: emptyProject.projectId, eventId: (await latestPhaseEvent(emptyProject.projectId)).id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: emptyRound.id } })).status, "NOT_SENT");
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: emptyPhase.id } })).status, "ACTIVE");

    const sentProject = await newProject("Undo sent skip");
    const sentPhase = await phaseOf(sentProject.projectId, "moodboard");
    const sentRound = await openIteration(sentPhase.id);
    await sf.phases.sendIteration({ ...as(designer), projectId: sentProject.projectId, phaseId: sentPhase.id, iterationId: sentRound.id });
    await sf.phases.bypassPhase({ ...as(designer), projectId: sentProject.projectId, phaseId: sentPhase.id, reason: "Temporary" });
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId: sentProject.projectId, eventId: (await latestPhaseEvent(sentProject.projectId)).id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: sentRound.id } })).status, "SENT");

    const pendingProject = await newProject("Undo pending skip");
    const pendingPhase = await phaseOf(pendingProject.projectId, "supervision");
    await sf.phases.bypassPhase({ ...as(designer), projectId: pendingProject.projectId, phaseId: pendingPhase.id, reason: "Temporary" });
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId: pendingProject.projectId, eventId: (await latestPhaseEvent(pendingProject.projectId)).id });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: pendingPhase.id } })).status, "PENDING");
    assert.equal(await testDb.prisma.sfRevision.count({ where: { phase_id: pendingPhase.id } }), 0);
  });

  it("requires phase-review permission for skip and its undo", async () => {
    const { projectId } = await newProject("Skip permission");
    const phase = await phaseOf(projectId, "moodboard");
    const withoutReview = ALL.filter((grant) => grant !== P.phaseReview);
    await rejectsWith(sf.phases.bypassPhase({ ...as(designer, withoutReview), projectId, phaseId: phase.id, reason: "No permission" }), "PERMISSION_DENIED");
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: phase.id, reason: "Allowed" });
    await rejectsWith(sf.phases.undoPhaseEvent({ ...as(designer, withoutReview), projectId, eventId: (await latestPhaseEvent(projectId)).id }), "PERMISSION_DENIED");
  });
});

describe("WO-SF-CDLIST-01 Construction Drawing list", () => {
  it("lets both PICs manage sorted drawing items, records one audit event per change, and keeps the list informational", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    const first = await sf.cdList.create({ ...as(designer), projectId, phaseId: cd.id, drawingCode: "ARS_301", drawingName: "Ceiling plan", assignedToId: drafter.id });
    const second = await sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, drawingCode: "12", drawingName: "Key plan" });
    const third = await sf.cdList.create({ ...as(designer), projectId, phaseId: cd.id, drawingCode: "plan-a", drawingName: "Legend" });
    const listed = await sf.cdList.list({ grants: [P.access, P.projectRead], projectId, phaseId: cd.id });
    assert.deepEqual(listed.map((item) => [item.drawingCode, item.group]), [["ID_12", "0"], ["ID_301", "300"], ["ID_PLAN-A", "-"]]);

    const updated = await sf.cdList.update({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, itemId: first.id, drawingCode: "id-12.5", drawingName: "Ceiling reflected plan", assignedToId: null });
    await sf.cdList.setStatus({ ...as(designer), projectId, phaseId: cd.id, itemId: updated.id, status: SfCdItemStatus.COMPLETED });
    await sf.cdList.delete({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, itemId: third.id });

    const events = await testDb.prisma.auditEvent.findMany({ where: { entity_id: updated.id }, orderBy: { occurred_at: "asc" } });
    assert.deepEqual(events.map((event) => event.action), ["studioflow.cd-item.created", "studioflow.cd-item.updated", "studioflow.cd-item.status-changed"]);
    assert.deepEqual(events[1].changes, { drawingCode: { from: "ID_301", to: "ID_12.5" }, drawingName: { from: "Ceiling plan", to: "Ceiling reflected plan" }, assignedToId: { from: drafter.id, to: null } });
    assert.deepEqual(events[2].metadata, { projectId, phaseId: cd.id, drawingCode: "ID_12.5", drawingName: "Ceiling reflected plan" });
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: third.id, action: "studioflow.cd-item.deleted" } }), 1);
    assert.equal(await testDb.prisma.sfCdItem.count({ where: { phase_id: cd.id } }), 2);
    assert.equal(second.status, SfCdItemStatus.PENDING);
  });

  it("enforces phase, PIC, assignee, archive, lock, and cascade rules", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    const moodboard = await phaseOf(projectId, "moodboard");
    const unassignedGrants = ALL.filter((grant) => grant !== P.projectOverride);
    const outsider = await seedUser("CD outsider", unassignedGrants);
    const viewer = await seedUser("CD viewer", [P.access, P.projectRead]);
    const ineligible = await seedUser("CD ineligible", [P.access, P.projectRead]);

    await rejectsWith(sf.cdList.create({ ...as(outsider, unassignedGrants), projectId, phaseId: cd.id, drawingCode: "1", drawingName: "Denied" }), "PERMISSION_DENIED");
    assert.deepEqual(await sf.cdList.list({ grants: [P.access, P.projectRead], projectId, phaseId: cd.id }), []);
    await rejectsWith(sf.cdList.list({ grants: [P.access, P.projectRead], projectId, phaseId: moodboard.id }), "CD_LIST_WRONG_PHASE");
    await rejectsWith(sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, drawingCode: "1", drawingName: "Wrong phase" }), "CD_LIST_WRONG_PHASE");
    await rejectsWith(sf.cdList.create({ ...as(designer), projectId, phaseId: cd.id, drawingCode: "1", drawingName: "Invalid assignee", assignedToId: ineligible.id }), "CD_ASSIGNEE_NOT_ELIGIBLE");

    const item = await sf.cdList.create({ ...as(designer), projectId, phaseId: cd.id, drawingCode: "1", drawingName: "Section" });
    await testDb.prisma.sfPhase.update({ where: { id: cd.id }, data: { is_locked: true } });
    await rejectsWith(sf.cdList.update({ ...as(designer), projectId, phaseId: cd.id, itemId: item.id, drawingName: "Locked" }), "PHASE_LOCKED");
    await testDb.prisma.sfPhase.update({ where: { id: cd.id }, data: { is_locked: false } });
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date() } });
    await rejectsWith(sf.cdList.delete({ ...as(designer), projectId, phaseId: cd.id, itemId: item.id }), "PROJECT_ARCHIVED");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: null } });
    await testDb.prisma.sfProject.delete({ where: { id: projectId } });
    assert.equal(await testDb.prisma.sfCdItem.count({ where: { id: item.id } }), 0);
    assert.ok(viewer.id);
  });
});

describe("WO-BE-02 archived asset retention", () => {
  afterEach(() => storage.objects.clear());
  function retention(overrides: Partial<StudioFlowPorts> = {}) {
    const db = testDb.prisma;
    return createAssetRetentionService(db, {
      runTransaction: (work) => runSerializableTransaction(db, work),
      auditWriter: createAuditEventWriter(), people: createPeopleDirectory(db), storage,
      masterData: createMasterDataPublicRead(db), now: () => clock, ...overrides,
    });
  }

  async function fixture(name: string, age?: number) {
    const db = testDb.prisma;
    const { projectId } = await newProject(name);
    const phase = await phaseOf(projectId, "moodboard");
    const keys = { deliverable: `${projectId}/deliverable`, mom: `${projectId}/mom`, oldMom: `${projectId}/old-mom`, option: `${projectId}/option` };
    for (const key of Object.values(keys)) await storage.put({ key, body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    await db.sfDeliverable.create({ data: { project_id: projectId, phase_id: phase.id, name: "Private file", storage_key: keys.deliverable } });
    const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Retain this text" });
    const item = await db.sfMomItem.findFirstOrThrow({ where: { document_id: documentId } });
    await db.sfMomImage.create({ data: { item_id: item.id, slot: 0, storage_key: keys.mom, content_type: "image/png", bytes: 1 } });
    const snapshot = { topic: "Original topic", meetingDate: "2026-09-01", venue: "Site", attendees: "Team", preparedByName: "Designer", items: [{ isTextOnly: false, content: "Original revision text", images: [
      { slot: 0, storageKey: keys.mom, contentType: "image/png", bytes: 1 },
      { slot: 1, storageKey: keys.oldMom, contentType: "image/png", bytes: 1 },
    ] }] };
    const revision = await db.sfMomRevision.create({ data: { document_id: documentId, number: 1, note: "Keep this note", snapshot, created_by_id: designer.id, created_by_name: "Designer" } });
    const entry = await db.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Floor", category_key: "floor", prefix: "FL", increment: 1, sort_order: 0 } });
    await db.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", product_name: "Floor", search_key: "floor", image_key: keys.option } });
    if (age !== undefined) await db.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date(clock.getTime() - age * 86_400_000) } });
    return { projectId, keys, documentId, revision, entryId: entry.id };
  }

  it("purges only expired project assets, preserves text/history and exact audit fields, then restores text-only", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Expired", 91);
    const inside = await fixture("Inside", 89);
    const boundary = await fixture("Boundary", 90);
    const live = await fixture("Live");
    const client = await db.sfClient.findFirstOrThrow();
    await storage.put({ key: "client-logo", body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    await storage.put({ key: "template-photo", body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    await db.sfClient.update({ where: { id: client.id }, data: { logo_storage_key: "client-logo" } });
    await db.sfScheduleTemplateItem.create({ data: { section: "MATERIAL", category: "Floor", category_key: "floor", product_name: "Template", image_key: "template-photo" } });
    const result = await retention().purgeExpiredArchivedAssets();
    assert.deepEqual(result, { projectsPurged: 1, deliverables: 1, momImages: 1, momSnapshotImages: 2, optionPhotos: 1, presentationSlides: 0, blobsRemoved: 4, blobsKeptShared: 0, blobFailures: 0, unparseableRevisions: 0, previousFailuresResolved: 0, previousFailuresStillFailing: 0 });
    for (const key of Object.values(expired.keys)) assert.equal(storage.objects.has(key), false);
    for (const kept of [inside, boundary, live]) {
      for (const key of Object.values(kept.keys)) assert.ok(storage.objects.has(key));
      assert.equal((await db.sfProject.findUniqueOrThrow({ where: { id: kept.projectId } })).assets_purged_at, null);
    }
    assert.ok(storage.objects.has("client-logo")); assert.ok(storage.objects.has("template-photo"));
    assert.equal(await db.sfDeliverable.count({ where: { project_id: expired.projectId } }), 0);
    assert.equal(await db.sfMomImage.count({ where: { item: { document_id: expired.documentId } } }), 0);
    assert.equal((await db.sfScheduleOption.findFirstOrThrow({ where: { entry_id: expired.entryId } })).image_key, null);
    const revision = await db.sfMomRevision.findUniqueOrThrow({ where: { id: expired.revision.id } });
    const original = expired.revision.snapshot as { items: Array<Record<string, unknown>> };
    assert.deepEqual(revision, { ...expired.revision, snapshot: { ...original, items: original.items.map((item) => ({ ...item, images: [] })) } });
    const events = await db.auditEvent.findMany({ where: { entity_id: expired.projectId, action: { startsWith: "studioflow.project.assets_" } }, orderBy: { occurred_at: "asc" } });
    assert.deepEqual(events.map((event) => event.action), ["studioflow.project.assets_purged", "studioflow.project.assets_purge_completed"]);
    assert.ok(events.every((event) => event.actor_kind === "SYSTEM"));
    assert.deepEqual(events[0].metadata, { projectId: expired.projectId, deliverables: 1, momImages: 1, momSnapshotImages: 2, optionPhotos: 1, presentationSlides: 0, unparseableRevisions: 0, keysCollected: 4 });
    assert.deepEqual(events[1].metadata, { projectId: expired.projectId, blobsRemoved: 4, blobsKeptShared: 0, blobFailures: 0 });
    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 0);
    await sf.projects.restoreProject({ ...as(designer), projectId: inside.projectId });
    for (const key of Object.values(inside.keys)) assert.ok(storage.objects.has(key));
    await sf.projects.restoreProject({ ...as(designer), projectId: expired.projectId });
    await sf.mom.restoreRevision({ ...as(designer), projectId: expired.projectId, documentId: expired.documentId, revisionId: revision.id });
    const doc = await sf.mom.getDocument({ grants: ALL, projectId: expired.projectId, documentId: expired.documentId });
    assert.equal(doc.items[0].content, "Original revision text"); assert.deepEqual(doc.items[0].images, []);
    for (const [projectId, assetsPurged] of [[inside.projectId, false], [expired.projectId, true]] as const) {
      const event = await db.auditEvent.findFirstOrThrow({ where: { entity_id: projectId, action: "studioflow.project.restored" } });
      assert.equal((event.metadata as { assetsPurged: boolean }).assetsPurged, assetsPurged);
    }
  });

  it("purges presentation slides and their images too, deleting the row not just the key", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Presentation expired", 91);
    const board = await db.sfPresentationBoard.create({ data: { project_id: expired.projectId, title: "Board", sort_order: 0, created_by_id: designer.id } });
    const slideKey = `${expired.projectId}/slide`;
    await storage.put({ key: slideKey, body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    const slide = await db.sfPresentationSlide.create({ data: { board_id: board.id, image_key: slideKey, sort_order: 0 } });
    const result = await retention().purgeExpiredArchivedAssets();
    assert.equal(result.projectsPurged, 1);
    assert.equal(result.presentationSlides, 1);
    assert.equal(storage.objects.has(slideKey), false, "the slide's image is removed once unreferenced");
    assert.equal(await db.sfPresentationSlide.count({ where: { id: slide.id } }), 0, "the slide row itself is deleted, not just its image key");
    assert.equal(await db.sfPresentationBoard.count({ where: { id: board.id } }), 1, "the board itself is kept; only its slides are purged");
  });

  it("retries a delete that failed in an earlier run before starting new work, instead of losing the key", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Flaky delete", 91);
    const flakyKey = expired.keys.deliverable;
    let failNext = true;
    const flaky: ObjectStorage = {
      put: (input) => storage.put(input),
      putStream: (input) => storage.putStream(input),
      createSignedReadUrl: (key, expiresIn) => storage.createSignedReadUrl(key, expiresIn),
      async remove(key: string) {
        if (key === flakyKey && failNext) { failNext = false; throw new Error("disk unavailable"); }
        return storage.remove(key);
      },
    };

    const first = await retention({ storage: flaky }).purgeExpiredArchivedAssets();
    assert.equal(first.blobFailures, 1);
    assert.equal(first.previousFailuresResolved, 0);
    assert.ok(storage.objects.has(flakyKey), "the failed delete left the object in place, not silently dropped");
    const failure = await db.sfAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: flakyKey } });
    assert.equal(failure.resolved_at, null);
    assert.equal(failure.attempts, 1);

    const second = await retention().purgeExpiredArchivedAssets();
    assert.equal(second.previousFailuresResolved, 1);
    assert.equal(second.previousFailuresStillFailing, 0);
    assert.equal(storage.objects.has(flakyKey), false, "the retry finally removed the leaked object");
    assert.ok((await db.sfAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: flakyKey } })).resolved_at instanceof Date);
  });

  it("keeps shared keys, leaves malformed snapshots untouched and preserves legacy snapshot text", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Shared expired", 100);
    const live = await fixture("Shared live");
    await db.sfScheduleTemplateItem.create({ data: { section: "MATERIAL", category: "Floor", category_key: "floor", product_name: "Template", image_key: expired.keys.option } });
    await db.sfScheduleOption.updateMany({ where: { entry_id: live.entryId }, data: { image_key: expired.keys.deliverable } });
    const malformed = { items: [{ images: [{ storageKey: expired.keys.mom }] }], invalid: true };
    await db.sfMomRevision.create({ data: { document_id: expired.documentId, number: 2, snapshot: malformed, created_by_id: designer.id, created_by_name: "Designer" } });
    const legacy = { topic: "Legacy", meetingDate: "2026-09-01", venue: null, attendees: null, preparedByName: "Designer", items: [{ isTextOnly: true, listStyle: "DASH", points: [{ text: "Exact text", style: "DEFAULT" }], images: [] }] };
    const legacyRow = await db.sfMomRevision.create({ data: { document_id: expired.documentId, number: 3, snapshot: legacy, created_by_id: designer.id, created_by_name: "Designer" } });
    const result = await retention().purgeExpiredArchivedAssets();
    assert.equal(result.blobsKeptShared, 3); assert.equal(result.blobsRemoved, 1); assert.equal(result.unparseableRevisions, 1);
    for (const key of [expired.keys.option, expired.keys.deliverable, expired.keys.mom]) assert.ok(storage.objects.has(key));
    assert.deepEqual((await db.sfMomRevision.findFirstOrThrow({ where: { document_id: expired.documentId, number: 2 } })).snapshot, malformed);
    assert.deepEqual((await db.sfMomRevision.findUniqueOrThrow({ where: { id: legacyRow.id } })).snapshot, legacy);
  });

  it("validates settings and permissions, respects changed retention and oldest-first limits", async () => {
    assert.equal((await sf.projects.getStudioSettings({ grants: ALL })).archiveRetentionDays, 90);
    for (const archiveRetentionDays of [6, 731, 7.5, NaN]) await rejectsWith(sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays }), "ARCHIVE_RETENTION_INVALID");
    await rejectsWith(sf.projects.setArchiveRetention({ ...as(drafter, DRAFTER_GRANTS), archiveRetentionDays: 7 }), "PERMISSION_DENIED");
    await rejectsWith(retention().runAssetCleanup(as(drafter, DRAFTER_GRANTS)), "PERMISSION_DENIED");
    const older = await fixture("Older", 20);
    const newer = await fixture("Newer", 10);
    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 0);
    await sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays: 7 });
    assert.equal((await retention().runAssetCleanup({ ...as(designer), limit: 1 })).projectsPurged, 1);
    assert.ok((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: older.projectId } })).assets_purged_at);
    assert.equal((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: newer.projectId } })).assets_purged_at, null);
    assert.deepEqual(await sf.projects.getStudioSettings({ grants: ALL }), { archiveRetentionDays: 7, cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 40, handoverToOpening: 10 });
    await sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays: 730 });
    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 0);
  });

  it("claims each project exactly once across concurrent serializable sweeps", async () => {
    const expired = await fixture("Concurrent purge", 91);
    const results = await Promise.all([retention().purgeExpiredArchivedAssets(), retention().purgeExpiredArchivedAssets()]);
    assert.equal(results.reduce((n, result) => n + result.projectsPurged, 0), 1);
    assert.equal(results.reduce((n, result) => n + result.blobsRemoved, 0), 4);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purged" } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purge_completed" } }), 1);
  });

  it("rolls back the claim and all records if the primary audit fails, before any storage removal", async () => {
    const expired = await fixture("Rollback", 91);
    await assert.rejects(retention({ auditWriter: { write: async () => { throw Error("audit unavailable"); } } }).purgeExpiredArchivedAssets());
    assert.equal((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: expired.projectId } })).assets_purged_at, null);
    assert.equal(await testDb.prisma.sfDeliverable.count({ where: { project_id: expired.projectId } }), 1);
    assert.deepEqual(await testDb.prisma.sfMomRevision.findUniqueOrThrow({ where: { id: expired.revision.id } }), expired.revision);
    for (const key of Object.values(expired.keys)) assert.ok(storage.objects.has(key));
  });

  it("rechecks archive status when a restore happens after candidate selection", async () => {
    const expired = await fixture("Restored before claim", 91);
    let restored = false;
    const service = retention({ runTransaction: async (work) => {
      if (!restored) {
        restored = true;
        await sf.projects.restoreProject({ ...as(designer), projectId: expired.projectId });
      }
      return runSerializableTransaction(testDb.prisma, work);
    } });
    assert.equal((await service.purgeExpiredArchivedAssets()).projectsPurged, 0);
    for (const key of Object.values(expired.keys)) assert.ok(storage.objects.has(key));
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purged" } }), 0);
  });

  it("counts storage failures after commit and tolerates a failed completion audit without leaking details", async () => {
    const expired = await fixture("Failures", 91);
    const logs: unknown[][] = [];
    const logger = mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
    const writer = createAuditEventWriter();
    try {
      const result = await retention({
        storage: { put: (input) => storage.put(input), putStream: (input) => storage.putStream(input), createSignedReadUrl: (key, seconds) => storage.createSignedReadUrl(key, seconds), remove: async (key) => {
          assert.equal(await testDb.prisma.sfDeliverable.count({ where: { project_id: expired.projectId } }), 0);
          if (key === expired.keys.deliverable) throw Error("secret filename");
          await storage.remove(key);
        } },
        auditWriter: { write: async (event, tx) => { if (event.action.endsWith("assets_purge_completed")) throw Error("secret audit details"); await writer.write(event, tx); } },
      }).purgeExpiredArchivedAssets();
      assert.equal(result.projectsPurged, 1); assert.equal(result.blobFailures, 1); assert.equal(result.blobsRemoved, 3);
      assert.deepEqual(logs, [["StudioFlow asset cleanup completion audit failed."]]);
      assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purged" } }), 1);
      assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 0);
    } finally { logger.mock.restore(); }
  });

  it("WO-BE-03 C1: archive, purge, restore, add a file and archive again purges the new file too", async () => {
    const db = testDb.prisma;
    const day = 86_400_000;
    const cycle = await fixture("Cycle");
    const purgeEvents = (action: string) => db.auditEvent.count({ where: { entity_id: cycle.projectId, action } });
    await sf.projects.archiveProject({ ...as(designer), projectId: cycle.projectId, reason: "First archive" });
    clock = new Date(clock.getTime() + 91 * day);
    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 1);
    assert.ok((await db.sfProject.findUniqueOrThrow({ where: { id: cycle.projectId } })).assets_purged_at);

    await sf.projects.restoreProject({ ...as(designer), projectId: cycle.projectId });
    const restored = await db.auditEvent.findFirstOrThrow({ where: { entity_id: cycle.projectId, action: "studioflow.project.restored" } });
    assert.equal((restored.metadata as { assetsPurged: boolean }).assetsPurged, true);
    const newKey = `${cycle.projectId}/second-cycle`;
    await storage.put({ key: newKey, body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    const phase = await phaseOf(cycle.projectId, "moodboard");
    await db.sfDeliverable.create({ data: { project_id: cycle.projectId, phase_id: phase.id, name: "Second-cycle file", storage_key: newKey } });

    await sf.projects.archiveProject({ ...as(designer), projectId: cycle.projectId, reason: "Second archive" });
    assert.equal((await db.sfProject.findUniqueOrThrow({ where: { id: cycle.projectId } })).assets_purged_at, null, "a new archive clears the marker");
    clock = new Date(clock.getTime() + 89 * day);
    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 0);
    assert.ok(storage.objects.has(newKey), "still inside the second window");
    clock = new Date(clock.getTime() + 2 * day);
    const second = await retention().purgeExpiredArchivedAssets();
    assert.equal(second.projectsPurged, 1);
    assert.equal(second.deliverables, 1);
    assert.equal(storage.objects.has(newKey), false, "the second-cycle file is purged");
    assert.equal(await purgeEvents("studioflow.project.assets_purged"), 2);
    assert.equal(await purgeEvents("studioflow.project.assets_purge_completed"), 2);
    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 0, "a project archived once is purged once per cycle");
  });

  it("WO-BE-03 C3/C5: preview counts what the purge would purge and writes nothing; reads expose assetsPurgedAt", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Preview expired", 91);
    const boundary = await fixture("Preview boundary", 90);
    const live = await fixture("Preview live");
    await rejectsWith(retention().previewAssetCleanup(as(drafter, DRAFTER_GRANTS)), "PERMISSION_DENIED");
    const eventsBefore = await db.auditEvent.count();
    assert.deepEqual(await retention().previewAssetCleanup(as(designer)), { eligibleProjects: 1, retentionDays: 90 });
    assert.equal(await db.auditEvent.count(), eventsBefore, "preview writes no audit event");
    for (const key of Object.values(expired.keys)) assert.ok(storage.objects.has(key), "preview deletes nothing");
    assert.equal((await db.sfProject.findUniqueOrThrow({ where: { id: expired.projectId } })).assets_purged_at, null);
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId: expired.projectId })).assetsPurgedAt, null);

    assert.equal((await retention().purgeExpiredArchivedAssets()).projectsPurged, 1, "the purge acts on exactly what the preview counted");
    assert.deepEqual(await retention().previewAssetCleanup(as(designer)), { eligibleProjects: 0, retentionDays: 90 });
    assert.ok((await sf.projects.getProject({ grants: ALL, projectId: expired.projectId })).assetsPurgedAt instanceof Date);
    const archivedRows = await sf.projects.listProjects({ grants: ALL, archived: true });
    assert.ok(archivedRows.find((row) => row.id === expired.projectId)?.assetsPurgedAt instanceof Date);
    assert.equal(archivedRows.find((row) => row.id === boundary.projectId)?.assetsPurgedAt, null);
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId: live.projectId })).assetsPurgedAt, null);

    await sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays: 7 });
    assert.deepEqual(await retention().previewAssetCleanup(as(designer)), { eligibleProjects: 1, retentionDays: 7 }, "a shorter window makes the 90-day-old project eligible");
  });
});

describe("WO-BE-01 backend regressions", () => {
  it("stores project names exactly as typed and rejects a duplicate name", async () => {
    const results = await Promise.all(["Concurrent A", "2026-012 Typed number"].map((name) => sf.projects.createProject({
      ...as(designer), name, picDesignerId: designer.id, picDrafterId: drafter.id,
    })));
    const projects = await testDb.prisma.sfProject.findMany({ where: { id: { in: results.map((r) => r.projectId) } } });
    assert.deepEqual(projects.map((p) => p.name).sort(), ["2026-012 Typed number", "Concurrent A"]);
    await rejectsWith(sf.projects.createProject({ ...as(designer), name: "Concurrent A", picDesignerId: designer.id, picDrafterId: drafter.id }), "PROJECT_NAME_TAKEN");
  });

  it("renames a project freely and refuses a name another project already uses", async () => {
    const { projectId } = await newProject("Rename me");
    await newProject("Taken name");
    await sf.projects.updateProject({ ...as(designer), projectId, name: "Readable rename" });
    assert.equal((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: projectId } })).name, "Readable rename");
    await rejectsWith(sf.projects.updateProject({ ...as(designer), projectId, name: "Taken name" }), "PROJECT_NAME_TAKEN");
  });

  it("batched blockers equal single-phase counts and nav retains warning-only root items", async () => {
    const { projectId } = await newProject();
    const db = testDb.prisma;
    const phases = await db.sfPhase.findMany({ where: { project_id: projectId }, orderBy: { order_index: "asc" } });
    for (const [index, phase] of phases.slice(0, 2).entries()) {
      await db.sfPhase.update({ where: { id: phase.id }, data: { status: "ACTIVE" } });
      const active = await db.sfRevision.findFirst({ where: { phase_id: phase.id, status: "NOT_SENT" } }) ?? await db.sfRevision.create({ data: { phase_id: phase.id, name: "Open", status: "NOT_SENT" } });
      const closed = await db.sfRevision.create({ data: { phase_id: phase.id, major: 0, name: "Closed", status: "DONE" } });
      await db.sfActivity.createMany({ data: [
        ...Array.from({ length: index + 1 }, (_, n) => ({ project_id: projectId, phase_id: phase.id, revision_id: active.id, content: `Open ${n}` })),
        { project_id: projectId, phase_id: phase.id, revision_id: active.id, content: "Done", status: "COMPLETED" as const },
        { project_id: projectId, phase_id: phase.id, revision_id: closed.id, content: "Closed revision open item" },
        { project_id: projectId, phase_id: phase.id, revision_id: null, content: "Deferred" },
      ] });
      const root = await db.sfChecklistItem.create({ data: { project_id: projectId, phase_id: phase.id, label: "Blocking" } });
      await db.sfChecklistItem.createMany({ data: [
        { project_id: projectId, phase_id: phase.id, label: "Warning", is_blocking: false },
        { project_id: projectId, phase_id: phase.id, label: "Checked", is_checked: true },
        { project_id: projectId, phase_id: phase.id, label: "Child", parent_id: root.id },
      ] });
    }
    await db.sfChecklistItem.create({ data: { project_id: projectId, label: "General" } });
    const batch = await readBlockerCountsBatch(db, phases.map((phase) => phase.id));
    assert.equal(batch.size, phases.length);
    assert.deepEqual(await readBlockerCountsBatch(db, []), new Map());
    const list = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    const nav = await sf.phases.listNavPhases({ grants: ALL, projectId });
    assert.deepEqual(list.map((p) => p.id), phases.map((p) => p.id));
    assert.deepEqual(nav.map((p) => p.id), phases.map((p) => p.id));
    for (const [index, phase] of phases.entries()) {
      const single = await readBlockerCounts(db, phase.id);
      assert.deepEqual(batch.get(phase.id), single);
      // Feedback rows (now history only) never count; only the blocking root checklist item does.
      assert.deepEqual(single, { openRootChecklistItems: index < 2 ? 1 : 0 });
      assert.deepEqual(list[index].blockers, fullBlockers(single));
      assert.equal(nav[index].openCount, index < 2 ? 2 : 0);
    }
  });

  it("quick-search equals the old directory projection with limits, matching and archives", async () => {
    const db = testDb.prisma;
    for (let index = 0; index < 9; index++) {
      const { clientId } = await sf.projects.createClient({ ...as(designer), name: `Needle Client ${index}` });
      const { projectId } = await sf.projects.createProject({ ...as(designer), name: `Project ${index}`, clientId, picDesignerId: designer.id, picDrafterId: drafter.id, priority: index % 2 ? "URGENT" : "NORMAL" });
      if (index === 0) await db.sfProject.update({ where: { id: projectId }, data: { archived_at: clock } });
      if (index === 1) await db.sfClient.update({ where: { id: clientId }, data: { archived_at: clock } });
    }
    await sf.projects.createProject({ ...as(designer), name: "Needle without client", picDesignerId: designer.id, picDrafterId: drafter.id });
    for (const search of ["  nEeDlE  ", "Project", "missing", ""]) {
      const projects = await sf.projects.listProjects({ grants: ALL, search });
      const clients = await sf.projects.listClients({ grants: ALL, search });
      for (const limit of [undefined, 2]) {
        const actual = await sf.projects.quickSearch({ grants: ALL, search, limit });
        assert.deepEqual(actual, {
          projects: projects.slice(0, limit ?? 6).map((p) => ({ id: p.id, name: p.name, clientName: p.client?.name ?? null })),
          clients: clients.slice(0, limit ?? 6).map((c) => ({ id: c.id, name: c.name })),
        });
      }
    }
    await rejectsWith(sf.projects.quickSearch({ grants: [P.access], search: "needle" }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.quickSearch({ grants: [P.projectRead], search: "needle" }), "PERMISSION_DENIED");
  });

  it("projects each iteration's client notes and gives the open iteration the previous one as its brief", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const db = testDb.prisma;
    const active = await db.sfRevision.findFirstOrThrow({ where: { phase_id: phase.id, status: "NOT_SENT" } });
    await db.sfRevision.update({ where: { id: active.id }, data: { major: 3, note: "- Live remark" } });
    const closed = await db.sfRevision.create({ data: { phase_id: phase.id, major: 2, name: "Moodboard 2", status: "REVISED", done_at: clock, note: "- Warmer palette\n- Keep the marble" } });
    await db.sfRevision.create({ data: { phase_id: phase.id, major: 1, name: "Moodboard 1", status: "REVISED", done_at: clock } });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(detail.currentIteration?.note, "- Live remark");
    assert.deepEqual(detail.currentIteration?.answerChoices, ["revision", "done"]);
    assert.deepEqual(detail.previousIteration, { id: closed.id, name: "Moodboard 2", state: "REVISED", note: "- Warmer palette\n- Keep the marble" });
    assert.deepEqual(detail.history.map((r) => [r.name, r.note]), [["Moodboard 2", "- Warmer palette\n- Keep the marble"], ["Moodboard 1", null]]);
  });
});

describe("SF-R1 bootstrap and naming", () => {
  it("creates the legacy project skeleton and template seeding", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: null, label: "Kick-off meeting" });
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Collect references" });
    const first = await newProject();
    const second = await newProject("Kopi Kenangan");
    assert.equal(first.name, "Heloskin Cimanggu");
    assert.equal(second.name, "Kopi Kenangan");

    const phases = await testDb.prisma.sfPhase.findMany({ where: { project_id: first.projectId }, orderBy: { order_index: "asc" } });
    assert.deepEqual(phases.map((p) => [p.definition_id, p.status, p.allow_parallel]), [
      [LEGACY.moodboard, "ACTIVE", false], [LEGACY.layout, "PENDING", true], [LEGACY.design3d, "PENDING", true], [LEGACY.cd, "PENDING", true], [LEGACY.supervision, "PENDING", false],
    ]);
    assert.deepEqual(await revisions(phases[0].id), ["Moodboard 1:NOT_SENT"]);
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

  it("accepts any non-empty project name", async () => {
    await rejectsWith(sf.projects.createProject({ ...as(designer), name: "   ", picDesignerId: designer.id, picDrafterId: drafter.id }), "PROJECT_NAME_REQUIRED");
    const created = await sf.projects.createProject({ ...as(designer), name: " No Number ", picDesignerId: designer.id, picDrafterId: drafter.id });
    assert.equal(created.name, "No Number");
  });

  it("requires eligible PICs and the manage grant", async () => {
    const outsider = await seedUser("Outsider", [P.access, P.projectRead]);
    await rejectsWith(sf.projects.createProject({ ...as(designer), name: "X", picDesignerId: outsider.id, picDrafterId: drafter.id }), "PIC_NOT_ELIGIBLE");
    await rejectsWith(sf.projects.createProject({ ...as(drafter, DRAFTER_GRANTS), name: "X", picDesignerId: designer.id, picDrafterId: drafter.id }), "PERMISSION_DENIED");
    const designers = await sf.projects.listAssignablePeople({ grants: ALL, seat: "designer" });
    const drafters = await sf.projects.listAssignablePeople({ grants: ALL, seat: "drafter" });
    assert.deepEqual(designers.map((p) => p.displayName), ["Dina Designer"]);
    assert.deepEqual(drafters.map((p) => p.displayName), ["Dina Designer", "Dodi Drafter"]);
  });

  it("requires the assigned PIC for project mutations and exposes the shared access model", async () => {
    const { projectId } = await newProject();
    const unassignedGrants = ALL.filter((grant) => grant !== P.projectOverride);
    const outsider = await seedUser("Unassigned", unassignedGrants);
    const moodboard = await phaseOf(projectId, "moodboard");
    const cd = await phaseOf(projectId, "cd");

    await rejectsWith(sf.projects.setProjectPriority({ ...as(outsider, unassignedGrants), projectId, priority: "URGENT" }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.sendIteration({ ...as(outsider, unassignedGrants), projectId, phaseId: moodboard.id, iterationId: (await openIteration(moodboard.id)).id }), "PERMISSION_DENIED");
    await rejectsWith(sf.mom.createDocument({ ...as(outsider, unassignedGrants), projectId, topic: "Denied" }), "PERMISSION_DENIED");
    await rejectsWith(sf.schedule.createEntry({ ...as(outsider, unassignedGrants), projectId, section: "MATERIAL", category: "Panel" }), "PERMISSION_DENIED");
    await rejectsWith(sf.presentation.createBoard({ ...as(outsider, unassignedGrants), projectId, title: "Denied" }), "PERMISSION_DENIED");

    await sf.projects.setProjectPriority({ ...as(designer), projectId, priority: "URGENT" });
    await sf.mom.createDocument({ ...as(drafter, [...DRAFTER_GRANTS, P.momManage]), projectId, topic: "Drafter can edit documents" });
    await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    const cdIteration = await openIteration(cd.id);
    await sf.phases.setIterationNote({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, iterationId: cdIteration.id, note: "Drafter-seat notes" });
    const access = await sf.projects.getAccess({ grants: DRAFTER_GRANTS, actor: drafter.actor, projectId });
    assert.deepEqual({ project: access.canEditProject, documents: access.canEditDocuments }, { project: false, documents: true });
    assert.equal(access.phases.find((phase) => phase.phaseId === moodboard.id)?.canTransition, false);
    assert.equal(access.phases.find((phase) => phase.phaseId === moodboard.id)?.canEditContent, false);
    assert.equal(access.phases.find((phase) => phase.phaseId === cd.id)?.canTransition, true);
    assert.equal(access.phases.find((phase) => phase.phaseId === cd.id)?.canEditContent, true);

    await rejectsWith(sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.setIterationNote({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, iterationId: (await openIteration(moodboard.id)).id, note: "Not the drafter's phase" }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.setProjectPriority({ ...as(drafter, DRAFTER_GRANTS), projectId, priority: "LOW" }), "PERMISSION_DENIED");
    const override = await seedUser("Override", ALL);
    const overrideAccess = await sf.projects.getAccess({ grants: ALL, actor: override.actor, projectId });
    assert.equal(overrideAccess.override, true);
    await sf.projects.setProjectStatus({ ...as(override), projectId, status: "ON_HOLD" });
  });

  it("reads batch access once and keeps every single-project access result", async () => {
    const active = await newProject("Batch access active");
    const completed = await newProject("Batch access completed");
    await testDb.prisma.sfProject.update({ where: { id: completed.projectId }, data: { status: "COMPLETED" } });
    const outsiderGrants = [P.access, P.projectRead];
    const outsider = await seedUser("Batch access outsider", outsiderGrants);
    const override = await seedUser("Batch access override", ALL);
    const projectIds = [active.projectId, completed.projectId];

    for (const person of [
      { user: designer, grants: ALL },
      { user: drafter, grants: DRAFTER_GRANTS },
      { user: override, grants: ALL },
      { user: outsider, grants: outsiderGrants },
    ]) {
      const batch = await sf.projects.listAccess({ grants: person.grants, actor: person.user.actor, projectIds });
      for (const projectId of projectIds) {
        assert.deepEqual(batch.get(projectId), await sf.projects.getAccess({ grants: person.grants, actor: person.user.actor, projectId }));
      }
    }

    let projectQueries = 0;
    const countedProjectDelegate = new Proxy(testDb.prisma.sfProject, {
      get(target, property, receiver) {
        if (property === "findMany") return async (...args: Parameters<typeof target.findMany>) => {
          projectQueries += 1;
          return target.findMany(...args);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    const countedDb = new Proxy(testDb.prisma, {
      get(target, property, receiver) {
        return property === "sfProject" ? countedProjectDelegate : Reflect.get(target, property, receiver);
      },
    }) as PrismaClient;
    const countedService = createStudioFlowService(countedDb, {
      runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => countedDb.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(),
      people: createPeopleDirectory(countedDb),
      storage,
      notificationWriter: createNotificationWriter(),
      masterData: createMasterDataPublicRead(countedDb),
      now: () => clock,
    });
    await countedService.projects.listAccess({ grants: ALL, actor: designer.actor, projectIds });
    assert.equal(projectQueries, 1, "one project query serves every requested project");
    await countedService.projects.listAccess({ grants: ALL, actor: designer.actor, projectIds: [] });
    assert.equal(projectQueries, 1, "an empty batch makes no project query");
  });

  it("archives read-only and restores with audit", async () => {
    const { projectId } = await newProject();
    await rejectsWith(sf.projects.archiveProject({ ...as(designer), projectId, reason: " " }), "ARCHIVE_REASON_REQUIRED");
    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Client paused" });
    const moodboard = await phaseOf(projectId, "moodboard");
    await rejectsWith(sf.phases.setIterationNote({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: (await openIteration(moodboard.id)).id, note: "x" }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.projects.updateProject({ ...as(designer), projectId, address: "New" }), "PROJECT_ARCHIVED");
    assert.equal((await sf.projects.listProjects({ grants: ALL })).length, 0);
    assert.equal((await sf.projects.listProjects({ grants: ALL, archived: true })).length, 1);
    await sf.projects.restoreProject({ ...as(designer), projectId });
    const history = await sf.projects.getProjectHistory({ grants: ALL, projectId });
    assert.deepEqual(history.map((h) => h.action).slice(0, 3), ["studioflow.project.restored", "studioflow.project.archived", "studioflow.project.created"]);
  });
});

describe("Iteration workflow (WO-SF-ITER-01)", () => {
  it("sends iterations to the client, keeps what the client said as iteration notes, and finishes", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };

    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Draft board" });
    await sf.tasks.syncProjectChecklist({ ...as(designer), projectId });
    const requirements = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id });
    assert.deepEqual(requirements.map((item) => item.label), ["Draft board"]);
    const first = await openIteration(phase.id);
    await sf.phases.sendIteration({ ...base, iterationId: first.id }); // requirements are reminders and never block
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:SENT"]);

    await rejectsWith(sf.phases.chooseIterationOutcome({ ...base, iterationId: first.id, outcome: "REVISION" }), "PHASE_INVALID_STATE");
    await sf.phases.recordClientAnswer({ ...base, iterationId: first.id, note: "- Warmer palette\n- Keep the marble" });
    // A retry with the same answer is harmless; notes added later replace them.
    await sf.phases.recordClientAnswer({ ...base, iterationId: first.id, note: "- Warmer palette\n- Keep the marble at reception" });
    const revised = await sf.phases.chooseIterationOutcome({ ...base, iterationId: first.id, outcome: "REVISION" });
    assert.ok("nextIterationId" in revised);
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:REVISED", "Moodboard 2:NOT_SENT"]);
    // The notes stay on the iteration they belong to; nothing is copied into requirements or to-dos.
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: first.id } })).note, "- Warmer palette\n- Keep the marble at reception");
    assert.deepEqual((await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id })).map((item) => item.label), ["Draft board"]);
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(detail.previousIteration?.note, "- Warmer palette\n- Keep the marble at reception", "the next iteration shows them as its brief");

    // Notes can be written or corrected on any iteration while the project is open, and undone by their author.
    const second = await openIteration(phase.id);
    await sf.phases.setIterationNote({ ...base, iterationId: second.id, note: "Internal draft remark" });
    const event = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });
    await sf.phases.undoPhaseEvent({ ...base, eventId: event.id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: second.id } })).note, null);
    await rejectsWith(sf.phases.setIterationNote({ ...base, iterationId: second.id, note: "x".repeat(4001) }), "TEXT_TOO_LONG");

    await sf.phases.sendIteration({ ...base, iterationId: second.id });
    await sf.phases.recordClientAnswer({ ...base, iterationId: second.id, note: "Client wants marble" });
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: second.id, outcome: "REVISION" });
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:REVISED", "Moodboard 2:REVISED", "Moodboard 3:NOT_SENT"]);

    clock = new Date("2026-09-18T03:00:00Z");
    await clientRound(base, "DONE");
    const after = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id } });
    assert.equal(after.status, "DONE");
    assert.equal(after.is_locked, true);
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:REVISED", "Moodboard 2:REVISED", "Moodboard 3:DONE"]);
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE", "finishing a phase never completes the project");
    assert.deepEqual((await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id })).map((item) => item.label), ["Draft board"], "Done adds nothing to the requirements");

    const actions = (await testDb.prisma.auditEvent.findMany({ where: { entity_id: phase.id }, orderBy: { occurred_at: "asc" } })).map((e) => e.action);
    assert.ok(actions.includes("studioflow.phase.iteration-revised"));
    assert.ok(actions.includes("studioflow.phase.iteration-done"));
    assert.ok(actions.includes("studioflow.phase.iteration-note-set"));
  });

  it("never blocks a client step on unchecked checklist items", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Board printed" });
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const [root] = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id });
    assert.ok(root, "the requirement is still open");
    const sub = await sf.tasks.createSubtask({ ...as(designer), projectId, parentId: root.id, label: "Print A3" });
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: root.id, checked: true });
    const child = await testDb.prisma.sfChecklistItem.findUniqueOrThrow({ where: { id: sub.itemId } });
    assert.equal(child.is_checked, true, "parent cascades down");
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: sub.itemId, checked: false });
    await sf.phases.sendIteration({ ...base, iterationId: (await openIteration(phase.id)).id });
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(phases[0].blockers.total, 0);
  });

  it("enforces sequential starts, parallel phases, ON_HOLD and leaves completion explicit", async () => {
    const { projectId } = await newProject();
    const layout = await phaseOf(projectId, "layout");
    const supervision = await phaseOf(projectId, "supervision");
    await sf.phases.addIteration({ ...as(designer), projectId, phaseId: layout.id });
    await rejectsWith(sf.phases.addIteration({ ...as(designer), projectId, phaseId: supervision.id }), "PHASE_SEQUENTIAL");
    await rejectsWith(sf.phases.createSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, visitDate: "2026-09-20" }), "PHASE_SEQUENTIAL");
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: supervision.id })).canStart, false);
    const cd = await phaseOf(projectId, "cd");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" });
    await rejectsWith(sf.phases.addIteration({ ...as(designer), projectId, phaseId: cd.id }), "PROJECT_NOT_ACTIVE");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ACTIVE" });
    const before = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(before.find((p) => p.definitionId === LEGACY.supervision)?.startBlockedReason, "Starts after Construction Drawing is approved.");
    await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: cd.id, reason: "Client does own drawings" });
    const phases = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(phases.find((p) => p.definitionId === LEGACY.cd)?.status, "DONE");
    assert.equal(phases.find((p) => p.definitionId === LEGACY.supervision)?.startBlockedReason, null);
    // CD done → Supervision can start (its predecessor is CD) with its first visit.
    const visit = await sf.phases.createSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, visitDate: "2026-09-20" });
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, iterationId: visit.iterationId, outcome: "DONE" });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: supervision.id } })).status, "DONE");
    const project = await sf.projects.getProject({ grants: ALL, projectId });
    assert.equal(project.status, "ACTIVE");
  });

  it("lets the drafter run CD and record its client notes, and keeps the designer's phases off-limits", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    const moodboard = await phaseOf(projectId, "moodboard");
    const base = { ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id };
    await sf.phases.addIteration(base);
    await rejectsWith(sf.phases.sendIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, iterationId: (await openIteration(moodboard.id)).id }), "PERMISSION_DENIED");
    const iteration = await openIteration(cd.id);
    await sf.phases.sendIteration({ ...base, iterationId: iteration.id });
    await sf.phases.recordClientAnswer({ ...base, iterationId: iteration.id, note: "Fix section A" });
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: iteration.id, outcome: "REVISION" });
    // The drafter's client notes stay on the CD iteration; nothing becomes a checklist item.
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: iteration.id } })).note, "Fix section A");
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { phase_id: cd.id } }), 0);
  });

  it("adds an iteration to a finished phase and overrides with a history snapshot", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await clientRound(base, "DONE");
    const reopened = await sf.phases.addIteration(base);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: reopened.iterationId } })).name, "Moodboard 2");
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id } })).status, "ACTIVE");
    await rejectsWith(sf.phases.overrideRevision({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: phase.id, mode: "HARD_RESET_PENDING", note: "x" }), "PERMISSION_DENIED");
    await sf.phases.setIterationNote({ ...base, iterationId: reopened.iterationId, note: "Client remark kept in the snapshot" });
    await sf.phases.overrideRevision({ ...base, mode: "HARD_RESET_ACTIVE", major: 3, note: "Align with client numbering" });
    assert.deepEqual(await revisions(phase.id), ["Moodboard 3:NOT_SENT"]);
    const event = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { entity_id: phase.id, action: "studioflow.phase.revision-overridden" } });
    const history = (event.metadata as { history: Array<{ version: string; note: string | null }> }).history;
    assert.deepEqual(history.map((h) => [h.version, h.note]), [["Moodboard 1", null], ["Moodboard 2", "Client remark kept in the snapshot"]]);
  });
});

describe("WO-SF-NOTES-ONLY-01 requirements", () => {
  it("keeps template-backed requirements and their subtasks while removing the ad-hoc creation command", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: null, label: "Site survey" });
    const { projectId } = await newProject();
    const [requirement] = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: null });
    assert.ok(requirement);
    const subtask = await sf.tasks.createSubtask({ ...as(designer), projectId, parentId: requirement.id, label: "Measure rooms" });
    const after = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: undefined });
    assert.deepEqual(after.map((item) => [item.label, item.children.map((child) => child.label)]), [["Site survey", ["Measure rooms"]]]);
    assert.equal("createItem" in sf.tasks, false, "an ad-hoc checklist row has no creation command");
    assert.ok(subtask.itemId);
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
  it("creates entries as proposals with stable codes; only Set as final decides, and deciding can be undone", async () => {
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
      ["PT-01", "Paint", "A", false],
      ["PT-02", "Paint", "A", false],
    ], "a product typed while adding is a proposal, not a decision");

    const option = await sf.schedule.createOption({ ...as(designer), projectId, entryId: first.entryId, snapshot: { productName: "Nippon Spotless", brandName: "Nippon", color: "Bone" } });
    await sf.schedule.markFinal({ ...as(designer), projectId, optionId: option.optionId });
    const optionsOf = async () => (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.id === first.entryId)!.options.map((o) => [o.label, o.status, o.isFinal]);
    assert.deepEqual(await optionsOf(), [["A", "NOT_USED", false], ["B", "APPROVED", true]]);

    await sf.schedule.unmarkFinal({ ...as(designer), projectId, optionId: option.optionId });
    assert.deepEqual(await optionsOf(), [["A", "DRAFT", false], ["B", "DRAFT", false]], "unset final: undecided again, nothing reads as not used");
    assert.equal((await testDb.prisma.auditEvent.count({ where: { entity_id: option.optionId, action: "studioflow.schedule.option-unfinalized" } })), 1);

    await sf.schedule.markFinal({ ...as(designer), projectId, optionId: option.optionId });
    await sf.schedule.deleteOption({ ...as(designer), projectId, optionId: option.optionId });
    assert.deepEqual(await optionsOf(), [["A", "DRAFT", false]], "deleting the final option never promotes another one");

    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: first.entryId });
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => [e.id, e.code]), [[second.entryId, "PT-02"]], "later codes keep their number after a delete");
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code), ["PT-02", "PT-03"], "a new row takes one past the highest number");
  });

  it("reorders by handing the group's own numbers out again, so a deleted code stays empty", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    const one = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const two = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const three = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: two.entryId });
    await sf.schedule.reorderEntries({ ...as(designer), projectId, section: "MATERIAL", prefix: "PT", orderedIds: [three.entryId, one.entryId] });
    const codes = Object.fromEntries((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((row) => [row.id, row.code]));
    assert.deepEqual([codes[three.entryId], codes[one.entryId]], ["PT-01", "PT-03"], "the two rows swap PT-01 and PT-03; PT-02 stays empty");
    await sf.schedule.moveEntry({ ...as(designer), projectId, entryId: one.entryId, direction: "up" });
    const moved = Object.fromEntries((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((row) => [row.id, row.code]));
    assert.deepEqual([moved[one.entryId], moved[three.entryId]], ["PT-01", "PT-03"]);
  });

  it("orders categories by the studio template order, unknown categories after, A to Z", async () => {
    await sf.schedule.createTemplateItem({ ...as(designer), section: "MATERIAL", category: "Wallpaper", snapshot: { productName: "" } });
    await sf.schedule.createTemplateItem({ ...as(designer), section: "MATERIAL", category: "Paint", snapshot: { productName: "" } });
    const { projectId } = await newProject();
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Brick" });
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Acrylic" });
    const categories = [...new Set((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((row) => row.category))];
    assert.deepEqual(categories, ["Wallpaper", "Paint", "Acrylic", "Brick"]);

    // The category pickers offer what the studio knows: template categories in order, then the prefix dictionary.
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Granite", prefix: "GR" });
    await sf.schedule.upsertPrefix({ ...as(designer), section: "FIXTURE", category: "Lamp", prefix: "LP" });
    assert.deepEqual(await sf.schedule.listCategoryChoices({ grants: DRAFTER_GRANTS }), [
      { section: "MATERIAL", category: "Wallpaper", prefix: null },
      { section: "MATERIAL", category: "Paint", prefix: "PT" },
      { section: "MATERIAL", category: "Granite", prefix: "GR" },
      { section: "FIXTURE", category: "Lamp", prefix: "LP" },
    ], "each category once; read-only users may read it");
  });

  it("keeps quantity and unit for Fixture only", async () => {
    const { projectId } = await newProject();
    const material = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", qty: "12", unit: "m2", location: "Living room" });
    const fixture = await sf.schedule.createEntry({ ...as(designer), projectId, section: "FIXTURE", category: "Lamp", qty: "3", unit: "pcs" });
    const rows = await sf.schedule.listSchedule({ grants: ALL, projectId });
    const m = rows.find((row) => row.id === material.entryId)!;
    const f = rows.find((row) => row.id === fixture.entryId)!;
    assert.deepEqual([m.qty, m.unit, m.location], [null, null, "Living room"]);
    assert.deepEqual([f.qty, f.unit], ["3", "pcs"]);
  });

  it("lets a designer request a sample without naming a supplier", async () => {
    const { projectId } = await newProject();
    const { entryId } = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Unknown source paint", brandName: "Dulux" } });
    const entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!;
    await sf.schedule.requestSample({ ...as(designer), projectId, optionId: entry.options[0].id });
    const request = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!.options[0].sampleRequest;
    assert.deepEqual([request?.status, request?.requestedFrom], ["REQUESTED", ""]);
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

  it("cancels a mistaken sample request while it is still pending, but never a received one", async () => {
    const db = testDb.prisma;
    const { projectId } = await newProject();
    const { entryId } = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Cancel-me paint" } });
    const entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!;
    const optionId = entry.options[0].id;

    const { requestId } = await sf.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Toko Cat Jaya" });
    await sf.schedule.cancelSample({ ...as(designer), projectId, requestId });

    const afterCancel = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entry.id)!;
    assert.equal(afterCancel.options[0].sampleRequest, null, "the cancelled request is gone, not just marked resolved");
    assert.equal(await db.sfScheduleSampleRequest.count({ where: { id: requestId } }), 0);

    const events = await db.auditEvent.findMany({ where: { entity_id: optionId, action: "studioflow.schedule.sample-request-cancelled" } });
    assert.equal(events.length, 1);
    assert.equal((events[0].metadata as { requestedFrom?: string }).requestedFrom, "Toko Cat Jaya");

    // A cancelled request never blocks asking again.
    const { requestId: secondRequestId } = await sf.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Toko Cat Baru" });

    // Cancelling an already-cancelled (now deleted) request, and cancelling a received one, both fail cleanly.
    await rejectsWith(sf.schedule.cancelSample({ ...as(designer), projectId, requestId }), "SCHEDULE_ITEM_NOT_FOUND");
    await sf.schedule.receiveSample({ ...as(designer), projectId, requestId: secondRequestId, note: null });
    await rejectsWith(sf.schedule.cancelSample({ ...as(designer), projectId, requestId: secondRequestId }), "SAMPLE_NOT_PENDING");
  });

  it("applies templates idempotently and snapshots Master Data Brand through the public port", async () => {
    const tag = randomUUID().slice(0, 8);
    const brand = await testDb.prisma.brand.create({ data: { id: randomUUID(), name: `TACO ${tag}`, slug: `taco-${tag}` } });
    await sf.schedule.createTemplateItem({
      ...as(designer),
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
    const tile = (await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId, section: "MATERIAL" })).find((row) => row.options[0]?.productName === "Granitio - GR-1");
    assert.ok(tile);
    assert.deepEqual([tile.qty, tile.unit, tile.location], [null, null, "Lobby"], "a Material line never keeps qty or unit, imported or not");
    assert.notEqual(sourceEntry.entryId, targetEntry.entryId);
  });

  it("imports the plain schedule layout from an .xlsx exactly like the CSV, and offers a template", async () => {
    const { projectId } = await newProject("Xlsx import");
    const columns = [{ key: "category", header: "Category" }, { key: "brand", header: "Brand" }, { key: "product", header: "Product" }, { key: "qty", header: "Qty" }, { key: "unit", header: "Unit" }, { key: "location", header: "Location" }];
    const rows = [{ category: "Tile", brand: "Roman", product: "Granitio", qty: "12", unit: "m2", location: "Lobby" }];
    const xlsx = await exportTable({ format: "xlsx", filename: "schedule", columns, rows });
    const imported = await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", file: { name: xlsx.filename, data: xlsx.data } });
    assert.equal(imported.created, 1);
    assert.ok((await sf.schedule.listSchedule({ grants: ALL, projectId, section: "MATERIAL" })).some((row) => row.options[0].productName === "Granitio"));
    await rejectsWith(sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", file: { name: "notes.txt", data: Buffer.from("x") } }), "TABULAR_FILE_TYPE");
    for (const format of ["xlsx", "csv"] as const) {
      const template = await sf.schedule.importTemplate({ ...as(designer), projectId, format });
      const again = await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", file: { name: template.filename, data: template.data } });
      assert.equal(again.created, 1, "the template's example row imports as a plain-layout row");
    }
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

  it("never lets two categories share a code sequence, and reorders one category inside an older shared prefix", async () => {
    const { projectId } = await newProject();
    const wallpaper = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Wallpaper" });
    const panel = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Wall panel" });
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Wallpaper" });
    const codes = Object.fromEntries((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((row) => [row.id, row.code]));
    assert.equal(codes[wallpaper.entryId], "WA-01");
    assert.equal(codes[panel.entryId], "WL-01", "Wall panel takes its own prefix instead of WA-02");
    // A Fixture category may reuse WA: numbering is per section.
    const fixture = await sf.schedule.createEntry({ ...as(designer), projectId, section: "FIXTURE", category: "Wardrobe" });
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId, section: "FIXTURE" })).find((row) => row.id === fixture.entryId)!.code, "WA-01");

    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Wallpaper", prefix: "WP" });
    await rejectsWith(sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Wall panel", prefix: "WP" }), "SCHEDULE_PREFIX_IN_USE");

    // A project from before this rule: Granite and Gypsum both numbered under GR, interleaved.
    const legacy = await newProject("Shared prefix project");
    const granite1 = await sf.schedule.createEntry({ ...as(designer), projectId: legacy.projectId, section: "MATERIAL", category: "Granite" });
    const gypsum1 = await sf.schedule.createEntry({ ...as(designer), projectId: legacy.projectId, section: "MATERIAL", category: "Gypsum" });
    const granite2 = await sf.schedule.createEntry({ ...as(designer), projectId: legacy.projectId, section: "MATERIAL", category: "Granite" });
    await testDb.prisma.sfScheduleEntry.update({ where: { id: gypsum1.entryId }, data: { prefix: "GR", increment: 50 } });
    await testDb.prisma.sfScheduleEntry.update({ where: { id: granite2.entryId }, data: { increment: 3 } });
    await testDb.prisma.sfScheduleEntry.update({ where: { id: gypsum1.entryId }, data: { increment: 2 } });
    await sf.schedule.reorderEntries({ ...as(designer), projectId: legacy.projectId, section: "MATERIAL", prefix: "GR", orderedIds: [granite2.entryId, granite1.entryId] });
    const after = Object.fromEntries((await sf.schedule.listSchedule({ grants: ALL, projectId: legacy.projectId })).map((row) => [row.id, row.code]));
    assert.deepEqual([after[granite2.entryId], after[gypsum1.entryId], after[granite1.entryId]], ["GR-01", "GR-02", "GR-03"], "Gypsum keeps its slot; the two Granite rows swap");
    await sf.schedule.moveEntry({ ...as(designer), projectId: legacy.projectId, entryId: granite1.entryId, direction: "up" });
    const moved = Object.fromEntries((await sf.schedule.listSchedule({ grants: ALL, projectId: legacy.projectId })).map((row) => [row.id, row.code]));
    assert.deepEqual([moved[granite1.entryId], moved[gypsum1.entryId], moved[granite2.entryId]], ["GR-01", "GR-02", "GR-03"], "up/down skips the other category's row");
  });

  it("preserves pattern through template items, seeding, reuse, and search", async () => {
    await sf.schedule.createTemplateItem({
      ...as(designer),
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
    const a = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", location: "Bedroom", snapshot: { productName: "A paint" } });
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
    assert.equal(hits[0]?.sourceProjectName, "Heloskin Cimanggu", "edited snapshot is searchable");

    await sf.schedule.updateEntry({ ...as(designer), projectId, entryId: a.entryId, location: "Lobby" });
    rowA = (await list()).find((row) => row.id === a.entryId)!;
    assert.deepEqual([rowA.qty, rowA.unit, rowA.location], [null, null, "Lobby"], "a Material line never keeps qty or unit, and only the sent field changes");

    await sf.schedule.moveEntry({ ...as(designer), projectId, entryId: c.entryId, direction: "up" });
    assert.deepEqual((await list()).map((row) => [row.code, row.id]), [["PT-01", a.entryId], ["PT-02", c.entryId], ["PT-03", b.entryId]]);

    const moved = await sf.schedule.moveEntryToCategory({ ...as(designer), projectId, entryId: a.entryId, category: "wallpaper" });
    assert.equal(moved.code, "WP-01");
    assert.deepEqual((await list()).map((row) => [row.code, row.category]), [["PT-02", "Paint"], ["PT-03", "Paint"], ["WP-01", "Wallpaper"]], "the moved row's old code PT-01 is left empty");
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
    await rejectsWith(sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Tile Wall", prefix: "FL" }), "SCHEDULE_PREFIX_IN_USE");
    // A dictionary from before that rule may still hold one prefix twice; an import then refuses to guess.
    await testDb.prisma.sfSchedulePrefix.create({ data: { section: "MATERIAL", category: "Tile Wall", category_key: "TILE WALL", prefix: "FL" } });
    await rejectsWith(sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: "Code,Product Category,Ex,Type\nFL-09,,Brand,Thing" }), "SCHEDULE_CSV_CATEGORY");
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId })).length, 3, "a failed import writes nothing");
  });

  it("re-imports a sheet without wiping specs, photo or decision, and keeps the sheet's own codes", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    const existing = await sf.schedule.createEntry({
      ...as(designer), projectId, section: "MATERIAL", category: "Paint",
      snapshot: { productName: "Old paint", brandName: "Dulux", color: "Pink", finishing: "Matt", dimension: "5 L", extra: [{ label: "Coverage", value: "12 m²/L" }] },
    });
    const optionId = (await sf.schedule.listSchedule({ grants: ALL, projectId }))[0].options[0].id;
    await sf.schedule.setOptionImage({ ...as(designer), projectId, optionId, file: png() });
    await sf.schedule.markFinal({ ...as(designer), projectId, optionId });
    const photoKey = (await testDb.prisma.sfScheduleOption.findUniqueOrThrow({ where: { id: optionId } })).image_key;
    assert.ok(photoKey);

    // Rows out of order and with a gap (FL-02 was deleted in the sheet).
    const sheet = [
      "Code,Product Category,Ex,Type,Initials Type,Image,Location,Contact,Qty,Unit",
      "FL-03,Floor Tile,Roman,Granitio,,,Lobby,,,",
      "FL-01,Floor Tile,Roman,dBasic,,,Toilet,,,",
      "PT-01,,Dulux,Easy Clean,,,Bedroom,,,",
    ].join("\n");
    assert.deepEqual(await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: sheet }), { created: 2, updated: 1 });
    const rows = await sf.schedule.listSchedule({ grants: ALL, projectId, section: "MATERIAL" });
    const pt = rows.find((row) => row.id === existing.entryId)!.options[0];
    assert.deepEqual(
      [pt.productName, pt.brandName, pt.color, pt.finishing, pt.dimension, pt.extra, pt.isFinal],
      ["Easy Clean", "Dulux", "Pink", "Matt", "5 L", [{ label: "Coverage", value: "12 m²/L" }], true],
      "only brand, type and notes come from the sheet; specs and the decision stay",
    );
    assert.equal((await testDb.prisma.sfScheduleOption.findUniqueOrThrow({ where: { id: optionId } })).image_key, photoKey, "the photo stays");
    assert.equal(storage.objects.size, 1);
    assert.deepEqual(rows.filter((row) => row.category === "Floor Tile").map((row) => [row.code, row.options[0].productName, row.options[0].isFinal]), [["FL-01", "dBasic", false], ["FL-03", "Granitio", false]], "sheet codes are kept, gap and all; imported rows are proposals");

    assert.deepEqual(await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: sheet }), { created: 0, updated: 3 }, "importing the same sheet again finds the same rows");
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId })).length, 3, "no duplicates");
    // The photo test after this one expects an empty store.
    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: existing.entryId });
    assert.equal(storage.objects.size, 0);
  });

  it("manages template items and skips inactive ones", async () => {
    const one = await sf.schedule.createTemplateItem({ ...as(designer), section: "FIXTURE", category: "Lighting", snapshot: { productName: "Downlight" } });
    const two = await sf.schedule.createTemplateItem({ ...as(designer), section: "FIXTURE", category: "Lighting", snapshot: { productName: "Track light" } });
    const templates = await sf.schedule.listTemplates({ grants: ALL });
    assert.deepEqual(templates.map((t) => [t.category, t.items.length]), [["Lighting", 2]], "items get a category row");
    await sf.schedule.setTemplateItemActive({ ...as(designer), templateItemId: two.templateItemId, isActive: false });
    // "Default categories" folded into Template Items (owner, 2026-09-24): a
    // blank Type reserves the category with no default product.
    await sf.schedule.createTemplateItem({ ...as(designer), section: "MATERIAL", category: "Paint", snapshot: { productName: "" } });
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

    // Brand rows never wait on websites; the website read is separate, batched and keyed by stored Brands only.
    assert.equal("imageUrl" in found, false);
    assert.deepEqual(await sf.library.readBrandWebsites({ grants: ALL, brandIds: [brand.id, randomUUID()] }), [{ id: brand.id, imageUrl: null, websiteCatalogue: null }]);
    assert.deepEqual(await sf.library.readBrandWebsites({ grants: ALL, brandIds: [] }), []);
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

  it("custom seat names the phase owner from the snapshot", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: cd.id });
    assert.equal(detail.seatUserId, drafter.id, "CD belongs to the drafter seat from the snapshot");
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
    await clientRound(base, "REVISION");
    const after = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(after.status, "OUTDATED", "files belong to old revision after reject");
  });

  it("keeps two non-final versions per normalized slot, separately from a final", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    for (const name of [" Design.PDF ", "design.pdf", "design.pdf"]) await sf.phases.uploadDeliverable({ ...base, name, file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
    let listed = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(listed.items.length, 2);
    await sf.phases.setDeliverableFinal({ ...as(designer), projectId, deliverableId: listed.items[0].id, isFinal: true });
    await sf.phases.uploadDeliverable({ ...base, name: "design.pdf", file: { body: new Uint8Array([2]), contentType: "application/pdf" } });
    await sf.phases.uploadDeliverable({ ...base, name: "other.pdf", file: { body: new Uint8Array([3]), contentType: "application/pdf" } });
    listed = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(listed.items.filter((item) => item.isFinal).length, 1);
    assert.equal(listed.items.filter((item) => item.name.toLowerCase().trim() === "design.pdf").length, 3);
    const newerDesign = listed.items.find((item) => item.name.toLowerCase().trim() === "design.pdf" && !item.isFinal)!;
    await sf.phases.setDeliverableFinal({ ...as(designer), projectId, deliverableId: newerDesign.id, isFinal: true });
    const afterNewFinal = await sf.phases.listDeliverables({ grants: ALL, projectId, phaseId: phase.id });
    assert.equal(afterNewFinal.items.filter((item) => item.name.toLowerCase().trim() === "design.pdf" && item.isFinal).length, 1, "a newer final clears the old final in its slot");
  });

  it("streams a deliverable, and refuses a stream that is short of, or over, its declared size", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id, name: "big.zip", contentType: "application/zip" };
    const streamOf = (size: number) => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(size).fill(7)); controller.close(); } });
    await sf.phases.uploadDeliverableStream({ ...base, stream: streamOf(1000), declaredBytes: 1000 });
    const stored = await testDb.prisma.sfDeliverable.findFirstOrThrow({ where: { phase_id: phase.id } });
    assert.equal(stored.file_size_bytes, 1000);
    assert.equal(storage.objects.get(stored.storage_key)?.bytes, 1000);
    const before = storage.objects.size;
    await rejectsWith(sf.phases.uploadDeliverableStream({ ...base, stream: streamOf(400), declaredBytes: 1000 }), "DELIVERABLE_INCOMPLETE");
    await rejectsWith(sf.phases.uploadDeliverableStream({ ...base, stream: streamOf(10), declaredBytes: 600 * 1024 * 1024 }), "DELIVERABLE_SIZE");
    assert.equal(storage.objects.size, before, "a refused upload leaves no stored object");
    assert.equal(await testDb.prisma.sfDeliverable.count({ where: { phase_id: phase.id } }), 1);
  });

  it("cleans expired non-finals and warns an uploader only once until extended", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.uploadDeliverable({ ...base, name: "expire.pdf", file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
    const row = await testDb.prisma.sfDeliverable.findFirstOrThrow({ where: { phase_id: phase.id } });
    await testDb.prisma.sfDeliverable.update({ where: { id: row.id }, data: { expires_at: new Date(clock.getTime() + 3 * 86_400_000) } });
    assert.equal((await sf.phases.sweepDeliverableExpiry()).warned, 1);
    assert.equal((await sf.phases.sweepDeliverableExpiry()).warned, 0);
    await sf.phases.extendDeliverableExpiry({ ...as(designer), projectId, deliverableId: row.id });
    await testDb.prisma.sfDeliverable.update({ where: { id: row.id }, data: { expires_at: new Date(clock.getTime() - 1) } });
    assert.equal((await sf.phases.sweepDeliverableExpiry()).deleted, 1);
    assert.equal(storage.objects.has(row.storage_key), false);
  });

  describe("every deliverable/MOM blob delete is tracked until it really happens (WO-SF-SAFE-03)", () => {
    const ledger = (key: string) => testDb.prisma.sfAssetCleanupFailure.findUnique({ where: { storage_key: key } });
    async function uploaded(name: string) {
      const { projectId } = await newProject(name);
      const phase = await phaseOf(projectId, "moodboard");
      await sf.phases.uploadDeliverable({ ...as(designer), projectId, phaseId: phase.id, name: `${name}.pdf`, file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
      return { projectId, phase, row: await testDb.prisma.sfDeliverable.findFirstOrThrow({ where: { phase_id: phase.id } }) };
    }
    function failingRemoves() {
      return mock.method(storage, "remove", async () => { throw new Error("disk unavailable"); });
    }
    function retry() {
      return import("./asset-cleanup").then(({ retryFailedAssetCleanup }) => retryFailedAssetCleanup(testDb.prisma, storage));
    }

    it("manual delete: success removes the blob and leaves the ledger entry resolved", async () => {
      const { projectId, row } = await uploaded("Delete ok");
      await sf.phases.deleteDeliverable({ ...as(designer), projectId, deliverableId: row.id });
      assert.equal(storage.objects.has(row.storage_key), false);
      assert.ok((await ledger(row.storage_key))?.resolved_at instanceof Date);
    });

    it("manual delete: a storage failure keeps the key pending, and a later retry resolves it", async () => {
      const { projectId, row } = await uploaded("Delete fails");
      const failing = failingRemoves();
      try { await sf.phases.deleteDeliverable({ ...as(designer), projectId, deliverableId: row.id }); } finally { failing.mock.restore(); }
      assert.equal(await testDb.prisma.sfDeliverable.count({ where: { id: row.id } }), 0, "the row is gone");
      assert.equal(storage.objects.has(row.storage_key), true, "the blob is still there");
      const pending = await ledger(row.storage_key);
      assert.equal(pending?.resolved_at, null);
      assert.equal(pending?.attempts, 1);
      const result = await retry();
      assert.equal(result.resolved >= 1, true);
      assert.equal(storage.objects.has(row.storage_key), false);
      assert.ok((await ledger(row.storage_key))?.resolved_at instanceof Date);
    });

    it("expiry sweep follows the same rule", async () => {
      const { row } = await uploaded("Expiry fails");
      await testDb.prisma.sfDeliverable.update({ where: { id: row.id }, data: { expires_at: new Date(clock.getTime() - 1) } });
      const failing = failingRemoves();
      let swept;
      try { swept = await sf.phases.sweepDeliverableExpiry(); } finally { failing.mock.restore(); }
      assert.equal(swept.deleted, 1);
      assert.equal((await ledger(row.storage_key))?.resolved_at, null);
      await retry();
      assert.equal(storage.objects.has(row.storage_key), false);
    });

    it("never removes a key another row still points at", async () => {
      const { projectId, phase, row } = await uploaded("Shared key");
      const twin = await testDb.prisma.sfDeliverable.create({ data: { project_id: projectId, phase_id: phase.id, name: "Twin", storage_key: row.storage_key } });
      await sf.phases.deleteDeliverable({ ...as(designer), projectId, deliverableId: row.id });
      assert.equal(storage.objects.has(row.storage_key), true);
      assert.equal(await ledger(row.storage_key), null, "a still-referenced key is never enqueued");
      await testDb.prisma.sfDeliverable.delete({ where: { id: twin.id } });
    });

    it("MOM image delete records a storage failure for retry", async () => {
      const { projectId } = await newProject("MOM image failure");
      const { documentId } = await sf.mom.createDocument({ ...as(designer), projectId, topic: "Site visit" });
      const item = await testDb.prisma.sfMomItem.findFirstOrThrow({ where: { document_id: documentId } });
      const key = `${projectId}/mom-image`;
      await storage.put({ key, body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
      const image = await testDb.prisma.sfMomImage.create({ data: { item_id: item.id, slot: 0, storage_key: key, content_type: "image/png", bytes: 1 } });
      const failing = failingRemoves();
      try { await sf.mom.deleteImage({ ...as(designer), projectId, imageId: image.id }); } finally { failing.mock.restore(); }
      assert.equal((await ledger(key))?.resolved_at, null);
      await retry();
      assert.equal(storage.objects.has(key), false);
    });
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

  it("keeps the opening date when other project fields are edited", async () => {
    const { projectId } = await newProject();
    await sf.projects.updateProject({ ...as(designer), projectId, openingDate: "2026-12-01" });
    await sf.projects.updateProject({ ...as(designer), projectId, address: "Somewhere" });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).openingDate, "2026-12-01");
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
    assert.deepEqual(await revisions(phases[0].id), ["Moodboard 1:NOT_SENT"]);
    const listed = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(listed[0].activeRevision, "MB1");
  });

  it("bootstraps a six-phase template with arbitrary names", async () => {
    const { ids } = await seedTemplate("Studio flow", SIX_PHASES);
    const { projectId } = await newProject();
    const phases = await phasesOf(projectId);
    assert.deepEqual(phases.map((p) => p.name_snapshot), SIX_PHASES.map((d) => d.name));
    assert.deepEqual(phases.map((p) => p.prefix_snapshot), SIX_PHASES.map((d) => d.prefix));
    assert.deepEqual(phases.map((p) => p.definition_id), ids);
    assert.deepEqual(phases.map((p) => p.status), ["ACTIVE", "PENDING", "PENDING", "PENDING", "PENDING", "PENDING"]);
    assert.equal(phases[3].seat_snapshot, "drafter");
    const listed = await sf.phases.listProjectPhases({ grants: ALL, projectId });
    assert.equal(listed[0].activeRevision, "CN1");
  });

  it("runs a custom phase through the iteration lifecycle with its own prefix", async () => {
    await seedTemplate("Studio flow", SIX_PHASES);
    const { projectId } = await newProject();
    const [concept, planning, , documentation] = await phasesOf(projectId);
    const detail = (phaseId: string) => sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId });
    const run = { ...as(designer), projectId };

    const first = await openIteration(concept.id);
    assert.deepEqual((await detail(concept.id)).currentIteration?.choices, ["send"]);
    await sf.phases.sendIteration({ ...run, phaseId: concept.id, iterationId: first.id });
    assert.deepEqual((await detail(concept.id)).currentIteration?.choices, ["record_answer"], "the client answer comes before any outcome");
    await sf.phases.recordClientAnswer({ ...run, phaseId: concept.id, iterationId: first.id });
    assert.deepEqual((await detail(concept.id)).currentIteration?.choices, ["revision", "done"]);
    const revised = await sf.phases.chooseIterationOutcome({ ...run, phaseId: concept.id, iterationId: first.id, outcome: "REVISION" });
    assert.ok("nextIterationId" in revised);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: revised.nextIterationId } })).name, "Concept 2");
    await clientRound({ ...run, phaseId: concept.id }, "DONE");
    assert.equal((await detail(concept.id)).status, "DONE");

    // Finishing Concept starts the next phase with its first iteration.
    assert.equal((await detail(planning.id)).activeRevision?.label, "PL1");
    await sf.phases.sendIteration({ ...run, phaseId: planning.id, iterationId: (await openIteration(planning.id)).id });
    assert.equal((await detail(planning.id)).activeRevision?.state, "SENT", "the iteration is with the client while the phase stays active");

    await sf.phases.bypassPhase({ ...run, phaseId: documentation.id, reason: "Not needed" });
    assert.equal((await detail(documentation.id)).status, "DONE");

    const again = await sf.phases.addIteration({ ...run, phaseId: concept.id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: again.iterationId } })).name, "Concept 3");
  });

  it("gives site visits only to the legacy Supervision definition", async () => {
    const custom = await seedTemplate("Custom", [{ name: "Concept", prefix: "CN" }, { name: "Supervision", prefix: "SV" }]);
    const customProject = await newProject("Custom named Supervision");
    const [conceptPhase, namedSupervision] = await phasesOf(customProject.projectId);
    const run = { ...as(designer), projectId: customProject.projectId };
    await clientRound({ ...run, phaseId: conceptPhase.id }, "DONE");
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId: customProject.projectId, phaseId: namedSupervision.id });
    assert.equal(detail.isSupervision, false, "a custom phase called Supervision is an ordinary phase");
    assert.deepEqual(detail.currentIteration?.choices, ["send"]);
    await rejectsWith(sf.phases.createSupervisionVisit({ ...run, phaseId: namedSupervision.id, visitDate: "2026-09-20" }), "PHASE_INVALID_STATE");
    assert.equal(custom.ids.includes(namedSupervision.definition_id), true);

    // Back to the standard template: the migrated Supervision runs on visits.
    await sf.phases.updatePhaseTemplate({ ...as(designer), templateId: (await testDb.prisma.sfPhaseTemplate.findFirstOrThrow({ where: { name: "Standard" } })).id, isDefault: true });
    const standard = await newProject("Standard supervision");
    const supervision = await phaseOf(standard.projectId, "supervision");
    // Supervision only cares about its immediate predecessor CD, so Moodboard's state is irrelevant here.
    for (const key of ["layout", "design3d", "cd"] as const) {
      await sf.phases.bypassPhase({ ...as(designer), projectId: standard.projectId, phaseId: (await phaseOf(standard.projectId, key)).id, reason: "Skip" });
    }
    const visit = await sf.phases.createSupervisionVisit({ ...as(designer), projectId: standard.projectId, phaseId: supervision.id, visitDate: "2026-09-20" });
    const visitDetail = await sf.phases.getPhaseDetail({ grants: ALL, projectId: standard.projectId, phaseId: supervision.id });
    assert.equal(visitDetail.isSupervision, true);
    assert.deepEqual(visitDetail.currentIteration?.choices, ["next_visit", "done"]);
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId: standard.projectId, phaseId: supervision.id, iterationId: visit.iterationId, outcome: "DONE" });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId: standard.projectId })).status, "ACTIVE");
  });

  it("does not complete the project when the last custom phase is finished", async () => {
    await seedTemplate("Two phases", [{ name: "Concept", prefix: "CN" }, { name: "Handover", prefix: "HO" }]);
    const { projectId } = await newProject();
    const [concept, handover] = await phasesOf(projectId);
    const run = { ...as(designer), projectId };
    await clientRound({ ...run, phaseId: concept.id }, "DONE");
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE");
    await clientRound({ ...run, phaseId: handover.id }, "DONE");
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE");

    // Another iteration on a finished phase stays phase-local; project completion is an explicit command.
    await sf.phases.addIteration({ ...run, phaseId: handover.id });
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE");
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: handover.id })).status, "ACTIVE");
  });

  it("keeps a visit's notes on the visit when the last Supervision visit closes the phase", async () => {
    const { projectId } = await newProject();
    // Supervision only needs CD done; Moodboard stays in progress.
    for (const key of ["layout", "design3d", "cd"] as const) {
      await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: (await phaseOf(projectId, key)).id, reason: "Skip" });
    }
    const supervision = await phaseOf(projectId, "supervision");
    const base = { ...as(designer), projectId, phaseId: supervision.id };
    const visit = await sf.phases.createSupervisionVisit({ ...base, visitDate: "2026-09-20", note: "Ceiling height checked" });
    await sf.phases.setIterationNote({ ...base, iterationId: visit.iterationId, note: "Ceiling height checked\n- Lighting points moved 20 cm" });

    await sf.phases.chooseSupervisionVisit({ ...base, iterationId: visit.iterationId, outcome: "DONE" });

    const closed = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: visit.iterationId } });
    assert.equal(closed.status, "DONE");
    assert.equal(closed.note, "Ceiling height checked\n- Lighting points moved 20 cm", "the visit keeps its notes after the phase closes");
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { phase_id: supervision.id } }), 0, "closing a visit adds nothing to the requirements");
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
    assert.equal((await sf.phases.listProjectPhases({ grants: ALL, projectId }))[0].activeRevision, "MB1");

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

describe("Sample-request read contract (StudioFlow public)", () => {
  async function requestFixture(name: string, requestedAt: string, status: "REQUESTED" | "RECEIVED" = "REQUESTED", archived = false) {
    const db = testDb.prisma;
    const { projectId } = await newProject(name);
    const entry = await db.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Floor", category_key: "floor", prefix: "FL", increment: 1, sort_order: 0 } });
    const option = await db.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", product_name: `Product ${name}`, brand_name: "Brand", color: "Oak", finishing: "Matte", dimension: "120x20", search_key: name.toLowerCase(), image_key: `secret/${name}.png` } });
    const request = await db.sfScheduleSampleRequest.create({ data: { option_id: option.id, requested_from: "Vendor X", note: "Bring a swatch", status, requested_by_id: designer.id, requested_by_name: "Dina Designer", requested_at: new Date(requestedAt), received_at: status === "RECEIVED" ? new Date(requestedAt) : null } });
    if (archived) await db.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date("2026-09-01T00:00:00Z") } });
    return { projectId, requestId: request.id, optionId: option.id };
  }

  it("lists only pending requests of live projects, oldest first, as facts with no storage details", async () => {
    const read = createStudioFlowSampleRequestRead(testDb.prisma);
    const newer = await requestFixture("Newer", "2026-09-12T03:00:00Z");
    const older = await requestFixture("Older", "2026-09-10T03:00:00Z");
    await requestFixture("Received", "2026-09-09T03:00:00Z", "RECEIVED");
    await requestFixture("Archived", "2026-09-08T03:00:00Z", "REQUESTED", true);

    const rows = await read.listPendingSampleRequests();
    assert.deepEqual(rows.map((row) => row.id), [older.requestId, newer.requestId]);
    const [first] = rows;
    assert.deepEqual(Object.keys(first).sort(), ["id", "note", "option", "project", "receivedAt", "requestedAt", "requestedBy", "requestedFrom", "status"]);
    assert.deepEqual(Object.keys(first.option).sort(), ["brandName", "color", "dimension", "finishing", "id", "pattern", "productName"]);
    assert.equal(first.project.name.includes("Older"), true);
    assert.equal(first.project.archived, false);
    assert.deepEqual(first.requestedBy, { id: designer.id, name: "Dina Designer" });
    assert.equal(first.option.productName, "Product Older");
    assert.equal(JSON.stringify(rows).includes("secret/"), false, "no storage key leaves StudioFlow");
  });

  it("caps the list and falls back to the default for an unusable limit", async () => {
    const read = createStudioFlowSampleRequestRead(testDb.prisma);
    await requestFixture("One", "2026-09-10T03:00:00Z");
    await requestFixture("Two", "2026-09-11T03:00:00Z");
    assert.equal((await read.listPendingSampleRequests({ limit: 1 })).length, 1);
    for (const limit of [0, -3, Number.NaN]) assert.equal((await read.listPendingSampleRequests({ limit })).length, 2, `limit ${limit}`);
    assert.equal((await read.listPendingSampleRequests({ limit: 10_000 })).length, 2);
  });

  it("returns specific requests in any state, flags archived projects, and ignores unknown or repeated ids", async () => {
    const read = createStudioFlowSampleRequestRead(testDb.prisma);
    const live = await requestFixture("Live", "2026-09-10T03:00:00Z");
    const received = await requestFixture("Done", "2026-09-11T03:00:00Z", "RECEIVED");
    const archived = await requestFixture("Old", "2026-09-12T03:00:00Z", "REQUESTED", true);
    const rows = await read.getSampleRequests([live.requestId, received.requestId, archived.requestId, live.requestId, "not-a-real-id"]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    assert.equal(rows.length, 3);
    assert.equal(byId.get(live.requestId)?.status, "REQUESTED");
    assert.equal(byId.get(received.requestId)?.status, "RECEIVED");
    assert.ok(byId.get(received.requestId)?.receivedAt instanceof Date);
    assert.equal(byId.get(archived.requestId)?.project.archived, true);
    assert.deepEqual(await read.getSampleRequests([]), []);
  });
});

describe("Sample receipt from the Master Data shelf (StudioFlow public command)", () => {
  function commandWith() {
    const db = testDb.prisma;
    return createStudioFlowSampleRequestCommand(db, {
      runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(),
      people: createPeopleDirectory(db),
      storage,
      masterData: createMasterDataPublicRead(db),
      now: () => clock,
    });
  }
  async function pendingRequest(name: string) {
    const { projectId } = await newProject(name);
    const { entryId } = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: `Shelf paint ${name}` } });
    const entry = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!;
    const { requestId } = await sf.schedule.requestSample({ ...as(designer), projectId, optionId: entry.options[0].id, requestedFrom: "Toko Cat" });
    return { projectId, requestId, optionId: entry.options[0].id, entryId };
  }

  it("marks a requested sample received with the shelf note, the staff member and the app clock, and audits it as coming from Master Data", async () => {
    const staff = await seedUser("Sari Shelf", []);
    const { projectId, requestId, optionId, entryId } = await pendingRequest("Receipt A");
    clock = new Date("2026-09-20T08:30:00Z");
    assert.deepEqual(await commandWith().markSampleReceivedFromShelf({ actor: staff.actor, requestId, rack: "A1", box: "B2" }), { updated: true });
    const row = await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: requestId } });
    assert.deepEqual([row.status, row.received_by_id, row.received_by_name, row.received_note, row.received_at?.toISOString()], ["RECEIVED", staff.id, "Sari Shelf", "On the shelf: A1 / B2 (Master Data)", "2026-09-20T08:30:00.000Z"]);
    const events = await testDb.prisma.auditEvent.findMany({ where: { action: "studioflow.schedule.sample-received", entity_id: optionId } });
    assert.equal(events.length, 1);
    assert.equal(events[0].actor_user_id, staff.id);
    assert.deepEqual(events[0].metadata, { via: "masterdata", projectId, entryId, label: "A" });
    const option = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((e) => e.id === entryId)!.options[0];
    assert.equal(option.sampleRequest?.status, "RECEIVED", "the designer's Schedule shows Sample received");
    assert.equal(option.sampleRequest?.receivedNote, "On the shelf: A1 / B2 (Master Data)");
  });

  it("writes nothing when the request is already received (and a repeat is harmless)", async () => {
    const staff = await seedUser("Sari Shelf", []);
    const { requestId, optionId } = await pendingRequest("Receipt B");
    await sf.schedule.receiveSample({ ...as(designer), projectId: (await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: requestId }, include: { option: { include: { entry: true } } } })).option.entry.project_id, requestId, note: "Designer got it" });
    const before = await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: requestId } });
    assert.deepEqual(await commandWith().markSampleReceivedFromShelf({ actor: staff.actor, requestId, rack: "A1", box: "B2" }), { updated: false, reason: "ALREADY_RECEIVED" });
    assert.deepEqual(await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: requestId } }), before);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.sample-received", entity_id: optionId, metadata: { path: ["via"], equals: "masterdata" } } }), 0);

    const second = await pendingRequest("Receipt B2");
    const command = commandWith();
    assert.equal((await command.markSampleReceivedFromShelf({ actor: staff.actor, requestId: second.requestId, rack: "A1", box: "B2" })).updated, true);
    assert.deepEqual(await command.markSampleReceivedFromShelf({ actor: staff.actor, requestId: second.requestId, rack: "X", box: "Y" }), { updated: false, reason: "ALREADY_RECEIVED" });
    assert.equal((await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: second.requestId } })).received_note, "On the shelf: A1 / B2 (Master Data)", "the first receipt is not rewritten");
  });

  it("writes nothing for a cancelled (deleted) request", async () => {
    const staff = await seedUser("Sari Shelf", []);
    const { projectId, requestId } = await pendingRequest("Receipt C");
    await sf.schedule.cancelSample({ ...as(designer), projectId, requestId });
    assert.deepEqual(await commandWith().markSampleReceivedFromShelf({ actor: staff.actor, requestId, rack: "A1", box: "B2" }), { updated: false, reason: "REQUEST_MISSING" });
    assert.deepEqual(await commandWith().markSampleReceivedFromShelf({ actor: staff.actor, requestId: randomUUID(), rack: "A1", box: "B2" }), { updated: false, reason: "REQUEST_MISSING" });
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.sample-received", metadata: { path: ["via"], equals: "masterdata" } } }), 0);
  });

  it("writes nothing for a request in an archived project", async () => {
    const staff = await seedUser("Sari Shelf", []);
    const { projectId, requestId } = await pendingRequest("Receipt D");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date("2026-09-01T00:00:00Z") } });
    assert.deepEqual(await commandWith().markSampleReceivedFromShelf({ actor: staff.actor, requestId, rack: "A1", box: "B2" }), { updated: false, reason: "PROJECT_ARCHIVED" });
    const row = await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: requestId } });
    assert.deepEqual([row.status, row.received_note, row.received_at], ["REQUESTED", null, null]);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.sample-received", metadata: { path: ["via"], equals: "masterdata" } } }), 0);
  });

  it("lists live projects by name for the holder picker, and leaves archived ones out", async () => {
    const { projectId: bravo } = await newProject("Bravo Project");
    const { projectId: alpha } = await newProject("Alpha Project");
    const { projectId: gone } = await newProject("Archived Project");
    await testDb.prisma.sfProject.update({ where: { id: gone }, data: { archived_at: new Date("2026-09-01T00:00:00Z") } });
    const choices = await commandWith().listProjectChoices();
    assert.deepEqual(choices, [{ id: alpha, name: "Alpha Project" }, { id: bravo, name: "Bravo Project" }]);
  });
});

describe("Sample-request notifications (StudioFlow side, real database)", () => {
  function serviceWith(people = createPeopleDirectory(testDb.prisma)) {
    const db = testDb.prisma;
    return createStudioFlowService(db, {
      runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(),
      people: createPeopleDirectory(db),
      storage,
      masterData: createMasterDataPublicRead(db),
      now: () => clock,
      sampleRequestNotifier: createSampleRequestNotifier({ writer: createNotificationWriter(), people }),
    });
  }
  async function optionFixture(name: string) {
    const db = testDb.prisma;
    const { projectId } = await newProject(name);
    const entry = await db.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Floor", category_key: "floor", prefix: "FL", increment: 1, sort_order: 0 } });
    const option = await db.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", product_name: "Oak Panel", search_key: "oak", brand_name: "Brand" } });
    return { projectId, optionId: option.id };
  }
  const inbox = (userId: string) => testDb.prisma.notification.findMany({ where: { recipient_user_id: userId } });

  it("tells each sample-request staff member once, and not the requester, a non-holder, or a disabled user", async () => {
    const staffA = await seedUser("Sari Staff", [MASTERDATA_PERMISSIONS.sampleRequestManage]);
    const staffB = await seedUser("Budi Staff", [MASTERDATA_PERMISSIONS.sampleRequestManage]);
    const outsider = await seedUser("Olga Outsider", [MASTERDATA_PERMISSIONS.access]);
    const disabled = await seedUser("Dewi Disabled", [MASTERDATA_PERMISSIONS.sampleRequestManage]);
    await testDb.prisma.user.update({ where: { id: disabled.id }, data: { status: "DISABLED" } });
    const requester = await seedUser("Rina Requester", [...ALL, MASTERDATA_PERMISSIONS.sampleRequestManage]);
    const { projectId, optionId } = await optionFixture("Notify Project");

    const { requestId } = await serviceWith().schedule.requestSample({ ...as(requester), projectId, optionId, requestedFrom: "Toko Kayu" });

    for (const staff of [staffA, staffB]) {
      const items = await inbox(staff.id);
      assert.equal(items.length, 1, staff.actor.label);
      assert.equal(items[0].kind, "studioflow.sample-request.created");
      assert.equal(items[0].app_id, "studioflow");
      assert.equal(items[0].href, "/masterdata/sample-requests");
      assert.deepEqual([items[0].entity_type, items[0].entity_id], ["sample_request", requestId]);
      assert.equal(items[0].read_at, null);
      assert.ok(items[0].body?.includes("Oak Panel") && items[0].body.includes("Toko Kayu") && items[0].body.includes("Rina Requester"));
    }
    for (const nobody of [outsider, disabled, requester]) assert.equal((await inbox(nobody.id)).length, 0, nobody.actor.label);
    assert.equal(await testDb.prisma.notification.count(), 2);
  });

  it("still creates the request, and tells nobody, when the staff lookup fails", async () => {
    await seedUser("Sari Staff", [MASTERDATA_PERMISSIONS.sampleRequestManage]);
    const { projectId, optionId } = await optionFixture("Lookup Fails");
    const broken = { ...createPeopleDirectory(testDb.prisma), async listHolders() { throw new Error("directory down"); } };
    const { requestId } = await serviceWith(broken).schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Toko Kayu" });
    assert.ok(await testDb.prisma.sfScheduleSampleRequest.findUnique({ where: { id: requestId } }));
    assert.equal(await testDb.prisma.notification.count(), 0);
  });

  it("tells nobody about a request that was refused", async () => {
    await seedUser("Sari Staff", [MASTERDATA_PERMISSIONS.sampleRequestManage]);
    const { projectId, optionId } = await optionFixture("Duplicate");
    const service = serviceWith();
    await service.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Toko Kayu" });
    assert.equal(await testDb.prisma.notification.count(), 1);
    await rejectsWith(service.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Toko Lain" }), "SAMPLE_ALREADY_REQUESTED");
    assert.equal(await testDb.prisma.notification.count(), 1, "the refused duplicate wrote no second notification");
  });
});

describe("WO-SF-ITER-01 review regressions (undo, CD chain, carry-forward, access)", () => {
  const latestEvent = (projectId: string) => testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });
  const undo = async (projectId: string) => sf.phases.undoPhaseEvent({ ...as(designer), projectId, eventId: (await latestEvent(projectId)).id });

  it("undoes an added iteration and returns the phase to not started", async () => {
    const { projectId } = await newProject("Undo add");
    const layout = await phaseOf(projectId, "layout");
    await sf.phases.addIteration({ ...as(designer), projectId, phaseId: layout.id });
    await undo(projectId);
    assert.equal(await testDb.prisma.sfRevision.count({ where: { phase_id: layout.id } }), 0);
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: layout.id } })).status, "PENDING");
  });

  it("undoing a client answer keeps the original sent date, and undo expires after five minutes", async () => {
    const { projectId } = await newProject("Undo answer");
    const mb = await phaseOf(projectId, "moodboard");
    const first = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: mb.id } });
    clock = new Date("2026-09-10T03:00:00Z");
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: mb.id, iterationId: first.id });
    clock = new Date("2026-09-10T03:02:00Z");
    await sf.phases.recordClientAnswer({ ...as(designer), projectId, phaseId: mb.id, iterationId: first.id });
    await undo(projectId);
    const after = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(after.status, "SENT");
    assert.equal(after.sent_at?.toISOString(), "2026-09-10T03:00:00.000Z");
    clock = new Date("2026-09-10T03:20:00Z");
    await rejectsWith(undo(projectId), "UNDO_EXPIRED");
  });

  it("undoes a dismissed requirement and a deleted never-sent iteration, restoring the same rows", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Undo requirement" });
    const { projectId } = await newProject("Undo dismiss");
    const mb = await phaseOf(projectId, "moodboard");
    const [requirement] = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: mb.id });
    await sf.phases.dismissRequirement({ ...as(designer), projectId, phaseId: mb.id, itemId: requirement.id });
    await undo(projectId);
    assert.equal((await testDb.prisma.sfChecklistItem.findUniqueOrThrow({ where: { id: requirement.id } })).dismissed_at, null);
    const layout = await phaseOf(projectId, "layout");
    const added = await sf.phases.addIteration({ ...as(designer), projectId, phaseId: layout.id });
    await sf.phases.deleteNeverSentIteration({ ...as(designer), projectId, phaseId: layout.id, iterationId: added.iterationId });
    await undo(projectId);
    assert.equal(await testDb.prisma.sfRevision.count({ where: { id: added.iterationId } }), 1);
  });

  it("chains CD Mall to CD Final using the migrated data shape and undoes the continuation", async () => {
    const { projectId } = await newProject("CD chain");
    const cd = await phaseOf(projectId, "cd");
    await testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.cd }, data: { default_iteration_kinds: [{ name: "CD Mall" }, { name: "CD Final" }] } });
    const mall = await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: mall.iterationId } })).name, "CD Mall");
    // The step is read from the name, so the step names are locked both ways (a renamed CD Mall could close without CD Final).
    await rejectsWith(sf.phases.renameIteration({ ...as(designer), projectId, phaseId: cd.id, iterationId: mall.iterationId, name: "CD Mall lobby" }), "ITERATION_KIND_NAME_LOCKED");
    const moodboard = await phaseOf(projectId, "moodboard");
    const moodboardIteration = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id } });
    await sf.phases.renameIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: moodboardIteration.id, name: "CD Mall" });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: moodboardIteration.id } })).name, "CD Mall", "a one-step phase has no step names to protect");
    const base = { ...as(designer), projectId, phaseId: cd.id, iterationId: mall.iterationId };
    await sf.phases.sendIteration(base);
    await sf.phases.recordClientAnswer(base);
    await rejectsWith(sf.phases.chooseIterationOutcome({ ...base, outcome: "DONE" }), "PHASE_INVALID_STATE");
    const cards = await sf.projects.listProjectCards({ grants: ALL, filter: "all" });
    assert.deepEqual(cards.find((c) => c.id === projectId)!.phases.find((p) => p.id === cd.id)!.current_iteration!.available_choices, ["revision", "continue_cd_final"]);
    const next = await sf.phases.chooseIterationOutcome({ ...base, outcome: "CONTINUE_CD_FINAL" }) as { nextIterationId: string };
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: next.nextIterationId } })).name, "CD Final");
    await undo(projectId);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: mall.iterationId } })).status, "ANSWERED");
    assert.equal(await testDb.prisma.sfRevision.count({ where: { id: next.nextIterationId } }), 0);
  });

  it("keeps the client's notes on the revised iteration, and undo of the Revision keeps them", async () => {
    const { projectId } = await newProject("Notes on revision");
    const mb = await phaseOf(projectId, "moodboard");
    const first = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: mb.id } });
    const base = { ...as(designer), projectId, phaseId: mb.id, iterationId: first.id };
    await sf.phases.sendIteration(base);
    await sf.phases.recordClientAnswer({ ...base, note: "Warmer palette" });
    await sf.phases.chooseIterationOutcome({ ...base, outcome: "REVISION" });
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { phase_id: mb.id, label: "Warmer palette" } }), 0, "notes are never copied into requirements");
    await undo(projectId);
    const back = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: first.id } });
    assert.deepEqual([back.status, back.note], ["ANSWERED", "Warmer palette"]);
    assert.equal(await testDb.prisma.sfRevision.count({ where: { phase_id: mb.id } }), 1, "the revision's new iteration is gone again");
  });

  it("limits iteration commands to the seat owner, completion to a PIC, and refuses writes on a project on hold", async () => {
    const { projectId } = await newProject("Access");
    const grants = ALL.filter((grant) => grant !== P.projectOverride);
    const outsider = await seedUser("Not a PIC", grants);
    const mb = await phaseOf(projectId, "moodboard");
    const first = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: mb.id } });
    await rejectsWith(sf.phases.markProjectCompleted({ ...as(outsider, grants), projectId }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.sendIteration({ ...as(outsider, grants), projectId, phaseId: mb.id, iterationId: first.id }), "PERMISSION_DENIED");
    await sf.projects.setProjectStatus({ ...as(designer), projectId, status: "ON_HOLD" });
    await rejectsWith(sf.phases.sendIteration({ ...as(designer), projectId, phaseId: mb.id, iterationId: first.id }), "PROJECT_NOT_ACTIVE");
  });
});

describe("WO-SF-ITER-01 screens support (Lead)", () => {
  const latestEvent = (projectId: string) => testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });

  it("keeps the sequential start rule for a phase that has not started and for supervision visits", async () => {
    const { projectId } = await newProject("Sequential start");
    const supervision = await phaseOf(projectId, "supervision");
    await rejectsWith(sf.phases.addIteration({ ...as(designer), projectId, phaseId: supervision.id }), "PHASE_SEQUENTIAL");
    await rejectsWith(sf.phases.createSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, visitDate: "2026-09-20", note: null }), "PHASE_SEQUENTIAL");
    const card = (await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((item) => item.id === projectId)!;
    const phase = card.phases.find((item) => item.id === supervision.id)!;
    assert.deepEqual([phase.can_start, phase.is_supervision, phase.seat], [false, true, "designer"]);
    const layoutId = (await phaseOf(projectId, "layout")).id;
    const layout = card.phases.find((item) => item.id === layoutId)!;
    assert.equal(layout.can_start, true, "a parallel phase may start any time");
  });

  it("offers a supervision visit only Next visit and Done (handover), and closes the phase on Done", async () => {
    const { projectId } = await newProject("Supervision choices");
    const supervision = await phaseOf(projectId, "supervision");
    await testDb.prisma.sfPhase.updateMany({ where: { project_id: projectId, id: { not: supervision.id } }, data: { status: "DONE", is_locked: true } });
    const visit = await sf.phases.createSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, visitDate: "2026-09-20", note: "Site check" });
    const card = (await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((item) => item.id === projectId)!;
    assert.deepEqual(card.phases.find((item) => item.id === supervision.id)!.current_iteration!.available_choices, ["next_visit", "done"]);
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, projectId, phaseId: supervision.id });
    assert.deepEqual(detail.currentIteration?.choices, ["next_visit", "done"]);
    assert.equal(detail.isSupervision, true);
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, iterationId: visit.iterationId, outcome: "NEXT_VISIT" });
    await sf.phases.createSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, visitDate: "2026-09-27", note: null });
    const second = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: supervision.id, status: "NOT_SENT" } });
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, iterationId: second.id, outcome: "DONE" });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: supervision.id } })).status, "DONE");
    assert.equal((await sf.projects.getProject({ grants: ALL, projectId })).status, "ACTIVE", "finishing the last phase never completes the project");
  });

  it("lets a requirement be ticked or dismissed after its phase is done, and a dismissed one disappears", async () => {
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Late requirement" });
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Dismissed requirement" });
    const { projectId } = await newProject("Requirements after done");
    const moodboard = await phaseOf(projectId, "moodboard");
    const first = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id } });
    const base = { ...as(designer), projectId, phaseId: moodboard.id };
    await sf.phases.sendIteration({ ...base, iterationId: first.id });
    await sf.phases.recordClientAnswer({ ...base, iterationId: first.id });
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: first.id, outcome: "DONE" });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: moodboard.id } })).status, "DONE");

    const items = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: moodboard.id });
    const late = items.find((item) => item.label === "Late requirement")!;
    const dismissed = items.find((item) => item.label === "Dismissed requirement")!;
    await sf.tasks.setItemChecked({ ...as(designer), projectId, itemId: late.id, checked: true });
    await sf.phases.dismissRequirement({ ...base, itemId: dismissed.id });
    const after = await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: moodboard.id });
    assert.deepEqual(after.map((item) => [item.label, item.isChecked]), [["Late requirement", true]], "the dismissed requirement is gone and the ticked one stays");
    const card = (await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((item) => item.id === projectId)!;
  });

  it("offers the latest change for undo only to the same person within five minutes, and lists phase notes", async () => {
    const { projectId } = await newProject("Undo window");
    const moodboard = await phaseOf(projectId, "moodboard");
    const first = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id } });
    clock = new Date("2026-09-10T03:00:00Z");
    assert.equal(await sf.phases.latestUndoableEvent({ grants: ALL, actor: designer.actor, projectId }), null);
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: first.id });
    const event = await latestEvent(projectId);
    const offered = await sf.phases.latestUndoableEvent({ grants: ALL, actor: designer.actor, projectId });
    assert.equal(offered?.id, event.id);
    assert.equal(await sf.phases.latestUndoableEvent({ grants: ALL, actor: drafter.actor, projectId }), null, "someone else cannot undo it");
    clock = new Date("2026-09-10T03:06:00Z");
    assert.equal(await sf.phases.latestUndoableEvent({ grants: ALL, actor: designer.actor, projectId }), null, "after five minutes it is gone");

    await sf.phases.setPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, note: "Client prefers warm tones" });
    const notes = await sf.phases.listPhaseNotes({ grants: ALL, projectId });
    assert.deepEqual(notes.filter((item) => item.note).map((item) => [item.phaseName, item.note]), [["Moodboard", "Client prefers warm tones"]]);
  });
});

describe("R8.332 logic review fixes", () => {
  it("undoing an added iteration on a finished phase leaves the phase finished and locked", async () => {
    const { projectId } = await newProject("Undo keeps lock");
    const moodboard = await phaseOf(projectId, "moodboard");
    await testDb.prisma.sfRevision.deleteMany({ where: { phase_id: moodboard.id } });
    await testDb.prisma.sfRevision.create({ data: { id: randomUUID(), phase_id: moodboard.id, major: 1, name: "Moodboard 1", status: "DONE" } });
    await testDb.prisma.sfPhase.update({ where: { id: moodboard.id }, data: { status: "DONE", is_locked: true } });
    await sf.phases.addIteration({ ...as(designer), projectId, phaseId: moodboard.id });
    const event = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId, eventId: event.id });
    const after = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: moodboard.id } });
    assert.deepEqual({ status: after.status, locked: after.is_locked }, { status: "DONE", locked: true });
  });

  it("does not let undo change a completed project", async () => {
    const { projectId } = await newProject("Undo after completion");
    const moodboard = await phaseOf(projectId, "moodboard");
    const first = await openIteration(moodboard.id);
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: first.id });
    const event = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });
    await sf.phases.markProjectCompleted({ ...as(designer), projectId, overrideReason: "Handed over early." });
    await rejectsWith(sf.phases.undoPhaseEvent({ ...as(designer), projectId, eventId: event.id }), "PROJECT_COMPLETED");
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: first.id } })).status, "SENT");
  });

  it("keeps a revised CD Mall as CD Mall so the phase still has to reach CD Final", async () => {
    const { projectId } = await newProject("CD Mall revision");
    const cd = await phaseOf(projectId, "cd");
    await testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.cd }, data: { default_iteration_kinds: [{ name: "CD Mall" }, { name: "CD Final" }] } });
    const base = { ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id };
    await sf.phases.addIteration(base);
    await clientRound(base, "REVISION");
    assert.equal((await openIteration(cd.id)).name, "CD Mall");
    const second = await openIteration(cd.id);
    await sf.phases.sendIteration({ ...base, iterationId: second.id });
    await sf.phases.recordClientAnswer({ ...base, iterationId: second.id });
    await rejectsWith(sf.phases.chooseIterationOutcome({ ...base, iterationId: second.id, outcome: "DONE" }), "PHASE_INVALID_STATE");
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: second.id, outcome: "CONTINUE_CD_FINAL" });
    assert.equal((await openIteration(cd.id)).name, "CD Final");
  });

  it("lists projects by priority, then name A to Z", async () => {
    await newProject("Beta house");
    await newProject("Alpha house");
    const urgent = await newProject("Zeta urgent");
    await sf.projects.setProjectPriority({ ...as(designer), projectId: urgent.projectId, priority: "URGENT" });
    const list = await sf.projects.listProjects({ grants: ALL });
    assert.deepEqual(list.map((project) => project.name), ["Zeta urgent", "Alpha house", "Beta house"]);
    const found = await sf.projects.quickSearch({ grants: ALL, search: "house" });
    assert.deepEqual(found.projects.map((project) => project.name), ["Alpha house", "Beta house"]);
  });
});

describe("WO-SF-PLAN-01 working-time planning from Fit Out Start", () => {
  const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
  const planned = async (projectId: string, legacy: keyof typeof LEGACY) => {
    const phase = await phaseOf(projectId, legacy);
    return { id: phase.id, start: day(phase.planned_start_date), end: day(phase.planned_end_date), manual: phase.planned_dates_manual };
  };
  const withFitOut = async (name: string, fitOutStartDate = "2026-11-02") => {
    const { projectId } = await newProject(name);
    await sf.projects.setFitOutStart({ ...as(designer), projectId, fitOutStartDate });
    return projectId;
  };

  it("fills Design 3D, Construction Drawing and Construction from Fit Out Start, and a second apply changes nothing", async () => {
    const projectId = await withFitOut("Plan basic");
    const first = await sf.projects.applyProjectPlan({ ...as(designer), projectId });
    assert.equal(first.written.length, 3);
    assert.deepEqual(first.milestones, { designFinal: "2026-10-12", cdMallStart: "2026-10-12", cdFinalStart: "2026-10-19", end: "2026-10-26", fitOutStart: "2026-11-02", handover: "2026-12-28", openingForecast: "2027-01-11" });
    assert.deepEqual(await planned(projectId, "design3d"), { id: (await phaseOf(projectId, "design3d")).id, start: null, end: "2026-10-12", manual: false });
    assert.deepEqual(await planned(projectId, "cd").then(({ start, end }) => [start, end]), ["2026-10-12", "2026-10-26"]);
    assert.deepEqual(await planned(projectId, "supervision").then(({ start, end }) => [start, end]), ["2026-11-02", "2026-12-28"]);
    assert.equal((await planned(projectId, "moodboard")).start, null);
    const again = await sf.projects.applyProjectPlan({ ...as(designer), projectId });
    assert.deepEqual([again.written.length, again.unchanged.length, again.kept.length], [0, 3, 0]);
    const read = await sf.projects.getProjectPlan({ grants: ALL, projectId });
    assert.deepEqual(read.milestones, first.milestones);
    assert.equal(read.endPlanned, "2026-10-26");
  });

  it("keeps hand-set dates, reports them as kept, and reset brings the computed dates back", async () => {
    const projectId = await withFitOut("Plan manual");
    const cd = await phaseOf(projectId, "cd");
    await sf.phases.setPhasePlannedDates({ ...as(designer), projectId, phaseId: cd.id, plannedStartDate: "2026-10-01", plannedEndDate: "2026-10-05" });
    assert.equal((await planned(projectId, "cd")).manual, true);
    const result = await sf.projects.applyProjectPlan({ ...as(designer), projectId });
    assert.deepEqual(result.kept, [cd.id]);
    assert.equal(result.written.length, 2);
    assert.deepEqual(await planned(projectId, "cd").then(({ start, end }) => [start, end]), ["2026-10-01", "2026-10-05"]);
    const reset = await sf.projects.resetPhasePlannedDates({ ...as(designer), projectId, phaseId: cd.id });
    assert.deepEqual(reset.written, [cd.id]);
    assert.deepEqual(await planned(projectId, "cd"), { id: cd.id, start: "2026-10-12", end: "2026-10-26", manual: false });
    await rejectsWith(sf.projects.resetPhasePlannedDates({ ...as(designer), projectId, phaseId: (await phaseOf(projectId, "moodboard")).id }), "PHASE_NOT_PLANNED");
  });

  it("needs a Fit Out Start and the project-manage permission", async () => {
    const { projectId } = await newProject("Plan guards");
    await rejectsWith(sf.projects.applyProjectPlan({ ...as(designer), projectId }), "FIT_OUT_START_REQUIRED");
    await sf.projects.setFitOutStart({ ...as(designer), projectId, fitOutStartDate: "2026-11-02" });
    await rejectsWith(sf.projects.applyProjectPlan({ ...as(drafter, DRAFTER_GRANTS), projectId }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.setPlanOverrides({ ...as(drafter, DRAFTER_GRANTS), projectId, overrides: { gap: 3 } }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: { gap: 0 } }), "PLAN_OVERRIDES_INVALID");
  });

  it("a project override moves only the dates that depend on that interval", async () => {
    const projectId = await withFitOut("Plan override");
    const before = (await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!;
    await sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: { cdFinal: 10 } });
    const after = await sf.projects.getProjectPlan({ grants: ALL, projectId });
    assert.equal(after.intervals.cdFinal, 10);
    assert.equal(after.intervals.cdMall, 5);
    assert.deepEqual([after.milestones!.end, after.milestones!.handover, after.milestones!.openingForecast], [before.end, before.handover, before.openingForecast]);
    assert.equal(after.milestones!.cdFinalStart, "2026-10-12");
    assert.equal(after.milestones!.designFinal, "2026-10-05");
    await sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: null });
    assert.deepEqual((await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones, before);
  });

  it("studio defaults and the holiday list change the result, and a duplicate holiday is refused", async () => {
    const projectId = await withFitOut("Plan holidays");
    await sf.projects.addHoliday({ ...as(designer), date: "2026-10-22", label: "Cuti" });
    await rejectsWith(sf.projects.addHoliday({ ...as(designer), date: "2026-10-22", label: "Again" }), "HOLIDAY_EXISTS");
    await rejectsWith(sf.projects.addHoliday({ ...as(drafter, DRAFTER_GRANTS), date: "2026-10-23", label: "No" }), "PERMISSION_DENIED");
    const held = (await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!;
    assert.deepEqual([held.cdFinalStart, held.cdMallStart], ["2026-10-16", "2026-10-09"]);
    const [holiday] = await sf.projects.listHolidays({ grants: ALL });
    await sf.projects.removeHoliday({ ...as(designer), holidayId: holiday!.id });
    assert.equal((await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!.cdFinalStart, "2026-10-19");
    await sf.projects.setPlanningDefaults({ ...as(designer), cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 20, handoverToOpening: 10 });
    assert.equal((await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!.handover, "2026-11-30");
    await rejectsWith(sf.projects.setPlanningDefaults({ ...as(designer), cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 0, handoverToOpening: 10 }), "PLANNING_DEFAULTS_INVALID");
  });

  it("warns about a late or tight opening and does not warn when it fits", async () => {
    const projectId = await withFitOut("Plan warnings");
    const warningsFor = async (opening: string | null) => {
      await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { opening_date: opening ? new Date(`${opening}T00:00:00.000Z`) : null } });
      return (await sf.projects.getProjectPlan({ grants: ALL, projectId })).warnings;
    };
    assert.deepEqual(await warningsFor("2027-02-01"), []);
    assert.equal((await warningsFor("2027-01-04")).some((w) => w.includes("late")), true);
    assert.equal((await warningsFor("2026-12-31")).some((w) => w.includes("tight")), true);
    assert.equal((await warningsFor("2027-01-11")).length, 0);
    assert.deepEqual(await warningsFor(null), []);
  });

  it("suggests a Fit Out Start from the real END of Construction Drawing without writing it", async () => {
    const { projectId } = await newProject("Plan suggestion");
    const cd = await phaseOf(projectId, "cd");
    assert.equal((await sf.projects.getProjectPlan({ grants: ALL, projectId })).suggestedFitOutStart, null);
    await testDb.prisma.sfPhase.update({ where: { id: cd.id }, data: { status: "DONE", status_changed_at: new Date("2026-10-20T04:00:00Z") } });
    const read = await sf.projects.getProjectPlan({ grants: ALL, projectId });
    assert.equal(read.endActual, "2026-10-20");
    assert.equal(read.suggestedFitOutStart, "2026-10-27");
    assert.equal((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: projectId } })).fit_out_start_date, null);
  });

});
