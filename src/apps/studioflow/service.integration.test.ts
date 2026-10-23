import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { DEFAULT_SCHEDULE_MATERIAL_CATEGORIES, normalizeScheduleCategory } from "./domain/schedule";
import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { createStudioFlowService, type StudioFlowService } from "./service";
import { readBlockerCounts, readBlockerCountsBatch } from "./phases/blocker-query";
import { fullBlockers } from "./domain/blockers";
import { createAssetRetentionService } from "./projects/asset-retention";
import { createStudioFlowSampleRequestRead } from "./public/sample-request-read";
import { createStudioFlowSampleRequestCommand } from "./public/sample-request-command";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import type { StudioFlowPorts } from "./shared";
import { createIdeaService, type IdeasService } from "@/apps/ideas/public/service";
import { createStudioFlowIdeasBridge } from "./public/ideas-bridge";
import { createPresentationService, type PresentationService } from "@/apps/presentation/public/service";
import { createStudioFlowPresentationBridge } from "./public/presentation-bridge";

const ALL = [...Object.values(P)];
/** ALL holds project.manage, so detail reads are manager reads whatever the actor id. */
const MANAGER_READER = "manager-reader";
const DRAFTER_GRANTS = [P.access, P.projectRead, P.phaseWork, P.taskManage, P.projectPicDrafter, P.ideasManage];

let testDb: TestDb;
let sf: StudioFlowService;
let ideas: IdeasService;
let presentation: PresentationService;
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

async function noteVersion(cardId: string) {
  return (await testDb.prisma.sfWorkspaceCard.findUnique({ where: { id: cardId }, select: { version: true } }))?.version ?? 1;
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
  const defs: Array<{ id: string; name: string; prefix: string; orderIndex: number; allowParallel: boolean; seat: string; iterationKinds?: Array<{ name: string }> }> = [
    { id: LEGACY.moodboard, name: "Moodboard", prefix: "MB", orderIndex: 1, allowParallel: false, seat: "designer" },
    { id: LEGACY.layout, name: "Layout Plan", prefix: "L", orderIndex: 2, allowParallel: true, seat: "designer" },
    { id: LEGACY.design3d, name: "Design 3D", prefix: "D", orderIndex: 3, allowParallel: true, seat: "designer" },
    { id: LEGACY.cd, name: "Construction Drawing", prefix: "CD", orderIndex: 4, allowParallel: true, seat: "drafter", iterationKinds: [{ name: "CD Mall" }, { name: "CD Final" }] },
    { id: LEGACY.supervision, name: "Supervision", prefix: "SV", orderIndex: 5, allowParallel: false, seat: "designer" },
  ];
  for (const d of defs) {
    await db.sfPhaseDefinition.create({ data: { id: d.id, template_id: template.id, name: d.name, prefix: d.prefix, order_index: d.orderIndex, allow_parallel: d.allowParallel, seat: d.seat, default_iteration_kinds: d.iterationKinds } });
  }
}

async function reset() {
  await testDb.pool.query(`TRUNCATE TABLE ${[
    "sf_schedule_option", "sf_schedule_entry", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix",
    "sf_mom_image", "sf_mom_item", "sf_mom_document",
    "sf_checklist_item", "sf_checklist_template",
    "sf_deliverable", "sf_workspace_card", "sf_workspace_section", "sf_asset_cleanup_failure",
    "sf_activity", "sf_revision", "sf_phase",
    "sf_phase_definition", "sf_phase_template",
    "sf_external_schedule_placement", "sf_project", "sf_client", "sf_settings", "sf_holiday",
  ].map((t) => `"studioflow"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await testDb.pool.query('TRUNCATE TABLE "ideas"."sf_idea_usage", "ideas"."sf_idea_card", "ideas"."asset_cleanup_failure" RESTART IDENTITY CASCADE');
  await testDb.pool.query('TRUNCATE TABLE "presentation"."sf_presentation_annotation", "presentation"."sf_presentation_slide_image", "presentation"."sf_presentation_slide", "presentation"."sf_presentation_board", "presentation"."asset_cleanup_failure" RESTART IDENTITY CASCADE');
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
  const ports: StudioFlowPorts = {
    runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
    auditWriter: createAuditEventWriter(),
    people: createPeopleDirectory(db),
    storage,
    notificationWriter: createNotificationWriter(),
    masterData: createMasterDataPublicRead(db),
    now: () => clock,
  };
  sf = createStudioFlowService(db, ports);
  presentation = createPresentationService(db, { runTransaction: ports.runTransaction, auditWriter: ports.auditWriter, storage, studioFlow: createStudioFlowPresentationBridge(db) });
  ideas = createIdeaService(db, { runTransaction: ports.runTransaction, auditWriter: ports.auditWriter, storage, studioFlow: createStudioFlowIdeasBridge(db, ports) });
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
    const { noteId } = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, body: "Confirm palette" });
    await sf.workspace.setWorkspaceCardFlags({ ...as(designer), projectId, cardId: noteId, pinned: true, version: await noteVersion(noteId) });
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

  it("countWaitingOnYou equals the Home stats number for every kind of caller", async () => {
    const same = async (grants: readonly string[], actorId: string) => {
      const stats = await sf.projects.getHomeStats({ grants, filter: "mine", actorId });
      assert.equal(await sf.projects.countWaitingOnYou({ grants, actorId }), stats.waitingOnYou);
      return stats.waitingOnYou;
    };
    const noWork = ALL.filter((grant) => grant !== P.phaseWork);
    const override = [...ALL, P.projectOverride];
    assert.equal(await same(ALL, designer.id), 0, "nothing answered yet");
    const { projectId } = await newProject("Count equals stats");
    const moodboard = await phaseOf(projectId, "moodboard");
    const round = await openIteration(moodboard.id);
    await sf.phases.sendIteration({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: round.id });
    assert.equal(await same(ALL, designer.id), 0, "sent but not answered");
    await sf.phases.recordClientAnswer({ ...as(designer), projectId, phaseId: moodboard.id, iterationId: round.id, note: "Warmer" });
    assert.equal(await same(ALL, designer.id), 1, "answered, held by the caller");
    assert.equal(await same(DRAFTER_GRANTS, drafter.id), 0, "answered, held by someone else");
    assert.equal(await same(noWork, designer.id), 0, "caller may not work phases");
    assert.equal(await same(override, designer.id), 1, "caller with override");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date(), archive_reason: "test" } });
    assert.equal(await same(ALL, designer.id), 0, "archived project");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: null, status: "COMPLETED" } });
    assert.equal(await same(ALL, designer.id), 0, "completed project");
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
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id })).skippedReason, "Client supplied the concept");
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
      { phase: restored.phase_id, major: restored.major, name: restored.name, status: restored.status },
      { phase: open.phase_id, major: open.major, name: open.name, status: "NOT_SENT" },
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
  it("lets only the assigned Drafter manage sorted drawing items while the Designer reads", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    const first = await sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, drawingCode: "ARS_301", drawingName: "Ceiling plan", assignedToId: drafter.id });
    const second = await sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, drawingCode: "12", drawingName: "Key plan" });
    const third = await sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, drawingCode: "plan-a", drawingName: "Legend" });
    const listed = await sf.cdList.list({ grants: [P.access, P.projectRead], actorId: designer.id, projectId, phaseId: cd.id });
    assert.deepEqual(listed.map((item) => [item.drawingCode, item.group]), [["ID_12", "0"], ["ID_301", "300"], ["ID_PLAN-A", "-"]]);

    const updated = await sf.cdList.update({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, itemId: first.id, drawingCode: "id-12.5", drawingName: "Ceiling reflected plan", assignedToId: null });
    await rejectsWith(sf.cdList.setStatus({ ...as(designer), projectId, phaseId: cd.id, itemId: updated.id, status: SfCdItemStatus.COMPLETED }), "PERMISSION_DENIED");
    await sf.cdList.setStatus({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, itemId: updated.id, status: SfCdItemStatus.COMPLETED });
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
    const unassignedGrants = [P.access, P.projectRead, P.phaseWork, P.projectPicDesigner];
    const outsider = await seedUser("CD outsider", unassignedGrants);
    const viewer = await seedUser("CD viewer", [P.access, P.projectRead]);
    const ineligible = await seedUser("CD ineligible", [P.access, P.projectRead]);

    await rejectsWith(sf.cdList.create({ ...as(outsider, unassignedGrants), projectId, phaseId: cd.id, drawingCode: "1", drawingName: "Denied" }), "PERMISSION_DENIED");
    await rejectsWith(sf.cdList.list({ grants: unassignedGrants, actorId: outsider.id, projectId, phaseId: cd.id }), "PERMISSION_DENIED");
    await rejectsWith(sf.cdList.list({ grants: [P.access, P.projectRead], actorId: designer.id, projectId, phaseId: moodboard.id }), "CD_LIST_WRONG_PHASE");
    await rejectsWith(sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, drawingCode: "1", drawingName: "Wrong phase" }), "CD_LIST_WRONG_PHASE");
    await rejectsWith(sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, drawingCode: "1", drawingName: "Invalid assignee", assignedToId: ineligible.id }), "CD_ASSIGNEE_NOT_ELIGIBLE");

    const item = await sf.cdList.create({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, drawingCode: "1", drawingName: "Section" });
    await testDb.prisma.sfPhase.update({ where: { id: cd.id }, data: { is_locked: true } });
    await rejectsWith(sf.cdList.update({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, itemId: item.id, drawingName: "Locked" }), "PHASE_LOCKED");
    await testDb.prisma.sfPhase.update({ where: { id: cd.id }, data: { is_locked: false } });
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date() } });
    await rejectsWith(sf.cdList.delete({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, itemId: item.id }), "PROJECT_ARCHIVED");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: null } });
    await testDb.prisma.sfProject.delete({ where: { id: projectId } });
    assert.equal(await testDb.prisma.sfCdItem.count({ where: { id: item.id } }), 0);
    assert.ok(viewer.id);
  });
});

describe("WO-BE-02 archived asset retention", () => {
  afterEach(() => storage.objects.clear());
  /** Core-only retention tests: no optional module holds data for these projects. */
  const noModules = async () => ({ presentationSlides: 0 });

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
    const keys = { deliverable: `${projectId}/deliverable`, iteration: `${projectId}/iteration`, mom: `${projectId}/mom`, oldMom: `${projectId}/old-mom`, option: `${projectId}/option` };
    for (const key of Object.values(keys)) await storage.put({ key, body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    await db.sfDeliverable.create({ data: { project_id: projectId, phase_id: phase.id, name: "Private file", storage_key: keys.deliverable } });
    const section = await db.sfWorkspaceSection.create({ data: { project_id: projectId, title: "Notes", sort_order: 0, created_by_id: designer.id } });
    const iterationId = (await openIteration(phase.id)).id;
    await db.sfWorkspaceCard.create({ data: { project_id: projectId, section_id: section.id, sort_order: 0, phase_id: phase.id, iteration_id: iterationId, body: "Keep this note text" } });
    await db.sfWorkspaceCard.create({ data: { project_id: projectId, section_id: section.id, sort_order: 1, phase_id: phase.id, iteration_id: iterationId, kind: "IMAGE", storage_key: keys.iteration, content_type: "image/png", bytes: 1, uploaded_by_id: designer.id, uploaded_by_name: "Designer" } });
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
    const result = await retention().purgeExpiredArchivedAssets({}, noModules);
    assert.deepEqual(result, { projectsPurged: 1, deliverables: 1, iterationImages: 1, momImages: 1, momSnapshotImages: 2, optionPhotos: 1, presentationSlides: 0, blobsRemoved: 5, blobsKeptShared: 0, blobFailures: 0, unparseableRevisions: 0, previousFailuresResolved: 0, previousFailuresStillFailing: 0 });
    for (const key of Object.values(expired.keys)) assert.equal(storage.objects.has(key), false);
    for (const kept of [inside, boundary, live]) {
      for (const key of Object.values(kept.keys)) assert.ok(storage.objects.has(key));
      assert.equal((await db.sfProject.findUniqueOrThrow({ where: { id: kept.projectId } })).assets_purged_at, null);
    }
    assert.ok(storage.objects.has("client-logo")); assert.ok(storage.objects.has("template-photo"));
    assert.equal(await db.sfDeliverable.count({ where: { project_id: expired.projectId } }), 0);
    assert.equal(await db.sfWorkspaceCard.count({ where: { project_id: expired.projectId, storage_key: { not: null } } }), 0);
    assert.equal(await db.sfWorkspaceCard.count({ where: { project_id: expired.projectId, body: "Keep this note text" } }), 1);
    assert.equal(await db.sfMomImage.count({ where: { item: { document_id: expired.documentId } } }), 0);
    assert.equal((await db.sfScheduleOption.findFirstOrThrow({ where: { entry_id: expired.entryId } })).image_key, null);
    const revision = await db.sfMomRevision.findUniqueOrThrow({ where: { id: expired.revision.id } });
    const original = expired.revision.snapshot as { items: Array<Record<string, unknown>> };
    assert.deepEqual(revision, { ...expired.revision, snapshot: { ...original, items: original.items.map((item) => ({ ...item, images: [] })) } });
    const events = await db.auditEvent.findMany({ where: { entity_id: expired.projectId, action: { startsWith: "studioflow.project.assets_" } }, orderBy: { occurred_at: "asc" } });
    assert.deepEqual(events.map((event) => event.action), ["studioflow.project.assets_purged", "studioflow.project.assets_purge_completed"]);
    assert.ok(events.every((event) => event.actor_kind === "SYSTEM"));
    assert.deepEqual(events[0].metadata, { projectId: expired.projectId, deliverables: 1, iterationImages: 1, momImages: 1, momSnapshotImages: 2, optionPhotos: 1, unparseableRevisions: 0, keysCollected: 5 });
    assert.deepEqual(events[1].metadata, { projectId: expired.projectId, blobsRemoved: 5, blobsKeptShared: 0, blobFailures: 0 });
    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0);
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
    const slide = await db.sfPresentationSlide.create({ data: { board_id: board.id, sort_order: 0, images: { create: { slot: 0, image_key: slideKey } } } });
    const result = await retention().purgeExpiredArchivedAssets({}, (projectId) => presentation.purgeArchivedProjectAssets(projectId));
    assert.equal(result.projectsPurged, 1);
    assert.equal(result.presentationSlides, 1);
    assert.equal(storage.objects.has(slideKey), false, "the slide's image is removed once unreferenced");
    assert.equal(await db.sfPresentationSlide.count({ where: { id: slide.id } }), 0, "the slide row itself is deleted, not just its image key");
    assert.equal(await db.sfPresentationBoard.count({ where: { id: board.id } }), 1, "the board itself is kept; only its slides are purged");
  });

  async function presentationSlide(projectId: string) {
    const db = testDb.prisma;
    const board = await db.sfPresentationBoard.create({ data: { project_id: projectId, title: "Board", sort_order: 0, created_by_id: designer.id } });
    const key = `${projectId}/slide`;
    await storage.put({ key, body: new Uint8Array([1]), bytes: 1, contentType: "image/png" });
    const slide = await db.sfPresentationSlide.create({ data: { board_id: board.id, sort_order: 0, images: { create: { slot: 0, image_key: key } } } });
    return { slideId: slide.id, key };
  }

  it("keeps the Presentation slides of a project restored while the batch is running", async () => {
    const db = testDb.prisma;
    const first = await fixture("Purged first", 92);
    const restored = await fixture("Restored meanwhile", 91);
    const firstSlide = await presentationSlide(first.projectId);
    const restoredSlide = await presentationSlide(restored.projectId);
    const result = await retention().purgeExpiredArchivedAssets({}, async (projectId) => {
      // A user restores the second project while the first one is being cleaned up.
      if (projectId === first.projectId) await db.sfProject.update({ where: { id: restored.projectId }, data: { archived_at: null } });
      return presentation.purgeArchivedProjectAssets(projectId);
    });
    assert.equal(result.projectsPurged, 1);
    assert.equal(result.presentationSlides, 1);
    assert.equal(await db.sfPresentationSlide.count({ where: { id: firstSlide.slideId } }), 0);
    assert.equal(await db.sfPresentationSlide.count({ where: { id: restoredSlide.slideId } }), 1, "the restored project keeps its slide row");
    assert.equal(storage.objects.has(restoredSlide.key), true, "and its image");
    assert.equal((await db.sfProject.findUniqueOrThrow({ where: { id: restored.projectId } })).assets_purged_at, null);
  });

  it("leaves the project eligible and untouched when the Presentation hook fails, then purges it on the next run", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Hook fails once", 91);
    const slide = await presentationSlide(expired.projectId);
    await assert.rejects(retention().purgeExpiredArchivedAssets({}, async () => { throw new Error("presentation unavailable"); }));
    assert.equal((await db.sfProject.findUniqueOrThrow({ where: { id: expired.projectId } })).assets_purged_at, null);
    assert.equal(await db.sfPresentationSlide.count({ where: { id: slide.slideId } }), 1);
    assert.equal(storage.objects.has(expired.keys.deliverable), true, "core assets are not touched either");
    const result = await retention().purgeExpiredArchivedAssets({}, (projectId) => presentation.purgeArchivedProjectAssets(projectId));
    assert.equal(result.projectsPurged, 1);
    assert.equal(result.presentationSlides, 1);
    assert.notEqual((await db.sfProject.findUniqueOrThrow({ where: { id: expired.projectId } })).assets_purged_at, null);
    assert.equal(storage.objects.has(slide.key), false);
  });

  it("retries a delete that failed in an earlier run before starting new work, instead of losing the key", async () => {
    const db = testDb.prisma;
    const expired = await fixture("Flaky delete", 91);
    const flakyKey = expired.keys.deliverable;
    let failNext = true;
    const flaky: ObjectStorage = {
      put: (input) => storage.put(input),
      putStream: (input) => storage.putStream(input),
      copy: (input) => storage.copy(input),
      createSignedReadUrl: (key, expiresIn) => storage.createSignedReadUrl(key, expiresIn),
      async remove(key: string) {
        if (key === flakyKey && failNext) { failNext = false; throw new Error("disk unavailable"); }
        return storage.remove(key);
      },
    };

    const first = await retention({ storage: flaky }).purgeExpiredArchivedAssets({}, noModules);
    assert.equal(first.blobFailures, 1);
    assert.equal(first.previousFailuresResolved, 0);
    assert.ok(storage.objects.has(flakyKey), "the failed delete left the object in place, not silently dropped");
    const failure = await db.sfAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: flakyKey } });
    assert.equal(failure.resolved_at, null);
    assert.equal(failure.attempts, 1);

    const second = await retention().purgeExpiredArchivedAssets({}, noModules);
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
    const result = await retention().purgeExpiredArchivedAssets({}, noModules);
    assert.equal(result.blobsKeptShared, 3); assert.equal(result.blobsRemoved, 2); assert.equal(result.unparseableRevisions, 1);
    for (const key of [expired.keys.option, expired.keys.deliverable, expired.keys.mom]) assert.ok(storage.objects.has(key));
    assert.deepEqual((await db.sfMomRevision.findFirstOrThrow({ where: { document_id: expired.documentId, number: 2 } })).snapshot, malformed);
    assert.deepEqual((await db.sfMomRevision.findUniqueOrThrow({ where: { id: legacyRow.id } })).snapshot, legacy);
  });

  it("validates settings and permissions, respects changed retention and oldest-first limits", async () => {
    assert.equal((await sf.projects.getStudioSettings({ grants: ALL })).archiveRetentionDays, 90);
    for (const archiveRetentionDays of [6, 731, 7.5, NaN]) await rejectsWith(sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays }), "ARCHIVE_RETENTION_INVALID");
    await rejectsWith(sf.projects.setArchiveRetention({ ...as(drafter, DRAFTER_GRANTS), archiveRetentionDays: 7 }), "PERMISSION_DENIED");
    await rejectsWith(retention().runAssetCleanup(as(drafter, DRAFTER_GRANTS), noModules), "PERMISSION_DENIED");
    const older = await fixture("Older", 20);
    const newer = await fixture("Newer", 10);
    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0);
    await sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays: 7 });
    assert.equal((await retention().runAssetCleanup({ ...as(designer), limit: 1 }, noModules)).projectsPurged, 1);
    assert.ok((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: older.projectId } })).assets_purged_at);
    assert.equal((await testDb.prisma.sfProject.findUniqueOrThrow({ where: { id: newer.projectId } })).assets_purged_at, null);
    assert.deepEqual(await sf.projects.getStudioSettings({ grants: ALL }), { archiveRetentionDays: 7, cdMall: 5, cdFinal: 5, gap: 5, fitOutToHandover: 40, handoverToOpening: 10 });
    await sf.projects.setArchiveRetention({ ...as(designer), archiveRetentionDays: 730 });
    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0);
  });

  it("claims each project exactly once across concurrent serializable sweeps", async () => {
    const expired = await fixture("Concurrent purge", 91);
    const results = await Promise.all([retention().purgeExpiredArchivedAssets({}, noModules), retention().purgeExpiredArchivedAssets({}, noModules)]);
    assert.equal(results.reduce((n, result) => n + result.projectsPurged, 0), 1);
    assert.equal(results.reduce((n, result) => n + result.blobsRemoved, 0), 5);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purged" } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purge_completed" } }), 1);
  });

  it("rolls back the claim and all records if the primary audit fails, before any storage removal", async () => {
    const expired = await fixture("Rollback", 91);
    await assert.rejects(retention({ auditWriter: { write: async () => { throw Error("audit unavailable"); } } }).purgeExpiredArchivedAssets({}, noModules));
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
    assert.equal((await service.purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0);
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
        storage: { put: (input) => storage.put(input), putStream: (input) => storage.putStream(input), copy: (input) => storage.copy(input), createSignedReadUrl: (key, seconds) => storage.createSignedReadUrl(key, seconds), remove: async (key) => {
          assert.equal(await testDb.prisma.sfDeliverable.count({ where: { project_id: expired.projectId } }), 0);
          if (key === expired.keys.deliverable) throw Error("secret filename");
          await storage.remove(key);
        } },
        auditWriter: { write: async (event, tx) => { if (event.action.endsWith("assets_purge_completed")) throw Error("secret audit details"); await writer.write(event, tx); } },
      }).purgeExpiredArchivedAssets({}, noModules);
      assert.equal(result.projectsPurged, 1); assert.equal(result.blobFailures, 1); assert.equal(result.blobsRemoved, 4);
      assert.deepEqual(logs, [["StudioFlow asset cleanup completion audit failed."]]);
      assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: expired.projectId, action: "studioflow.project.assets_purged" } }), 1);
      assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0);
    } finally { logger.mock.restore(); }
  });

  it("WO-BE-03 C1: archive, purge, restore, add a file and archive again purges the new file too", async () => {
    const db = testDb.prisma;
    const day = 86_400_000;
    const cycle = await fixture("Cycle");
    const purgeEvents = (action: string) => db.auditEvent.count({ where: { entity_id: cycle.projectId, action } });
    await sf.projects.archiveProject({ ...as(designer), projectId: cycle.projectId, reason: "First archive" });
    clock = new Date(clock.getTime() + 91 * day);
    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 1);
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
    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0);
    assert.ok(storage.objects.has(newKey), "still inside the second window");
    clock = new Date(clock.getTime() + 2 * day);
    const second = await retention().purgeExpiredArchivedAssets({}, noModules);
    assert.equal(second.projectsPurged, 1);
    assert.equal(second.deliverables, 1);
    assert.equal(storage.objects.has(newKey), false, "the second-cycle file is purged");
    assert.equal(await purgeEvents("studioflow.project.assets_purged"), 2);
    assert.equal(await purgeEvents("studioflow.project.assets_purge_completed"), 2);
    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 0, "a project archived once is purged once per cycle");
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
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId: expired.projectId })).assetsPurgedAt, null);

    assert.equal((await retention().purgeExpiredArchivedAssets({}, noModules)).projectsPurged, 1, "the purge acts on exactly what the preview counted");
    assert.deepEqual(await retention().previewAssetCleanup(as(designer)), { eligibleProjects: 0, retentionDays: 90 });
    assert.ok((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId: expired.projectId })).assetsPurgedAt instanceof Date);
    const archivedRows = await sf.projects.listProjects({ grants: ALL, archived: true });
    assert.ok(archivedRows.find((row) => row.id === expired.projectId)?.assetsPurgedAt instanceof Date);
    assert.equal(archivedRows.find((row) => row.id === boundary.projectId)?.assetsPurgedAt, null);
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId: live.projectId })).assetsPurgedAt, null);

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
        const actual = await sf.projects.quickSearch({ grants: ALL, actorId: designer.id, search, limit });
        assert.deepEqual(actual, {
          projects: projects.slice(0, limit ?? 6).map((p) => ({ id: p.id, name: p.name, clientName: p.client?.name ?? null })),
          clients: clients.slice(0, limit ?? 6).map((c) => ({ id: c.id, name: c.name })),
        });
      }
    }
    await rejectsWith(sf.projects.quickSearch({ grants: [P.access], actorId: designer.id, search: "needle" }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.quickSearch({ grants: [P.projectRead], actorId: designer.id, search: "needle" }), "PERMISSION_DENIED");
  });

  it("projects the phase's note messages oldest first, each labelled with the iteration it was written in", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const first = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: phase.id, body: "- Warmer palette\n- Keep the marble", clientFeedback: true });
    clock = new Date(clock.getTime() + 60_000);
    const second = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: phase.id, body: "Supplier called back" });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    assert.deepEqual(detail.notes.map((note) => [note.id, note.body, note.clientFeedback, note.starred, note.iterationId, note.iterationLabel, note.authorName]), [
      [first.noteId, "- Warmer palette\n- Keep the marble", true, false, detail.currentIteration!.id, detail.currentIteration!.shortName, designer.actor.label],
      [second.noteId, "Supplier called back", false, false, detail.currentIteration!.id, detail.currentIteration!.shortName, designer.actor.label],
    ]);
    assert.deepEqual(detail.currentIteration?.answerChoices, ["revision", "done"]);
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
    await rejectsWith(sf.projects.listClients({ grants: [P.access, P.projectRead] }), "PERMISSION_DENIED");
    assert.deepEqual(await sf.projects.listClientChoices({ grants: [P.access, P.projectRead] }), []);
  });

  it("gives Studio Managers project operations while keeping project workflow with the assigned PIC", async () => {
    const { projectId } = await newProject();
    const unassignedGrants = ALL.filter((grant) => grant !== P.projectOverride);
    const outsider = await seedUser("Studio Manager", unassignedGrants);
    const designerOnlyGrants = [P.access, P.projectRead, P.phaseWork, P.projectPicDesigner];
    const unassignedDesigner = await seedUser("Unassigned Designer", designerOnlyGrants);
    const moodboard = await phaseOf(projectId, "moodboard");
    const cd = await phaseOf(projectId, "cd");

    await sf.projects.setProjectPriority({ ...as(outsider, unassignedGrants), projectId, priority: "URGENT" });
    assert.equal((await sf.projects.getProject({ grants: unassignedGrants, actorId: outsider.id, projectId })).priority, "URGENT");
    await rejectsWith(sf.projects.getProject({ grants: designerOnlyGrants, actorId: unassignedDesigner.id, projectId }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.sendIteration({ ...as(outsider, unassignedGrants), projectId, phaseId: moodboard.id, iterationId: (await openIteration(moodboard.id)).id }), "PERMISSION_DENIED");
    await rejectsWith(sf.mom.createDocument({ ...as(outsider, unassignedGrants), projectId, topic: "Denied" }), "PERMISSION_DENIED");
    await rejectsWith(sf.schedule.createEntry({ ...as(outsider, unassignedGrants), projectId, section: "MATERIAL", category: "Panel" }), "PERMISSION_DENIED");
    await rejectsWith(presentation.createBoard({ ...as(outsider, unassignedGrants), projectId, title: "Denied" }), "PERMISSION_DENIED");

    const overrideWithoutManage = ALL.filter((grant) => grant !== P.projectManage);
    const limitedViewer = await seedUser("Override without manager rights", overrideWithoutManage);
    const limitedAccess = await sf.projects.getAccess({ grants: overrideWithoutManage, actor: limitedViewer.actor, projectId });
    assert.equal(limitedAccess.override, false);
    assert.equal(limitedAccess.canSeeWorkSections, false);
    assert.equal(limitedAccess.canEditProject, false);
    assert.equal(limitedAccess.canEditDocuments, false);
    assert.ok(limitedAccess.phases.every((phase) => !phase.canTransition && !phase.canEditContent));
    await rejectsWith(sf.phases.postPhaseNote({ ...as(limitedViewer, overrideWithoutManage), projectId, phaseId: moodboard.id, body: "Denied" }), "PERMISSION_DENIED");
    await rejectsWith(sf.mom.createDocument({ ...as(limitedViewer, overrideWithoutManage), projectId, topic: "Denied" }), "PERMISSION_DENIED");
    await rejectsWith(sf.schedule.createEntry({ ...as(limitedViewer, overrideWithoutManage), projectId, section: "MATERIAL", category: "Panel" }), "PERMISSION_DENIED");
    await rejectsWith(presentation.createBoard({ ...as(limitedViewer, overrideWithoutManage), projectId, title: "Denied" }), "PERMISSION_DENIED");
    await assert.doesNotReject(() => sf.schedule.listSchedule({ grants: overrideWithoutManage, projectId }));
    const picAccess = await sf.projects.getAccess({ grants: overrideWithoutManage, actor: designer.actor, projectId });
    assert.equal(picAccess.canSeeWorkSections, true);
    assert.equal(picAccess.canEditDocuments, true, "missing manager rights do not remove assigned PIC rights");

    await sf.projects.setProjectPriority({ ...as(designer), projectId, priority: "URGENT" });
    await sf.mom.createDocument({ ...as(drafter, [...DRAFTER_GRANTS, P.momManage]), projectId, topic: "Drafter can edit documents" });
    await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    await sf.phases.postPhaseNote({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, body: "Recorded CD context" });
    const access = await sf.projects.getAccess({ grants: DRAFTER_GRANTS, actor: drafter.actor, projectId });
    assert.deepEqual({ project: access.canEditProject, documents: access.canEditDocuments }, { project: false, documents: true });
    assert.equal(access.phases.find((phase) => phase.phaseId === moodboard.id)?.canTransition, false);
    assert.equal(access.phases.find((phase) => phase.phaseId === moodboard.id)?.canEditContent, false);
    assert.equal(access.phases.find((phase) => phase.phaseId === cd.id)?.canTransition, true);
    assert.equal(access.phases.find((phase) => phase.phaseId === cd.id)?.canEditContent, true);

    await rejectsWith(sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.postPhaseNote({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, body: "Not the drafter's phase" }), "PERMISSION_DENIED");
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
    await rejectsWith(sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, body: "x" }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.projects.updateProject({ ...as(designer), projectId, address: "New" }), "PROJECT_ARCHIVED");
    assert.equal((await sf.projects.listProjects({ grants: ALL })).length, 0);
    assert.equal((await sf.projects.listProjects({ grants: ALL, archived: true })).length, 1);
    await sf.projects.restoreProject({ ...as(designer), projectId });
    const history = await sf.projects.getProjectHistory({ grants: ALL, projectId });
    assert.deepEqual(history.map((h) => h.action).slice(0, 3), ["studioflow.project.restored", "studioflow.project.archived", "studioflow.project.created"]);
  });
});

describe("Iteration workflow (WO-SF-ITER-01)", () => {
  it("sends iterations to the client, posts what the client said as client feedback, and finishes", async () => {
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
    // A retry keeps the answer and posts nothing more when it carries no text.
    await sf.phases.recordClientAnswer({ ...base, iterationId: first.id });
    const revised = await sf.phases.chooseIterationOutcome({ ...base, iterationId: first.id, outcome: "REVISION" });
    assert.ok("nextIterationId" in revised);
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:REVISED", "Heloskin Cimanggu MB2:NOT_SENT"]);
    // What the client said is one client-feedback message on that iteration; nothing is copied into requirements or to-dos.
    const answers = await testDb.prisma.sfWorkspaceCard.findMany({ where: { phase_id: phase.id } });
    assert.deepEqual(answers.map((note) => [note.iteration_id, note.body, note.origin]), [[first.id, "- Warmer palette\n- Keep the marble", "CLIENT_ANSWER"]]);
    assert.deepEqual((await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id })).map((item) => item.label), ["Draft board"]);

    // Notes are not phase steps (WO-SF-NOTEFEED-01): posting one records no phase event, so no Undo appears for it.
    const second = await openIteration(phase.id);
    const eventsBefore = await testDb.prisma.sfPhaseEvent.count({ where: { project_id: projectId } });
    const posted = await sf.phases.postPhaseNote({ ...base, body: "Internal draft remark" });
    assert.equal(await testDb.prisma.sfPhaseEvent.count({ where: { project_id: projectId } }), eventsBefore);
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: posted.noteId } })).iteration_id, second.id, "labelled with the running iteration");
    await rejectsWith(sf.phases.postPhaseNote({ ...base, body: "x".repeat(4001) }), "TEXT_TOO_LONG");
    await rejectsWith(sf.phases.postPhaseNote({ ...base, body: "  " }), "PHASE_NOTE_EMPTY");

    await sf.phases.sendIteration({ ...base, iterationId: second.id });
    await sf.phases.recordClientAnswer({ ...base, iterationId: second.id, note: "Client wants marble" });
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: second.id, outcome: "REVISION" });
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:REVISED", "Heloskin Cimanggu MB2:REVISED", "Heloskin Cimanggu MB3:NOT_SENT"]);

    clock = new Date("2026-09-18T03:00:00Z");
    await clientRound(base, "DONE");
    const after = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id } });
    assert.equal(after.status, "DONE");
    assert.equal(after.is_locked, true);
    assert.deepEqual(await revisions(phase.id), ["Moodboard 1:REVISED", "Heloskin Cimanggu MB2:REVISED", "Heloskin Cimanggu MB3:DONE"]);
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId })).status, "ACTIVE", "finishing a phase never completes the project");
    assert.deepEqual((await sf.tasks.listChecklist({ grants: ALL, projectId, phaseId: phase.id })).map((item) => item.label), ["Draft board"], "Done adds nothing to the requirements");

    const actions = (await testDb.prisma.auditEvent.findMany({ where: { entity_id: phase.id }, orderBy: { occurred_at: "asc" } })).map((e) => e.action);
    assert.ok(actions.includes("studioflow.phase.iteration-revised"));
    assert.ok(actions.includes("studioflow.phase.iteration-done"));
    // Notes are audited on the note itself (WO-SF-NOTEFEED-01), not as a phase change.
    assert.equal(actions.includes("studioflow.phase.iteration-note-set"), false);
    assert.ok(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.workspace-card.created" } }) > 0);
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
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: supervision.id })).canStart, false);
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
    const project = await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId });
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
    // The drafter's client feedback is labelled with the CD iteration; nothing becomes a checklist item.
    assert.deepEqual((await testDb.prisma.sfWorkspaceCard.findMany({ where: { phase_id: cd.id } })).map((note) => [note.iteration_id, note.body]), [[iteration.id, "Fix section A"]]);
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { phase_id: cd.id } }), 0);
  });

  it("adds an iteration to a finished phase and overrides with a history snapshot", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await clientRound(base, "DONE");
    const reopened = await sf.phases.addIteration(base);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: reopened.iterationId } })).name, "Heloskin Cimanggu MB2");
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: phase.id } })).status, "ACTIVE");
    await rejectsWith(sf.phases.overrideRevision({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: phase.id, mode: "HARD_RESET_PENDING", note: "x" }), "PERMISSION_DENIED");
    const remark = await sf.phases.postPhaseNote({ ...base, body: "Client remark kept after the reset" });
    await sf.phases.overrideRevision({ ...base, mode: "HARD_RESET_ACTIVE", major: 3, note: "Align with client numbering" });
    assert.deepEqual(await revisions(phase.id), ["Heloskin Cimanggu MB3:NOT_SENT"]);
    const event = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { entity_id: phase.id, action: "studioflow.phase.revision-overridden" } });
    const history = (event.metadata as { history: Array<{ version: string }> }).history;
    assert.deepEqual(history.map((h) => h.version), ["Moodboard 1", "Heloskin Cimanggu MB2"]);
    // The reset removes iterations, never notes: the message stays, without its iteration label.
    const kept = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: remark.noteId } });
    assert.deepEqual([kept.body, kept.iteration_id], ["Client remark kept after the reset", null]);
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
  it("sets shared item marks in bulk, skips unchanged rows, and audits each change", async () => {
    const { projectId } = await newProject();
    const one = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const two = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const three = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const list = async () => sf.schedule.listSchedule({ grants: DRAFTER_GRANTS, projectId });
    assert.deepEqual((await list()).map((row) => [row.hidden, row.highlight]), [[false, null], [false, null], [false, null]]);

    assert.deepEqual(await sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds: [one.entryId], hidden: true }), { changed: 1 });
    assert.deepEqual(await sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds: [one.entryId, two.entryId, two.entryId], hidden: true }), { changed: 1 });
    assert.deepEqual(await sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds: [one.entryId, two.entryId], hidden: true }), { changed: 0 });
    assert.deepEqual((await list()).map((row) => row.hidden), [true, true, false], "hidden rows remain in the shared read");
    assert.deepEqual(await sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds: [one.entryId, two.entryId], hidden: false }), { changed: 2 });
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.entry-hidden" } }), 2);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.entry-unhidden" } }), 2);

    assert.deepEqual(await sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [one.entryId], highlight: "yellow" }), { changed: 1 });
    assert.deepEqual(await sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [one.entryId, two.entryId, three.entryId], highlight: "yellow" }), { changed: 2 });
    assert.deepEqual(await sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [one.entryId, two.entryId], highlight: "yellow" }), { changed: 0 });
    assert.deepEqual((await list()).map((row) => row.highlight), ["yellow", "yellow", "yellow"]);
    assert.deepEqual(await sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [one.entryId, two.entryId], highlight: null }), { changed: 2 });
    const events = await testDb.prisma.auditEvent.findMany({ where: { action: "studioflow.schedule.entry-highlighted" } });
    assert.equal(events.length, 5);
    assert.ok(events.some((event) => {
      const change = event.changes as { highlight?: { from?: string; to?: string | null } };
      return change.highlight?.from === "yellow" && change.highlight.to === null;
    }));
  });

  it("refuses invalid mark selections and preserves every row on error", async () => {
    const { projectId } = await newProject();
    const own = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const other = await newProject("Other marks");
    const foreign = await sf.schedule.createEntry({ ...as(designer), projectId: other.projectId, section: "MATERIAL", category: "Paint" });
    for (const method of ["setEntriesHidden", "setEntriesHighlight"] as const) {
      const run = (entryIds: string[]) => method === "setEntriesHidden"
        ? sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds, hidden: true })
        : sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds, highlight: "blue" });
      await rejectsWith(run([]), "SCHEDULE_ENTRY_SELECTION_INVALID");
      await rejectsWith(run([own.entryId, foreign.entryId]), "SCHEDULE_ITEM_NOT_FOUND");
      await rejectsWith(run([own.entryId, randomUUID()]), "SCHEDULE_ITEM_NOT_FOUND");
    }
    await rejectsWith(sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [own.entryId], highlight: "orange" }), "SCHEDULE_HIGHLIGHT_INVALID");
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId }))[0].hidden, false);
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId }))[0].highlight, null);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: { in: ["studioflow.schedule.entry-hidden", "studioflow.schedule.entry-highlighted"] } } }), 0);

    await assert.rejects(sf.schedule.setEntriesHidden({ ...as(drafter, DRAFTER_GRANTS), projectId, entryIds: [own.entryId], hidden: true }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    await assert.rejects(sf.schedule.setEntriesHighlight({ ...as(drafter, DRAFTER_GRANTS), projectId, entryIds: [own.entryId], highlight: "red" }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Done" });
    await rejectsWith(sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds: [own.entryId], hidden: true }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [own.entryId], highlight: "red" }), "PROJECT_ARCHIVED");
  });

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
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code), ["PT-01", "PT-02"], "a new row fills the lowest empty number");
  });

  it("fills the lowest empty number of a code group and never shifts existing codes (owner, 2026-10-09)", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Stone", prefix: "ST" });
    const codes = async () => (await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code);
    const nextNumbers = async () => [...new Set((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.nextNumber))];
    const one = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    const two = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    const three = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });

    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: two.entryId });
    assert.deepEqual(await codes(), ["ST-01", "ST-03"], "a delete leaves a gap; ST-03 does not shift");
    assert.deepEqual(await nextNumbers(), [2], "the add button offers the gap");
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    assert.deepEqual(await codes(), ["ST-01", "ST-02", "ST-03"], "the new row fills ST-02");
    assert.deepEqual(await nextNumbers(), [4]);

    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: one.entryId });
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    assert.deepEqual(await codes(), ["ST-01", "ST-02", "ST-03"], "with ST-01 deleted the next row is ST-01");

    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: three.entryId });
    assert.deepEqual(await nextNumbers(), [3], "the highest number can come back too");
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    assert.deepEqual(await codes(), ["ST-01", "ST-02", "ST-03"]);
  });

  it("a row moved into another category takes that group's lowest empty number", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Stone", prefix: "ST" });
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    const st1 = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    const st2 = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" });
    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: st2.entryId });
    const pt1 = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    const moved = await sf.schedule.moveEntryToCategory({ ...as(designer), projectId, entryId: pt1.entryId, category: "Stone" });
    assert.equal(moved.code, "ST-02");
    const codes = Object.fromEntries((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((row) => [row.id, row.code]));
    assert.equal(codes[st1.entryId], "ST-01");
    assert.deepEqual(Object.values(codes).sort(), ["PT-02", "ST-01", "ST-02", "ST-03"], "PT-02 keeps its code; PT-01 is left empty");
  });

  it("two rows added at the same time in one group get two different numbers", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Stone", prefix: "ST" });
    await Promise.all([1, 2, 3].map(() => sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone" })));
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code), ["ST-01", "ST-02", "ST-03"]);
  });

  it("an imported sheet keeps its own number when no live row uses it, even a number deleted before", async () => {
    const { projectId } = await newProject();
    await sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Paint", prefix: "PT" });
    const first = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: first.entryId });
    const sheet = ["Code,Product Category,Ex,Type", "PT-01,Paint,Dulux,Easy Clean"].join("\n");
    assert.deepEqual(await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: sheet }), { created: 1, updated: 0 });
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code), ["PT-01", "PT-02"], "the sheet's PT-01 is kept");
    await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint" });
    assert.deepEqual((await sf.schedule.listSchedule({ grants: ALL, projectId })).map((e) => e.code), ["PT-01", "PT-02", "PT-03"]);
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
    const columns = [{ key: "category", header: "Category" }, { key: "brand", header: "Brand" }, { key: "product", header: "Product" }, { key: "qty", header: "Qty" }, { key: "unit", header: "Unit" }, { key: "location", header: "Location" }, { key: "contact", header: "Contact" }];
    const rows = [{ category: "Tile", brand: "Roman", product: "Granitio", qty: "12", unit: "m2", location: "Lobby", contact: "Toko Roman" }];
    const xlsx = await exportTable({ format: "xlsx", filename: "schedule", columns, rows });
    const imported = await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", file: { name: xlsx.filename, data: xlsx.data } });
    assert.equal(imported.created, 1);
    assert.ok((await sf.schedule.listSchedule({ grants: ALL, projectId, section: "MATERIAL" })).some((row) => row.options[0].productName === "Granitio" && row.options[0].contact === "Toko Roman"));
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

    await sf.schedule.updateOption({
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

    await sf.schedule.updateOption({
      ...as(designer),
      projectId: target.projectId,
      optionId: copied.options[0].id,
      snapshot: { productName: "Granite Slab", brandName: "Cotto", pattern: "Flaming", color: "Grey" },
    });
    const editedRow = (await sf.schedule.listSchedule({ grants: ALL, projectId: target.projectId })).find((r) => r.id === targetEntry.entryId)!;
    assert.equal(editedRow.options[0].pattern, "Flaming", "editing another option field preserves pattern");
    assert.equal(editedRow.options[0].color, "Grey");
  });

  it("copies Contact through templates, option reuse, and save as template", async () => {
    const template = await sf.schedule.createTemplateItem({ ...as(designer), section: "MATERIAL", category: "Paint", snapshot: { productName: "Easy Clean", contact: "Toko Awal" } });
    assert.equal((await sf.schedule.listTemplates({ grants: ALL }))[0].items[0].contact, "Toko Awal");
    await sf.schedule.updateTemplateItem({ ...as(designer), templateItemId: template.templateItemId, snapshot: { productName: "Easy Clean", contact: "Toko Baru" } });
    const source = await newProject("Source contact");
    const sourceRow = (await sf.schedule.listSchedule({ grants: ALL, projectId: source.projectId })).find((row) => row.category === "Paint")!;
    assert.equal(sourceRow.options[0].contact, "Toko Baru", "new project seeding copies Contact");
    const other = await newProject("Other contact");
    const target = await sf.schedule.createEntry({ ...as(designer), projectId: other.projectId, section: "MATERIAL", category: "Tile" });
    await sf.schedule.copyReusableOption({ ...as(designer), projectId: other.projectId, entryId: target.entryId, sourceOptionId: sourceRow.options[0].id });
    const copied = (await sf.schedule.listSchedule({ grants: ALL, projectId: other.projectId })).find((row) => row.id === target.entryId)!.options[0];
    assert.equal(copied.contact, "Toko Baru");
    const saved = await sf.schedule.saveEntryAsTemplate({ ...as(designer), projectId: other.projectId, entryId: target.entryId });
    assert.equal((await testDb.prisma.sfScheduleTemplateItem.findUniqueOrThrow({ where: { id: saved.templateItemId } })).contact, "Toko Baru");
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
    assert.equal(pt.options[0].contact, "Budi 0812");
    assert.doesNotMatch(pt.options[0].notes ?? "", /Contact:/i);
    assert.match(pt.options[0].notes ?? "", /Initials type: EC/);
    assert.deepEqual(rows.filter((row) => row.category === "Floor Tile").map((row) => row.code), ["FL-01", "FL-02"], "a new category keeps the sheet prefix");

    await rejectsWith(sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: "Code,Product Category,Ex,Type\nZZ-01,,Brand,Thing" }), "SCHEDULE_CSV_CATEGORY");
    await rejectsWith(sf.schedule.upsertPrefix({ ...as(designer), section: "MATERIAL", category: "Tile Wall", prefix: "FL" }), "SCHEDULE_PREFIX_IN_USE");
    // A dictionary from before that rule may still hold one prefix twice; an import then refuses to guess.
    await testDb.prisma.sfSchedulePrefix.create({ data: { section: "MATERIAL", category: "Tile Wall", category_key: "TILE WALL", prefix: "FL" } });
    await rejectsWith(sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: "Code,Product Category,Ex,Type\nFL-09,,Brand,Thing" }), "SCHEDULE_CSV_CATEGORY");
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId })).length, 3, "a failed import writes nothing");
  });

  it("imports Material Type, uses Initials Type for a blank Type, and keeps Contact searchable", async () => {
    const { projectId } = await newProject();
    const sheet = [
      "Code,Material Type,Ex,Type,Initials Type,Image,Location,Contact",
      "PT-02,Paint,Dulux,,Pink,,Bedroom,SOCIOLLA (old)",
      "PT-03,Paint,Dulux,Easy Clean,Matte,,Lobby,Toko Baru",
    ].join("\n");
    assert.deepEqual(await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: sheet }), { created: 2, updated: 0 });
    const rows = await sf.schedule.listSchedule({ grants: ALL, projectId });
    const pink = rows.find((row) => row.code === "PT-02")!.options[0];
    assert.deepEqual([pink.productName, pink.contact, pink.notes], ["Pink", "SOCIOLLA (old)", null]);
    const exact = rows.find((row) => row.code === "PT-03")!.options[0];
    assert.deepEqual([exact.productName, exact.contact, exact.notes], ["Easy Clean", "Toko Baru", "Initials type: Matte"]);
    const hits = await sf.schedule.searchReusableOptions({ grants: ALL, projectId: (await newProject("Other")).projectId, query: "sociolla" });
    assert.ok(hits.some((hit) => hit.optionId === pink.id));

    await sf.schedule.updateOption({ ...as(designer), projectId, optionId: pink.id, snapshot: { productName: "Heart's Desire 90RR 41/258", brandName: "Dulux" } });
    await sf.schedule.importCsv({ ...as(designer), projectId, section: "MATERIAL", csv: sheet });
    const again = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.code === "PT-02")!.options[0];
    assert.equal(again.productName, "Heart's Desire 90RR 41/258", "a re-import's initials do not overwrite a settled Type");
  });

  it("moves labeled Contact lines from old option notes and keeps other lines", async () => {
    const { projectId } = await newProject();
    const first = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Old paint", notes: "Initials type: pink\n  cOnTaCt:  SOCIOLLA (old)  \nImage: legacy.jpg" } });
    const second = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Other paint", notes: "Contact: Toko Dua" } });
    const retained = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Already set", contact: "Current shop", notes: "Contact: Old shop" } });
    const migration = readFileSync("prisma/migrations/20261023120000_sf_schedule_contact/migration.sql", "utf8");
    await testDb.prisma.$executeRawUnsafe(migration.slice(migration.indexOf("-- Data move:")));
    const option = async (entryId: string) => testDb.prisma.sfScheduleOption.findFirstOrThrow({ where: { entry_id: entryId } });
    assert.deepEqual([(await option(first.entryId)).contact, (await option(first.entryId)).notes], ["SOCIOLLA (old)", "Initials type: pink\nImage: legacy.jpg"]);
    assert.match((await option(first.entryId)).search_key, /sociolla \(old\)/);
    assert.deepEqual([(await option(second.entryId)).contact, (await option(second.entryId)).notes], ["Toko Dua", null]);
    assert.deepEqual([(await option(retained.entryId)).contact, (await option(retained.entryId)).notes], ["Current shop", "Contact: Old shop"]);
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
    await sf.schedule.setEntriesHidden({ ...as(designer), projectId, entryIds: [existing.entryId], hidden: true });
    await sf.schedule.setEntriesHighlight({ ...as(designer), projectId, entryIds: [existing.entryId], highlight: "purple" });
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
    assert.deepEqual(rows.filter((row) => row.id === existing.entryId).map((row) => [row.hidden, row.highlight]), [[true, "purple"]], "re-import keeps both item marks");
    assert.ok(rows.filter((row) => row.id !== existing.entryId).every((row) => row.hidden === false && row.highlight === null), "new imported items start unmarked");
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
    const afterImport = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.id === existing.entryId)!;
    assert.deepEqual([afterImport.hidden, afterImport.highlight], [true, "purple"]);
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

  it("seeds each legacy Material reserve once, keeps PT-01 for its first product, and permits deletion", async () => {
    await testDb.prisma.sfSchedulePrefix.createMany({
      data: DEFAULT_SCHEDULE_MATERIAL_CATEGORIES.map(({ category, prefix }) => ({
        section: "MATERIAL",
        category,
        category_key: normalizeScheduleCategory(category).key,
        prefix,
      })),
    });
    for (const { category, exportOrder } of DEFAULT_SCHEDULE_MATERIAL_CATEGORIES) {
      const categoryKey = normalizeScheduleCategory(category).key;
      const template = await testDb.prisma.sfScheduleTemplateCategory.create({
        data: { section: "MATERIAL", category, category_key: categoryKey, sort_order: exportOrder * 10 },
      });
      await testDb.prisma.sfScheduleTemplateItem.create({
        data: { template_category_id: template.id, section: "MATERIAL", category, category_key: categoryKey, product_name: "", sort_order: exportOrder * 10 },
      });
    }

    const { projectId } = await newProject();
    const seeded = await sf.schedule.listSchedule({ grants: ALL, projectId, section: "MATERIAL" });
    assert.deepEqual(
      seeded.map((row) => [row.category, row.code, row.options.length]),
      DEFAULT_SCHEDULE_MATERIAL_CATEGORIES.map(({ category, prefix }) => [category, `${prefix}-01`, 0]),
      "every explicit default is an empty reserve row with its legacy prefix",
    );
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 0 });
    assert.deepEqual(await sf.schedule.applyTemplates({ ...as(designer), projectId }), { created: 0 }, "applying twice does not duplicate seed rows");

    const paint = seeded.find((row) => row.category === "Paint")!;
    await sf.schedule.createOption({ ...as(designer), projectId, entryId: paint.id, snapshot: { productName: "Easy Clean" } });
    const paintWithProduct = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((row) => row.id === paint.id)!;
    assert.deepEqual([paintWithProduct.code, paintWithProduct.options.length, paintWithProduct.options[0]?.isFinal], ["PT-01", 1, false], "the first Paint product fills PT-01 and remains unselected");

    const glass = seeded.find((row) => row.category === "Glass")!;
    await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: glass.id });
    assert.equal((await sf.schedule.listSchedule({ grants: ALL, projectId })).some((row) => row.id === glass.id), false, "an empty reserve row can be removed");
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
    assert.equal(await testDb.prisma.sfAssetCleanupFailure.count({ where: { storage_key: stored.image_key!, resolved_at: null } }), 0, "a shared object is not queued for deletion");
    await sf.schedule.deleteEntry({ ...as(designer), projectId: other.projectId, entryId: target.entryId });
    assert.equal(storage.objects.size, 1, "still referenced by the template");
    await sf.schedule.deleteTemplateItem({ ...as(designer), templateItemId: template.templateItemId });
    assert.equal(storage.objects.size, 0, "released once nothing points at it");
  });

  it("commits a Schedule delete with cleanup already queued when storage is unavailable", async () => {
    const { projectId } = await newProject();
    const entry = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Paint", snapshot: { productName: "Primer" } });
    const optionId = (await sf.schedule.listSchedule({ grants: ALL, projectId }))[0].options[0].id;
    await sf.schedule.setOptionImage({ ...as(designer), projectId, optionId, file: png() });
    const key = (await testDb.prisma.sfScheduleOption.findUniqueOrThrow({ where: { id: optionId } })).image_key!;
    const failure = mock.method(storage, "remove", async () => { throw new Error("storage unavailable"); });
    try { await sf.schedule.deleteEntry({ ...as(designer), projectId, entryId: entry.entryId }); } finally { failure.mock.restore(); }

    assert.equal(await testDb.prisma.sfScheduleEntry.count({ where: { id: entry.entryId } }), 0, "the database delete commits");
    assert.equal(storage.objects.has(key), true, "the failed physical delete leaves the object for retry");
    const queued = await testDb.prisma.sfAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: key } });
    assert.equal(queued.resolved_at, null);
    assert.equal(queued.attempts, 1, "the transaction enqueues at zero and the failed post-commit attempt increments once");
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
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: (await phaseOf(projectId, "moodboard")).id });
    assert.equal(detail.label, "Moodboard", "detail uses snapshot label");
  });

  it("custom prefix used in revision labels", async () => {
    const { projectId } = await newProject();
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: (await phaseOf(projectId, "moodboard")).id });
    assert.ok(detail.activeRevision?.label.startsWith("MB"), "revision uses snapshot prefix");
  });

  it("custom seat names the phase owner from the snapshot", async () => {
    const { projectId } = await newProject();
    const cd = await phaseOf(projectId, "cd");
    await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: cd.id });
    assert.equal(detail.seatUserId, drafter.id, "CD belongs to the drafter seat from the snapshot");
  });

  it("getPhaseDetail returns warnings with deliverable status and open optional count", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
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
    const result = await sf.phases.listDeliverables({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    assert.equal(result.status, "MISSING");
  });

  it("deliverable status: upload on active revision → CURRENT", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.uploadDeliverable({ ...base, name: "design.pdf", file: { body: new Uint8Array(100), contentType: "application/pdf" } });
    const result = await sf.phases.listDeliverables({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    assert.equal(result.status, "CURRENT");
    assert.equal(result.items.length, 1);
  });

  it("deliverable status: old files after reject → OUTDATED", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.uploadDeliverable({ ...base, name: "design.pdf", file: { body: new Uint8Array(100), contentType: "application/pdf" } });
    const before = await sf.phases.listDeliverables({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    assert.equal(before.status, "CURRENT");
    await clientRound(base, "REVISION");
    const after = await sf.phases.listDeliverables({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    assert.equal(after.status, "OUTDATED", "files belong to old revision after reject");
  });

  it("replaces the phase file regardless of name and queues the old object for cleanup", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    await sf.phases.uploadDeliverable({ ...base, name: "draft.pdf", file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
    const first = await testDb.prisma.sfDeliverable.findUniqueOrThrow({ where: { phase_id: phase.id } });
    await sf.phases.uploadDeliverable({ ...base, name: "final.zip", file: { body: new Uint8Array([2]), contentType: "application/zip" } });
    const listed = await sf.phases.listDeliverables({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0]?.name, "final.zip");
    assert.equal(await testDb.prisma.sfDeliverable.count({ where: { phase_id: phase.id } }), 1);
    assert.equal(storage.objects.has(first.storage_key), false);
    assert.ok((await testDb.prisma.sfAssetCleanupFailure.findUnique({ where: { storage_key: first.storage_key } }))?.resolved_at instanceof Date);
  });

  it("serializes concurrent uploads into one stored phase file", async () => {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const input = { ...as(designer), projectId, phaseId: phase.id, name: "parallel.pdf", file: { body: new Uint8Array([1]), contentType: "application/pdf" } };
    await Promise.all([sf.phases.uploadDeliverable(input), sf.phases.uploadDeliverable({ ...input, name: "parallel-2.pdf" })]);
    assert.equal(await testDb.prisma.sfDeliverable.count({ where: { phase_id: phase.id } }), 1);
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

  it("rejects manual deletion while the phase is locked", async () => {
    const { projectId } = await newProject("Locked deliverables");
    const phase = await phaseOf(projectId, "moodboard");
    await sf.phases.uploadDeliverable({ ...as(designer), projectId, phaseId: phase.id, name: "locked.pdf", file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
    const row = await testDb.prisma.sfDeliverable.findFirstOrThrow({ where: { phase_id: phase.id } });
    const beforeAudit = await testDb.prisma.auditEvent.count({ where: { entity_id: row.id } });
    await testDb.prisma.sfPhase.update({ where: { id: phase.id }, data: { is_locked: true } });
    await rejectsWith(sf.phases.deleteDeliverable({ ...as(designer), projectId, deliverableId: row.id }), "PHASE_LOCKED");
    assert.deepEqual(await testDb.prisma.sfDeliverable.findUniqueOrThrow({ where: { id: row.id } }), row);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: row.id } }), beforeAudit);
    assert.equal(storage.objects.has(row.storage_key), true);
  });

  it("lets a non-PIC Studio Manager delete a file, but keeps upload and deletion unavailable to the wrong authority", async () => {
    const { projectId } = await newProject("Manager deliverable authority");
    const phase = await phaseOf(projectId, "moodboard");
    await sf.phases.uploadDeliverable({ ...as(designer), projectId, phaseId: phase.id, name: "manager-delete.pdf", file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
    const row = await testDb.prisma.sfDeliverable.findFirstOrThrow({ where: { phase_id: phase.id } });
    const manager = await seedUser("Maya Manager", [P.access, P.projectRead, P.projectManage]);
    const picWithoutManager = [P.access, P.projectRead, P.phaseWork, P.projectPicDesigner];

    await rejectsWith(sf.phases.uploadDeliverable({ ...as(manager, [P.access, P.projectRead, P.projectManage]), projectId, phaseId: phase.id, name: "not-allowed.pdf", file: { body: new Uint8Array([2]), contentType: "application/pdf" } }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.deleteDeliverable({ ...as(designer, picWithoutManager), projectId, deliverableId: row.id }), "PERMISSION_DENIED");
    await sf.phases.deleteDeliverable({ ...as(manager, [P.access, P.projectRead, P.projectManage]), projectId, deliverableId: row.id });

    assert.equal(await testDb.prisma.sfDeliverable.count({ where: { id: row.id } }), 0);
    assert.equal(storage.objects.has(row.storage_key), false);
  });

  it("records manual deletion with the actor and file identity, and rolls back if audit fails", async () => {
    const { projectId } = await newProject("Audited deletion");
    const phase = await phaseOf(projectId, "moodboard");
    await sf.phases.uploadDeliverable({ ...as(designer), projectId, phaseId: phase.id, name: "delete.pdf", file: { body: new Uint8Array([1]), contentType: "application/pdf" } });
    const row = await testDb.prisma.sfDeliverable.findFirstOrThrow({ where: { phase_id: phase.id } });
    const failing = createStudioFlowService(testDb.prisma, {
      runTransaction: (work) => testDb.prisma.$transaction((tx) => work(tx)),
      auditWriter: { write: async () => { throw new Error("audit down"); } },
      people: createPeopleDirectory(testDb.prisma), storage, masterData: createMasterDataPublicRead(testDb.prisma), now: () => clock,
    });
    await assert.rejects(failing.phases.deleteDeliverable({ ...as(designer), projectId, deliverableId: row.id }), /audit down/);
    assert.ok(await testDb.prisma.sfDeliverable.findUnique({ where: { id: row.id } }));
    assert.equal(storage.objects.has(row.storage_key), true);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { entity_id: row.id, action: "studioflow.deliverable.deleted" } }), 0);
    await sf.phases.deleteDeliverable({ ...as(designer), projectId, deliverableId: row.id });
    const event = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { entity_id: row.id, action: "studioflow.deliverable.deleted" } });
    assert.equal(event.actor_kind, "USER");
    assert.equal(event.actor_user_id, designer.id);
    assert.deepEqual(event.metadata, { projectId, phaseId: phase.id, name: row.name });
    assert.equal(await testDb.prisma.sfDeliverable.count({ where: { id: row.id } }), 0);
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
    const created = await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId });
    assert.equal(created.timelineStartDate, dateToDateOnly(created.createdAt), "defaults to the createdAt date when never overridden");

    await sf.projects.updateProject({ ...as(designer), projectId, timelineStartDate: "2026-01-15" });
    let updated = await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId });
    assert.equal(updated.timelineStartDate, "2026-01-15");
    assert.deepEqual((await sf.projects.listProjects({ grants: ALL, status: "ALL" })).find((p) => p.id === projectId)?.timelineStartDate, "2026-01-15", "listProjects reflects the override too");

    await sf.projects.updateProject({ ...as(designer), projectId, timelineStartDate: null });
    updated = await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId });
    assert.equal(updated.timelineStartDate, dateToDateOnly(created.createdAt), "clearing the override resets to the createdAt fallback");
  });

  it("keeps the opening date when other project fields are edited", async () => {
    const { projectId } = await newProject();
    await sf.projects.updateProject({ ...as(designer), projectId, openingDate: "2026-12-01" });
    await sf.projects.updateProject({ ...as(designer), projectId, address: "Somewhere" });
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId })).openingDate, "2026-12-01");
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
    const detail = (phaseId: string) => sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId });
    const run = { ...as(designer), projectId };

    const first = await openIteration(concept.id);
    assert.deepEqual((await detail(concept.id)).currentIteration?.choices, ["send"]);
    await sf.phases.sendIteration({ ...run, phaseId: concept.id, iterationId: first.id });
    assert.deepEqual((await detail(concept.id)).currentIteration?.choices, ["record_answer"], "the client answer comes before any outcome");
    await sf.phases.recordClientAnswer({ ...run, phaseId: concept.id, iterationId: first.id });
    assert.deepEqual((await detail(concept.id)).currentIteration?.choices, ["revision", "done"]);
    const revised = await sf.phases.chooseIterationOutcome({ ...run, phaseId: concept.id, iterationId: first.id, outcome: "REVISION" });
    assert.ok("nextIterationId" in revised);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: revised.nextIterationId } })).name, "Heloskin Cimanggu CN2");
    await clientRound({ ...run, phaseId: concept.id }, "DONE");
    assert.equal((await detail(concept.id)).status, "DONE");

    // Finishing Concept starts the next phase with its first iteration.
    assert.equal((await detail(planning.id)).activeRevision?.label, "PL1");
    await sf.phases.sendIteration({ ...run, phaseId: planning.id, iterationId: (await openIteration(planning.id)).id });
    assert.equal((await detail(planning.id)).activeRevision?.state, "SENT", "the iteration is with the client while the phase stays active");

    await sf.phases.bypassPhase({ ...run, phaseId: documentation.id, reason: "Not needed" });
    assert.equal((await detail(documentation.id)).status, "DONE");

    const again = await sf.phases.addIteration({ ...run, phaseId: concept.id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: again.iterationId } })).name, "Heloskin Cimanggu CN3");
  });

  it("gives site visits only to the legacy Supervision definition", async () => {
    const custom = await seedTemplate("Custom", [{ name: "Concept", prefix: "CN" }, { name: "Supervision", prefix: "SV" }]);
    const customProject = await newProject("Custom named Supervision");
    const [conceptPhase, namedSupervision] = await phasesOf(customProject.projectId);
    const run = { ...as(designer), projectId: customProject.projectId };
    await clientRound({ ...run, phaseId: conceptPhase.id }, "DONE");
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId: customProject.projectId, phaseId: namedSupervision.id });
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
    const visitDetail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId: standard.projectId, phaseId: supervision.id });
    assert.equal(visitDetail.isSupervision, true);
    assert.deepEqual(visitDetail.currentIteration?.choices, ["next_visit", "done"]);
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId: standard.projectId, phaseId: supervision.id, iterationId: visit.iterationId, outcome: "DONE" });
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId: standard.projectId })).status, "ACTIVE");
  });

  it("does not complete the project when the last custom phase is finished", async () => {
    await seedTemplate("Two phases", [{ name: "Concept", prefix: "CN" }, { name: "Handover", prefix: "HO" }]);
    const { projectId } = await newProject();
    const [concept, handover] = await phasesOf(projectId);
    const run = { ...as(designer), projectId };
    await clientRound({ ...run, phaseId: concept.id }, "DONE");
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId })).status, "ACTIVE");
    await clientRound({ ...run, phaseId: handover.id }, "DONE");
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId })).status, "ACTIVE");

    // Another iteration on a finished phase stays phase-local; project completion is an explicit command.
    await sf.phases.addIteration({ ...run, phaseId: handover.id });
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId })).status, "ACTIVE");
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: handover.id })).status, "ACTIVE");
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
    await sf.phases.postPhaseNote({ ...base, body: "- Lighting points moved 20 cm" });

    await sf.phases.chooseSupervisionVisit({ ...base, iterationId: visit.iterationId, outcome: "DONE" });

    const closed = await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: visit.iterationId } });
    assert.equal(closed.status, "DONE");
    // The visit's own note is posted to the phase notes, labelled with the visit, and stays after the phase closes.
    const notes = await testDb.prisma.sfWorkspaceCard.findMany({ where: { phase_id: supervision.id }, orderBy: { created_at: "asc" } });
    assert.deepEqual(notes.map((note) => [note.iteration_id, note.body, note.origin]), [[visit.iterationId, "Ceiling height checked", "SITE_VISIT"], [visit.iterationId, "- Lighting points moved 20 cm", "NOTE"]]);
    assert.equal(await testDb.prisma.sfChecklistItem.count({ where: { phase_id: supervision.id } }), 0, "closing a visit adds nothing to the requirements");
  });

  it("closes Supervision with Done (handover) when no visit is open after a completed visit, and undoes it", async () => {
    const { projectId } = await newProject();
    for (const key of ["layout", "design3d", "cd"] as const) {
      await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: (await phaseOf(projectId, key)).id, reason: "Skip" });
    }
    const supervision = await phaseOf(projectId, "supervision");
    const base = { ...as(designer), projectId, phaseId: supervision.id };
    const flag = async () => (await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: supervision.id })).canFinishSupervision;

    // No visit yet: nothing to hand over from.
    assert.equal(await flag(), false);
    const first = await sf.phases.createSupervisionVisit({ ...base, visitDate: "2026-09-20" });
    // A visit is open: it is closed on the visit itself.
    assert.equal(await flag(), false);
    await rejectsWith(sf.phases.finishSupervision(base), "PHASE_INVALID_STATE");
    await sf.phases.chooseSupervisionVisit({ ...base, iterationId: first.iterationId, outcome: "NEXT_VISIT" });
    assert.equal(await flag(), true);

    // Only the phase's own people, and only Supervision.
    await assert.rejects(sf.phases.finishSupervision({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: supervision.id }));
    await rejectsWith(sf.phases.finishSupervision({ ...base, phaseId: (await phaseOf(projectId, "cd")).id }), "PHASE_INVALID_STATE");

    await sf.phases.finishSupervision(base);
    const closed = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: supervision.id } });
    assert.deepEqual([closed.status, closed.is_locked], ["DONE", true]);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: first.iterationId } })).status, "DONE", "the completed visit is left as it was");
    assert.equal(await flag(), false);
    await rejectsWith(sf.phases.finishSupervision(base), "PHASE_INVALID_STATE");

    // Undo reopens the phase with no open visit, so it can be closed again.
    const event = await testDb.prisma.sfPhaseEvent.findFirstOrThrow({ where: { project_id: projectId }, orderBy: { occurred_at: "desc" } });
    assert.equal(event.iteration_id, first.iterationId);
    await sf.phases.undoPhaseEvent({ ...as(designer), projectId, eventId: event.id });
    const reopened = await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: supervision.id } });
    assert.deepEqual([reopened.status, reopened.is_locked], ["ACTIVE", false]);
    assert.equal(await flag(), true);

    // A project that is not active takes no handover.
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { status: "ON_HOLD" } });
    await assert.rejects(sf.phases.finishSupervision(base));
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
    assert.deepEqual(Object.keys(first).sort(), ["declineReason", "declinedAt", "id", "note", "option", "project", "receivedAt", "requestedAt", "requestedBy", "requestedFrom", "status"]);
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

  it("records a Master Data decline in Schedule, removes waiting counts, and permits another request", async () => {
    const staff = await seedUser("Sari Decline", []);
    const { projectId, requestId, optionId, entryId } = await pendingRequest("Decline A");
    const read = createStudioFlowSampleRequestRead(testDb.prisma);
    assert.equal(await read.countPendingSampleRequests(), 1);
    clock = new Date("2026-09-20T08:30:00Z");
    assert.deepEqual(await commandWith().markSampleDeclinedFromMasterData({ actor: staff.actor, requestId, reason: "Supplier is out of stock" }), { updated: true });
    const row = await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: requestId } });
    assert.deepEqual([row.status, row.declined_by_id, row.declined_by_name, row.declined_at?.toISOString(), row.decline_reason], ["DECLINED", staff.id, "Sari Decline", "2026-09-20T08:30:00.000Z", "Supplier is out of stock"]);
    assert.equal(await read.countPendingSampleRequests(), 0);
    assert.equal((await read.listPendingSampleRequests()).length, 0);
    assert.equal((await sf.projects.getHomeStats({ grants: ALL, filter: "mine", actorId: designer.id })).samplesWaiting, 0);
    assert.deepEqual([(await read.getSampleRequests([requestId]))[0]?.status, (await read.getSampleRequests([requestId]))[0]?.declineReason], ["DECLINED", "Supplier is out of stock"]);
    const option = (await sf.schedule.listSchedule({ grants: ALL, projectId })).find((entry) => entry.id === entryId)!.options[0];
    assert.deepEqual([option.sampleRequest?.status, option.sampleRequest?.declineReason], ["DECLINED", "Supplier is out of stock"]);
    const events = await testDb.prisma.auditEvent.findMany({ where: { action: "studioflow.schedule.sample-declined", entity_id: optionId } });
    assert.equal(events.length, 1);
    assert.equal(events[0].actor_user_id, staff.id);
    const again = await sf.schedule.requestSample({ ...as(designer), projectId, optionId, requestedFrom: "Another supplier" });
    assert.notEqual(again.requestId, requestId);
    assert.equal(await read.countPendingSampleRequests(), 1);
  });

  it("makes decline retries idempotent and never rewrites a received request", async () => {
    const staff = await seedUser("Sari Decline", []);
    const first = await pendingRequest("Decline B");
    const command = commandWith();
    await command.markSampleDeclinedFromMasterData({ actor: staff.actor, requestId: first.requestId, reason: "Unavailable" });
    assert.deepEqual(await command.markSampleDeclinedFromMasterData({ actor: staff.actor, requestId: first.requestId, reason: "Changed reason" }), { updated: false, reason: "ALREADY_DECLINED" });
    assert.equal((await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: first.requestId } })).decline_reason, "Unavailable");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.sample-declined", entity_id: first.optionId } }), 1);
    const received = await pendingRequest("Decline C");
    await sf.schedule.receiveSample({ ...as(designer), projectId: received.projectId, requestId: received.requestId });
    assert.deepEqual(await command.markSampleDeclinedFromMasterData({ actor: staff.actor, requestId: received.requestId, reason: "Too late" }), { updated: false, reason: "ALREADY_RECEIVED" });
    assert.equal((await testDb.prisma.sfScheduleSampleRequest.findUniqueOrThrow({ where: { id: received.requestId } })).status, "RECEIVED");
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

  it("names iterations after the project and phase prefix, keeps counting after a custom name, and resets an empty name", async () => {
    const { projectId } = await newProject("2026-474 Sociolla SBW R1");
    const d3 = await phaseOf(projectId, "design3d");
    const name = async (id: string) => (await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id } })).name;
    const first = await sf.phases.addIteration({ ...as(designer), projectId, phaseId: d3.id });
    assert.equal(await name(first.iterationId), "2026-474 Sociolla SBW R1 D1");
    await sf.phases.renameIteration({ ...as(designer), projectId, phaseId: d3.id, iterationId: first.iterationId, name: "Lobby option" });
    const base = { ...as(designer), projectId, phaseId: d3.id, iterationId: first.iterationId };
    await sf.phases.sendIteration(base);
    await sf.phases.recordClientAnswer(base);
    const second = await sf.phases.chooseIterationOutcome({ ...base, outcome: "REVISION" }) as { nextIterationId: string };
    assert.equal(await name(second.nextIterationId), "2026-474 Sociolla SBW R1 D2", "the number continues, whatever the first one is called");
    await sf.phases.renameIteration({ ...as(designer), projectId, phaseId: d3.id, iterationId: first.iterationId, name: "   " });
    assert.equal(await name(first.iterationId), "2026-474 Sociolla SBW R1 D1", "an empty name resets to the default");
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: d3.id });
    assert.deepEqual(detail.iterations.map((it) => it.shortName).sort(), ["D1", "D2"]);
  });

  it("keeps the line breaks of a note (lists, headings and check items)", async () => {
    const { projectId } = await newProject("Note lists");
    const mb = await phaseOf(projectId, "moodboard");
    const text = "## Plan\n\n- [ ] Check marble\n- [x] Order sample\n\n1. First\n2. Second";
    const { noteId } = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: mb.id, body: `  ${text}  ` });
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } })).body, text);
  });

  it("refuses a second active requirement with the same text on one phase", async () => {
    const first = await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Ukuran Videotron" });
    await rejectsWith(sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "  ukuran   videotron " }), "TEMPLATE_LABEL_DUPLICATE");
    // The same text on another phase is a different requirement.
    await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.layout, label: "Ukuran Videotron" });
    const other = await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Logo Project" });
    await rejectsWith(sf.tasks.updateTemplate({ ...as(designer), templateId: other.templateId, label: "Ukuran Videotron" }), "TEMPLATE_LABEL_DUPLICATE");
    // A switched-off template does not count, and may not be switched back on while the text is taken.
    await sf.tasks.updateTemplate({ ...as(designer), templateId: first.templateId, isActive: false });
    const again = await sf.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Ukuran Videotron" });
    await rejectsWith(sf.tasks.updateTemplate({ ...as(designer), templateId: first.templateId, isActive: true }), "TEMPLATE_LABEL_DUPLICATE");
    assert.ok(again.templateId);
  });

  it("keeps one requirement when the same text is submitted twice at once (production serializable runner)", async () => {
    const db = testDb.prisma;
    const serial = createStudioFlowService(db, {
      runTransaction: (work) => runSerializableTransaction(db, work),
      auditWriter: createAuditEventWriter(), people: createPeopleDirectory(db), storage,
      notificationWriter: createNotificationWriter(), masterData: createMasterDataPublicRead(db), now: () => clock,
    });
    const submit = () => serial.tasks.createTemplate({ ...as(designer), definitionId: LEGACY.moodboard, label: "Double Submit" });
    const results = await Promise.allSettled(Array.from({ length: 4 }, submit));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await db.sfChecklistTemplate.count({ where: { definition_id: LEGACY.moodboard, label: "Double Submit", is_active: true } }), 1);
  });

  it("chains CD Mall to CD Final using the migrated data shape and undoes the continuation", async () => {
    const { projectId } = await newProject("CD chain");
    const cd = await phaseOf(projectId, "cd");
    await testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.cd }, data: { default_iteration_kinds: [{ name: "Shop Drawing" }, { name: "As Built" }] } });
    const mall = await sf.phases.addIteration({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id });
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: mall.iterationId } })).name, "CD Mall", "the existing project keeps its snapshotted step names after the template changes");
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

  it("runs a custom two-step phase by its own step names, not by CD Mall/CD Final (audit 2026-10-12)", async () => {
    await testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.moodboard }, data: { default_iteration_kinds: [{ name: "Concept Study" }, { name: "Final Concept" }] } });
    const { projectId } = await newProject("Custom two-step");
    const moodboard = await phaseOf(projectId, "moodboard");
    const study = await openIteration(moodboard.id);
    assert.equal(study.name, "Concept Study");
    const base = { ...as(designer), projectId, phaseId: moodboard.id, iterationId: study.id };
    await sf.phases.sendIteration(base);
    await sf.phases.recordClientAnswer(base);
    await assert.rejects(sf.phases.chooseIterationOutcome({ ...base, outcome: "DONE" }), (error: unknown) => error instanceof AppError && error.code === "PHASE_INVALID_STATE" && /Concept Study must be revised or continued to Final Concept/.test(error.message));
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: moodboard.id });
    assert.equal(detail.currentIteration!.nextStepName, "Final Concept");
    const card = (await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((c) => c.id === projectId)!.phases.find((p) => p.id === moodboard.id)!;
    assert.equal(card.current_iteration!.next_step_name, "Final Concept");
    const next = await sf.phases.chooseIterationOutcome({ ...base, outcome: "CONTINUE_CD_FINAL" }) as { nextIterationId: string };
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: next.nextIterationId } })).name, "Final Concept");
    const finalBase = { ...base, iterationId: next.nextIterationId };
    await sf.phases.sendIteration(finalBase);
    await sf.phases.recordClientAnswer(finalBase);
    await sf.phases.chooseIterationOutcome({ ...finalBase, outcome: "DONE" });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: moodboard.id } })).status, "DONE");
  });

  it("refuses a third iteration kind: a phase has at most two steps (owner 2026-10-13)", async () => {
    await assert.rejects(testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.cd }, data: { default_iteration_kinds: [{ name: "Draft" }, { name: "Review" }, { name: "Issue" }] } }), /sf_phase_definition_iteration_kinds_max_two/);
    await testDb.prisma.sfPhaseDefinition.update({ where: { id: LEGACY.cd }, data: { default_iteration_kinds: [{ name: "CD Mall" }, { name: "CD Final" }] } });
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
    assert.equal(back.status, "ANSWERED");
    assert.deepEqual((await testDb.prisma.sfWorkspaceCard.findMany({ where: { phase_id: mb.id } })).map((note) => [note.iteration_id, note.body]), [[first.id, "Warmer palette"]], "undoing the outcome keeps what the client said");
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
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: supervision.id });
    assert.deepEqual(detail.currentIteration?.choices, ["next_visit", "done"]);
    assert.equal(detail.isSupervision, true);
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, iterationId: visit.iterationId, outcome: "NEXT_VISIT" });
    await sf.phases.createSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, visitDate: "2026-09-27", note: null });
    const second = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: supervision.id, status: "NOT_SENT" } });
    await sf.phases.chooseSupervisionVisit({ ...as(designer), projectId, phaseId: supervision.id, iterationId: second.id, outcome: "DONE" });
    assert.equal((await testDb.prisma.sfPhase.findUniqueOrThrow({ where: { id: supervision.id } })).status, "DONE");
    assert.equal((await sf.projects.getProject({ grants: ALL, actorId: designer.id, projectId })).status, "ACTIVE", "finishing the last phase never completes the project");
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

    const warm = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, body: "Client prefers warm tones" });
    await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, body: "Not starred" });
    await sf.workspace.setWorkspaceCardFlags({ ...as(designer), projectId, cardId: warm.noteId, pinned: true, version: await noteVersion(warm.noteId) });
    const starred = await sf.phases.listStarredPhaseNotes({ grants: ALL, projectId });
    assert.deepEqual(starred.filter((item) => item.notes.length).map((item) => [item.phaseName, item.notes.map((note) => note.body)]), [["Moodboard", ["Client prefers warm tones"]]]);
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
    const found = await sf.projects.quickSearch({ grants: ALL, actorId: designer.id, search: "house" });
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
    assert.deepEqual(first.milestones, { designFinal: "2026-10-19", cdMallStart: "2026-10-19", cdFinalStart: "2026-10-19", end: "2026-10-26", fitOutStart: "2026-11-02", handover: "2026-12-28", openingForecast: "2027-01-11" });
    assert.deepEqual(await planned(projectId, "design3d"), { id: (await phaseOf(projectId, "design3d")).id, start: null, end: "2026-10-19", manual: false });
    assert.deepEqual(await planned(projectId, "cd").then(({ start, end }) => [start, end]), ["2026-10-19", "2026-10-26"]);
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
    assert.deepEqual(await planned(projectId, "cd"), { id: cd.id, start: "2026-10-19", end: "2026-10-26", manual: false });
    await rejectsWith(sf.projects.resetPhasePlannedDates({ ...as(designer), projectId, phaseId: (await phaseOf(projectId, "moodboard")).id }), "PHASE_NOT_PLANNED");
  });

  it("needs a Fit Out Start and Platform Owner override authority", async () => {
    const { projectId } = await newProject("Plan guards");
    await rejectsWith(sf.projects.applyProjectPlan({ ...as(designer), projectId }), "DESIGN_HANDOVER_REQUIRED");
    await sf.projects.setFitOutStart({ ...as(designer), projectId, fitOutStartDate: "2026-11-02" });
    const managerGrants = ALL.filter((grant) => grant !== P.projectOverride);
    await rejectsWith(sf.projects.setDesignHandover({ ...as(designer, managerGrants), projectId, designHandoverDate: "2026-12-28" }), "PERMISSION_DENIED");
    await sf.projects.setDesignHandover({ ...as(designer), projectId, designHandoverDate: "2026-12-28" });
    assert.equal((await sf.projects.getProjectPlan({ grants: ALL, projectId })).designHandoverDate, "2026-12-28");
    await rejectsWith(sf.projects.applyProjectPlan({ ...as(designer, managerGrants), projectId }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.setPlanOverrides({ ...as(designer, managerGrants), projectId, overrides: { gap: 3 } }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.applyProjectPlan({ ...as(drafter, DRAFTER_GRANTS), projectId }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.setPlanOverrides({ ...as(drafter, DRAFTER_GRANTS), projectId, overrides: { gap: 3 } }), "PERMISSION_DENIED");
    await rejectsWith(sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: { gap: 0 } }), "PLAN_OVERRIDES_INVALID");
  });

  it("lists the same plan milestones the project plan computes, including overrides", async () => {
    const { projectId } = await newProject("Plan list milestones");
    const listed = async () => (await sf.projects.listProjects({ grants: ALL })).find((project) => project.id === projectId)!;
    assert.equal((await listed()).planMilestones, null, "no anchor, no computed milestones");
    await sf.projects.setDesignHandover({ ...as(designer), projectId, designHandoverDate: "2026-12-28" });
    await sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: { cdFinal: 10 } });
    const plan = (await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!;
    assert.deepEqual((await listed()).planMilestones, plan);
    assert.notEqual(plan.cdFinalStart, plan.end, "CD Final and END are distinct milestones");
  });

  it("a project override moves only the dates that depend on that interval", async () => {
    const projectId = await withFitOut("Plan override");
    const before = (await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!;
    await sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: { cdFinal: 10 } });
    const after = await sf.projects.getProjectPlan({ grants: ALL, projectId });
    assert.equal(after.intervals.cdFinal, 10);
    assert.equal(after.intervals.cdMall, 0);
    assert.deepEqual([after.milestones!.end, after.milestones!.handover, after.milestones!.openingForecast], [before.end, before.handover, before.openingForecast]);
    assert.equal(after.milestones!.cdFinalStart, "2026-10-12");
    assert.equal(after.milestones!.designFinal, "2026-10-12");
    await sf.projects.setPlanOverrides({ ...as(designer), projectId, overrides: null });
    assert.deepEqual((await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones, before);
  });

  it("studio defaults and the holiday list change the result, and a duplicate holiday is refused", async () => {
    const projectId = await withFitOut("Plan holidays");
    await sf.projects.addHoliday({ ...as(designer), date: "2026-10-22", label: "Cuti" });
    await rejectsWith(sf.projects.addHoliday({ ...as(designer), date: "2026-10-22", label: "Again" }), "HOLIDAY_EXISTS");
    await rejectsWith(sf.projects.addHoliday({ ...as(drafter, DRAFTER_GRANTS), date: "2026-10-23", label: "No" }), "PERMISSION_DENIED");
    const held = (await sf.projects.getProjectPlan({ grants: ALL, projectId })).milestones!;
    assert.deepEqual([held.cdFinalStart, held.cdMallStart], ["2026-10-16", "2026-10-16"]);
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

describe("WO-SF-NOTEFEED-01 phase notes as messages", () => {
  afterEach(() => storage.objects.clear());

  async function setup() {
    const { projectId } = await newProject();
    const phase = await phaseOf(projectId, "moodboard");
    const iteration = await openIteration(phase.id);
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const { noteId } = await sf.phases.postPhaseNote({ ...base, body: "Client wants it warmer" });
    return { projectId, phase, iteration, base, noteId };
  }
  const jpeg = () => ({ body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), contentType: "image/jpeg" });
  /** The project's image elements, oldest first (WO-SF-WORKSPACE-04: each image is its own element). */
  const imageElements = (projectId: string) => testDb.prisma.sfWorkspaceCard.findMany({ where: { project_id: projectId, kind: "IMAGE" }, orderBy: [{ created_at: "asc" }, { id: "asc" }] });

  it("posts, edits, stars and marks a message without any phase event, and audits each change", async () => {
    const { projectId, iteration, base } = await setup();
    const before = await testDb.prisma.sfPhaseEvent.count({ where: { project_id: projectId } });
    const { noteId } = await sf.phases.postPhaseNote({ ...base, body: "Supplier quoted 3 weeks" });
    const posted = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } });
    assert.deepEqual([posted.body, posted.iteration_id, posted.author_id, posted.author_name, posted.is_pinned, posted.origin, posted.edited_at], ["Supplier quoted 3 weeks", iteration.id, designer.id, "Dina Designer", false, "NOTE", null]);
    await sf.workspace.updateWorkspaceCardText({ ...base, cardId: noteId, body: "Supplier quoted 2 weeks", version: await noteVersion(noteId) });
    await sf.workspace.setWorkspaceCardFlags({ ...base, cardId: noteId, pinned: true, clientAnswer: true, version: await noteVersion(noteId) });
    const edited = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } });
    assert.deepEqual([edited.body, edited.is_pinned, edited.origin, edited.edited_at !== null], ["Supplier quoted 2 weeks", true, "CLIENT_ANSWER", true]);
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId: noteId, body: " ", version: await noteVersion(noteId) }), "PHASE_NOTE_EMPTY");
    assert.equal(await testDb.prisma.sfPhaseEvent.count({ where: { project_id: projectId } }), before, "notes are not phase steps, so nothing is undoable");
    const actions = (await testDb.prisma.auditEvent.findMany({ where: { entity_id: noteId }, orderBy: { occurred_at: "asc" } })).map((event) => event.action);
    assert.deepEqual(actions, ["studioflow.workspace-card.created", "studioflow.workspace-card.edited", "studioflow.workspace-card.flags-changed"]);
  });

  it("posts each image as its own element with the phase and round labels, in one step", async () => {
    const { projectId, iteration, base } = await setup();
    const first = await sf.phases.postPhaseImage({ ...base, file: png() });
    const second = await sf.phases.postPhaseImage({ ...base, file: jpeg(), clientFeedback: true });
    const rows = await imageElements(projectId);
    assert.deepEqual(rows.map((row) => [row.id, row.kind, row.body, row.content_type, row.phase_id, row.iteration_id, row.origin, row.workflow_record, row.uploaded_by_name]).sort((x, y) => String(x[3]).localeCompare(String(y[3]))), [
      [second.imageId, "IMAGE", "", "image/jpeg", base.phaseId, iteration.id, "CLIENT_ANSWER", false, "Dina Designer"],
      [first.imageId, "IMAGE", "", "image/png", base.phaseId, iteration.id, "NOTE", false, "Dina Designer"],
    ]);
    for (const row of rows) {
      assert.ok(row.storage_key!.startsWith(`studioflow/notes/${projectId}/`));
      assert.ok(storage.objects.has(row.storage_key!));
    }
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.workspace-card.created", entity_id: { in: [first.imageId, second.imageId] } } }), 2);
    await rejectsWith(sf.phases.postPhaseNote({ ...base, body: " " }), "PHASE_NOTE_EMPTY");
  });

  it("refuses a bad type, a fake image and an oversize file, leaving no stored object behind", async () => {
    const { projectId, base } = await setup();
    await rejectsWith(sf.phases.postPhaseImage({ ...base, file: { body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4, 5]), contentType: "application/pdf" } }), "NOTE_IMAGE_TYPE");
    await rejectsWith(sf.phases.postPhaseImage({ ...base, file: { body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), contentType: "image/png" } }), "NOTE_IMAGE_TYPE");
    await rejectsWith(sf.phases.postPhaseImage({ ...base, file: { body: new Uint8Array(0), contentType: "image/png" } }), "NOTE_IMAGE_SIZE");
    const big = new Uint8Array(3 * 1024 * 1024 + 1); big.set(PNG);
    await rejectsWith(sf.phases.postPhaseImage({ ...base, file: { body: big, contentType: "image/png" } }), "NOTE_IMAGE_SIZE");
    assert.equal(storage.objects.size, 0);
    assert.equal((await imageElements(projectId)).length, 0);
  });

  it("deletes an image element and releases its object, keeping one something else references", async () => {
    const { projectId, base } = await setup();
    const a = await sf.phases.postPhaseImage({ ...base, file: png() });
    const b = await sf.phases.postPhaseImage({ ...base, file: png() });
    const rows = await imageElements(projectId);
    const keyA = rows.find((row) => row.id === a.imageId)!.storage_key;
    const keyB = rows.find((row) => row.id === b.imageId)!.storage_key;
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId: a.imageId, version: await noteVersion(a.imageId) });
    assert.equal(storage.objects.has(keyA!), false);
    assert.equal(await testDb.prisma.sfWorkspaceCard.count({ where: { id: a.imageId } }), 0);
    // Another row points at the same object: it must survive the removal.
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: base.projectId, section: "MATERIAL", category: "Floor", category_key: "floor", prefix: "FL", increment: 1, sort_order: 0 } });
    await testDb.prisma.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", product_name: "Floor", search_key: "floor", image_key: keyB! } });
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId: b.imageId, version: await noteVersion(b.imageId) });
    assert.ok(storage.objects.has(keyB!));
    await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...base, cardId: b.imageId, version: await noteVersion(b.imageId) }), "PHASE_NOTE_NOT_FOUND");
  });

  it("follows the phase-work rules: viewer, other seat, archived project and another project's message", async () => {
    const { projectId, phase, base, noteId } = await setup();
    await sf.phases.postPhaseImage({ ...base, file: png() });
    const viewer = await seedUser("Vera Viewer", [P.access, P.projectRead]);
    const asViewer = { ...as(viewer, [P.access, P.projectRead]), projectId, phaseId: phase.id };
    await rejectsWith(sf.phases.postPhaseNote({ ...asViewer, body: "x" }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.postPhaseImage({ ...asViewer, file: png() }), "PERMISSION_DENIED");
    await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...asViewer, cardId: noteId, pinned: true, version: await noteVersion(noteId) }), "PERMISSION_DENIED");
    // The drafter has no seat on the Moodboard phase.
    await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...as(drafter, DRAFTER_GRANTS), projectId, cardId: noteId, version: await noteVersion(noteId) }), "PERMISSION_DENIED");
    await rejectsWith(sf.phases.postPhaseImage({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: phase.id, file: png() }), "PERMISSION_DENIED");
    const other = await newProject("Other project");
    const otherPhase = await phaseOf(other.projectId, "moodboard");
    const otherBase = { ...as(designer), projectId: other.projectId, phaseId: otherPhase.id };
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...otherBase, cardId: noteId, body: "Hijack", version: await noteVersion(noteId) }), "PHASE_NOTE_NOT_FOUND");
    // Another project's phase is not reachable through this project.
    await rejectsWith(sf.phases.postPhaseImage({ ...base, phaseId: otherPhase.id, file: png() }), "PHASE_NOT_FOUND");
    assert.equal(storage.objects.size, 1, "a refused add stored nothing");
    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Paused" });
    await rejectsWith(sf.phases.postPhaseImage({ ...base, file: png() }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...base, cardId: noteId, version: await noteVersion(noteId) }), "PROJECT_ARCHIVED");
    assert.equal(storage.objects.size, 1);
  });

  it("accepts messages while the iteration is with the client and after it closed", async () => {
    const { iteration, base } = await setup();
    await sf.phases.sendIteration({ ...base, iterationId: iteration.id });
    await sf.phases.postPhaseNote({ ...base, body: "Client called while reviewing" });
    await sf.phases.recordClientAnswer({ ...base, iterationId: iteration.id });
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: iteration.id, outcome: "REVISION" });
    const { noteId } = await sf.phases.postPhaseNote({ ...base, body: "Started the revision" });
    const next = await openIteration(base.phaseId);
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } })).iteration_id, next.id);
  });

  it("reads messages with their images as signed links, and the card counts starred ones, never exposing a storage key", async () => {
    const { projectId, phase, base } = await setup();
    const one = await sf.phases.postPhaseImage({ ...base, file: png() });
    const two = await sf.phases.postPhaseImage({ ...base, file: jpeg() });
    const noteId = one.imageId;
    await sf.workspace.setWorkspaceCardFlags({ ...base, cardId: noteId, pinned: true, version: await noteVersion(noteId) });
    const detail = await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: phase.id });
    const shape = (images: ReadonlyArray<{ id: string; url: string | null; contentType: string; bytes: number }>) => images.map((image) => [image.id, image.contentType, image.bytes, image.url?.startsWith("https://storage.invalid/")]);
    const byType = (rows: unknown[][]) => rows.sort((x, y) => String(x[1]).localeCompare(String(y[1])));
    assert.deepEqual(byType(detail.notes.flatMap((note) => shape(note.images))), [[two.imageId, "image/jpeg", 8, true], [one.imageId, "image/png", PNG.byteLength, true]]);
    const card = (await sf.projects.listProjectCards({ grants: ALL, filter: "all" })).find((c) => c.id === projectId)!;
    assert.equal(card.phases.find((p) => p.id === phase.id)!.starred_notes, 1);
    const starred = await sf.phases.listStarredPhaseNotes({ grants: ALL, projectId });
    assert.deepEqual(starred.find((item) => item.phaseId === phase.id)!.notes.map((note) => [note.id, note.imageCount]), [[noteId, 1]]);
    const leaked = JSON.stringify([detail, card, starred]);
    for (const key of storage.objects.keys()) assert.equal(leaked.includes(key), false, "a storage key leaked into a read");
    assert.equal(leaked.includes("storage_key"), false);
  });

  it("counts messages as attached work: a never-sent iteration with notes is neither deleted nor silently dropped", async () => {
    const { phase, iteration, base, noteId } = await setup();
    await rejectsWith(sf.phases.deleteNeverSentIteration({ ...base, iterationId: iteration.id }), "ITERATION_HAS_ATTACHED_WORK");
    // Skipping the phase keeps an iteration that holds notes as closed history instead of deleting it.
    await sf.phases.bypassPhase({ ...base, reason: "Client supplied the concept" });
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } })).iteration_id, iteration.id);
    assert.equal(await testDb.prisma.sfRevision.count({ where: { phase_id: phase.id } }), 1);
  });

  it("keeps messages and their images when an admin resets the phase's iterations", async () => {
    const { phase, base, noteId } = await setup();
    await sf.phases.postPhaseImage({ ...base, file: png() });
    await sf.phases.overrideRevision({ ...base, mode: "HARD_RESET_ACTIVE", major: 3, note: "Align with client numbering" });
    assert.equal(storage.objects.size, 1);
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } })).iteration_id, null);
    assert.equal((await testDb.prisma.sfRevision.findMany({ where: { phase_id: phase.id } })).length, 1);
  });

  it("refuses to undo an iteration's creation once a message was written in it", async () => {
    const { phase, base } = await setup();
    await clientRound(base, "REVISION");
    await openIteration(phase.id);
    await sf.phases.postPhaseNote({ ...base, body: "First thoughts on the revision" });
    // The newest phase event is the revision that created the new iteration; undoing it would drop the message's label.
    const latest = await sf.phases.latestUndoableEvent({ grants: ALL, actor: designer.actor, projectId: base.projectId });
    assert.ok(latest);
    await rejectsWith(sf.phases.undoPhaseEvent({ ...as(designer), projectId: base.projectId, eventId: latest!.id }), "UNDO_HAS_NEWER_DATA");
  });
});

describe("WO-SF-IDEAS-01 personal Ideas board", () => {
  const cardImage = (seed: number) => ({ body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, seed, seed]), contentType: "image/png" });
  const bytesOf = (key: string) => [...(storage.objects.get(key)?.body ?? [])];

  it("requires the Ideas module permission in addition to base StudioFlow access", async () => {
    await rejectsWith(ideas.listIdeaCards(as(designer, [P.access, P.projectRead])), "PERMISSION_DENIED");
  });

  it("keeps a card private to its owner and valid with only an image", async () => {
    const other = await seedUser("Other Owner", ALL);
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(1) });
    const card = await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([card.title, card.source_url, card.note, card.owner_user_id], [null, null, null, designer.id]);
    assert.deepEqual((await ideas.listIdeaCards(as(designer))).map((row) => row.id), [cardId]);
    // Every permission is not enough: another user's card does not exist for them.
    assert.deepEqual(await ideas.listIdeaCards(as(other)), []);
    await rejectsWith(ideas.updateIdeaCard({ ...as(other), cardId, title: "Mine" }), "IDEA_CARD_NOT_FOUND");
    await rejectsWith(ideas.replaceIdeaImage({ ...as(other), cardId, file: cardImage(2) }), "IDEA_CARD_NOT_FOUND");
    await rejectsWith(ideas.deleteIdeaCard({ ...as(other), cardId }), "IDEA_CARD_NOT_FOUND");
    const { projectId } = await sf.projects.createProject({ ...as(other), name: "Other's project", newClientName: "Other", picDesignerId: other.id, picDrafterId: drafter.id, area: "10" });
    await rejectsWith(ideas.useIdeaInSchedule({ ...as(other), cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "Taken" } }), "IDEA_CARD_NOT_FOUND");
    await ideas.updateIdeaCard({ ...as(designer), cardId, title: "  Pink stone ", sourceUrl: "https://pinterest.com/pin/1", note: "Cashier wall?" });
    const [row] = await ideas.listIdeaCards(as(designer));
    assert.deepEqual([row.title, row.sourceUrl, row.note], ["Pink stone", "https://pinterest.com/pin/1", "Cashier wall?"]);
    await ideas.updateIdeaCard({ ...as(designer), cardId, sourceUrl: "" });
    assert.equal((await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } })).source_url, null);
  });

  it("stores a source link as text only and refuses anything but a web address", async () => {
    await rejectsWith(ideas.createIdeaCard({ ...as(designer), sourceUrl: "javascript:alert(1)", file: cardImage(1) }), "IDEA_URL_INVALID");
    await rejectsWith(ideas.createIdeaCard({ ...as(designer), sourceUrl: "data:text/html,x", file: cardImage(1) }), "IDEA_URL_INVALID");
    await rejectsWith(ideas.createIdeaCard({ ...as(designer), file: { body: new Uint8Array([1, 2, 3]), contentType: "image/png" } }), "IDEA_IMAGE_TYPE");
    assert.equal(await testDb.prisma.sfIdeaCard.count(), 0);
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), sourceUrl: "http://example.com/a", file: cardImage(1) });
    assert.equal((await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } })).source_url, "http://example.com/a");
  });

  it("uses a card as a new item and as an extra option, each with its own image copy, never final", async () => {
    const { projectId } = await newProject("Sociolla");
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), title: "Calacatta Viola", file: cardImage(5) });
    const cardKey = (await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } })).image_key;
    const existing = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone", snapshot: { productName: "Travertine" } });

    const asNew = await ideas.useIdeaInSchedule({ ...as(designer), cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "Calacatta Viola", notes: "Cashier" } });
    const asOption = await ideas.useIdeaInSchedule({ ...as(designer), cardId, projectId, target: { kind: "option", entryId: existing.entryId }, option: { productName: "Calacatta Viola" } });

    const entryOne = await testDb.prisma.sfScheduleEntry.findUniqueOrThrow({ where: { id: existing.entryId } });
    const newEntry = await testDb.prisma.sfScheduleEntry.findUniqueOrThrow({ where: { id: asNew.entryId } });
    assert.equal(newEntry.prefix, entryOne.prefix);
    assert.equal(newEntry.increment, entryOne.increment + 1);
    assert.equal(asNew.label, "A");
    assert.equal(asOption.label, "B");
    assert.equal(asOption.entryId, existing.entryId);

    const options = await testDb.prisma.sfScheduleOption.findMany({ where: { id: { in: [asNew.optionId, asOption.optionId] } } });
    for (const option of options) {
      assert.equal(option.is_final, false);
      assert.equal(option.status, "DRAFT");
      assert.equal(option.brand_id, null);
      assert.ok(option.image_key && option.image_key !== cardKey && option.image_key.startsWith(`studioflow/schedule/${projectId}/`));
      assert.deepEqual(bytesOf(option.image_key!), bytesOf(cardKey));
    }
    assert.notEqual(options[0].image_key, options[1].image_key);
    assert.equal(options.find((option) => option.id === asNew.optionId)!.notes, "Cashier");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.schedule.entry-created", entity_id: asNew.entryId } }), 1);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "ideas.card.used", entity_id: cardId } }), 2);

    const [card] = await ideas.listIdeaCards(as(designer));
    assert.deepEqual(card.usages.map((usage) => [usage.projectName, usage.code, usage.label]), [["Sociolla", asNew.code, "A"], ["Sociolla", asOption.code, "B"]]);

    // Replacing, then deleting the card leaves the schedule's own images in place.
    await ideas.replaceIdeaImage({ ...as(designer), cardId, file: cardImage(9) });
    assert.equal(storage.objects.has(cardKey), false);
    await ideas.deleteIdeaCard({ ...as(designer), cardId });
    for (const option of options) assert.ok(storage.objects.has(option.image_key!));
    assert.equal(await testDb.prisma.sfScheduleOption.count({ where: { id: { in: [asNew.optionId, asOption.optionId] } } }), 2);
  });

  it("reuses one Schedule placement when the same external operation is retried", async () => {
    const { projectId } = await newProject("Retry-safe Ideas");
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(5) });
    const operationId = randomUUID();
    const input = { ...as(designer), operationId, cardId, projectId, target: { kind: "new-item" as const, section: "MATERIAL", category: "Stone" }, option: { productName: "One placement" } };
    const first = await ideas.useIdeaInSchedule(input);
    const second = await ideas.useIdeaInSchedule(input);
    assert.deepEqual(second, first);
    assert.equal(await testDb.prisma.sfExternalSchedulePlacement.count({ where: { operation_id: operationId } }), 1);
    assert.equal(await testDb.prisma.sfScheduleOption.count({ where: { id: first.optionId } }), 1);
    assert.equal(await testDb.prisma.sfIdeaUsage.count({ where: { card_id: cardId, option_id: first.optionId } }), 1);
  });

  it("keeps a successful Schedule placement and reports when its Ideas usage history cannot be written", async () => {
    const { projectId } = await newProject("Usage history failure");
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(5) });
    let transaction = 0;
    const bridge = createStudioFlowIdeasBridge(testDb.prisma, {
      runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => testDb.prisma.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(), people: createPeopleDirectory(testDb.prisma), storage,
      notificationWriter: createNotificationWriter(), masterData: createMasterDataPublicRead(testDb.prisma), now: () => clock,
    });
    const fragile = createIdeaService(testDb.prisma, {
      auditWriter: createAuditEventWriter(), storage, studioFlow: bridge,
      runTransaction: async <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => {
        transaction += 1;
        if (transaction === 1) throw new Error("usage database unavailable");
        return testDb.prisma.$transaction((tx) => work(tx));
      },
    });
    const placed = await fragile.useIdeaInSchedule({ ...as(designer), cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "Still placed" } });
    assert.equal(await testDb.prisma.sfScheduleOption.count({ where: { id: placed.optionId } }), 1);
    assert.equal(await testDb.prisma.sfIdeaUsage.count({ where: { card_id: cardId, option_id: placed.optionId } }), 0);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "ideas.card.usage-record-failed", entity_id: cardId } }), 1);
  });

  it("retries an Ideas card object cleanup that storage initially refused", async () => {
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(5) });
    const key = (await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } })).image_key;
    const failing = mock.method(storage, "remove", async () => { throw new Error("disk unavailable"); });
    try { await ideas.deleteIdeaCard({ ...as(designer), cardId }); } finally { failing.mock.restore(); }
    assert.equal(storage.objects.has(key), true);
    assert.equal((await testDb.prisma.ideaAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: key } })).resolved_at, null);
    assert.deepEqual(await ideas.retryAssetCleanup(), { attempted: 1, resolved: 1, failed: 0 });
    assert.equal(storage.objects.has(key), false);
  });

  it("copies a phase-note image to the caller's Ideas board or into that project's schedule, leaving the note alone", async () => {
    const { projectId } = await newProject("Note source");
    const phase = await phaseOf(projectId, "moodboard");
    await openIteration(phase.id);
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const { imageId: noteId } = await sf.phases.postPhaseImage({ ...base, file: png() });
    const image = (await testDb.prisma.sfWorkspaceCard.findFirstOrThrow({ where: { id: noteId, kind: "IMAGE" }, select: { id: true, storage_key: true } })) as { id: string; storage_key: string };

    const saved = await ideas.saveNoteImageToIdeas({ ...base, imageId: image.id });
    const card = await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: saved.cardId } });
    assert.equal(card.owner_user_id, designer.id);
    assert.notEqual(card.image_key, image.storage_key);
    assert.deepEqual(bytesOf(card.image_key), bytesOf(image.storage_key));
    assert.match(card.note ?? "", /Note source/);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "ideas.card.created", entity_id: card.id } }), 1);

    const placed = await ideas.useNoteImageInSchedule({ ...base, imageId: image.id, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "From the notes" } });
    const option = await testDb.prisma.sfScheduleOption.findUniqueOrThrow({ where: { id: placed.optionId } });
    assert.ok(option.image_key && option.image_key !== image.storage_key && option.image_key.startsWith(`studioflow/schedule/${projectId}/`));
    assert.deepEqual(bytesOf(option.image_key), bytesOf(image.storage_key));
    assert.equal(option.is_final, false);
    assert.equal(await testDb.prisma.sfIdeaUsage.count({ where: { option_id: option.id } }), 0, "a note image is not a card, so no usage row");

    // The note keeps its image; deleting the card or the option never touches it.
    await ideas.deleteIdeaCard({ ...as(designer), cardId: saved.cardId });
    assert.ok(storage.objects.has(image.storage_key));
    // Another phase's or another project's image id is not reachable through this note's route.
    const other = await newProject("Other note source");
    await rejectsWith(ideas.saveNoteImageToIdeas({ ...as(designer), projectId: other.projectId, phaseId: phase.id, imageId: image.id }), "NOTE_IMAGE_NOT_FOUND");
  });

  it("adds an Ideas card to the project's Moodboard board, creating it once and copying the image", async () => {
    const { projectId } = await newProject("Moodboard project");
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(7) });
    const cardKey = (await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } })).image_key;

    const first = await presentation.addStoredImageToMoodboard({ ...as(designer), projectId, source: await ideas.readIdeaImageSource({ ...as(designer), cardId }) });
    assert.equal(first.created, true);
    const board = await testDb.prisma.sfPresentationBoard.findUniqueOrThrow({ where: { id: first.boardId } });
    assert.equal(board.title, "Moodboard");
    const slide = await testDb.prisma.sfPresentationSlideImage.findFirstOrThrow({ where: { slide_id: first.slideId } });
    assert.ok(slide.image_key !== cardKey && slide.image_key.startsWith(`presentation/${projectId}/`));
    assert.deepEqual(bytesOf(slide.image_key), bytesOf(cardKey));

    // Another person's card is not reachable.
    const other = await seedUser("Other Mood", ALL);
    const mine = await ideas.createIdeaCard({ ...as(designer), file: cardImage(8) });
    await rejectsWith(ideas.readIdeaImageSource({ ...as(other), cardId: mine.cardId }), "IDEA_CARD_NOT_FOUND");
  });

  it("adds a Workspace image to Moodboard while Ideas is disabled", async () => {
    await testDb.prisma.moduleState.createMany({ data: [
      { module_id: "ideas", state: "DISABLED", last_version: "1.0.0", updated_by: "test" },
      { module_id: "presentation", state: "ENABLED", last_version: "1.0.0", updated_by: "test" },
    ] });
    assert.deepEqual(
      await testDb.prisma.moduleState.findMany({ orderBy: { module_id: "asc" }, select: { module_id: true, state: true } }),
      [{ module_id: "ideas", state: "DISABLED" }, { module_id: "presentation", state: "ENABLED" }],
    );

    const { projectId } = await newProject("Moodboard note source");
    const phase = await phaseOf(projectId, "moodboard");
    await openIteration(phase.id);
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const { imageId: noteId } = await sf.phases.postPhaseImage({ ...base, file: png() });
    const image = (await testDb.prisma.sfWorkspaceCard.findFirstOrThrow({ where: { id: noteId, kind: "IMAGE" }, select: { id: true, storage_key: true } })) as { id: string; storage_key: string };
    const bridge = createStudioFlowPresentationBridge(testDb.prisma);
    const restrictedGrants = ALL.filter((grant) => grant !== P.projectManage);
    const restrictedViewer = await seedUser("Workspace image restricted viewer", restrictedGrants);
    const restrictedInput = { ...as(restrictedViewer, restrictedGrants), projectId, phaseId: phase.id, imageId: image.id };
    await rejectsWith(bridge.readWorkspaceImageSource(restrictedInput), "PERMISSION_DENIED");
    await rejectsWith(ideas.saveNoteImageToIdeas(restrictedInput), "PERMISSION_DENIED");
    const first = await presentation.addStoredImageToMoodboard({ ...as(designer), projectId, source: await bridge.readWorkspaceImageSource({ ...base, imageId: image.id }) });
    assert.equal(first.created, true);

    // A board the team already named "moodboard" (any letter case) is reused, never duplicated; the next slide goes last.
    await testDb.prisma.sfPresentationBoard.update({ where: { id: first.boardId }, data: { title: "moodboard" } });
    const second = await presentation.addStoredImageToMoodboard({ ...as(designer), projectId, source: await bridge.readWorkspaceImageSource({ ...base, imageId: image.id }) });
    assert.deepEqual([second.created, second.boardId], [false, first.boardId]);
    const slides = await testDb.prisma.sfPresentationSlide.findMany({ where: { board_id: first.boardId }, orderBy: { sort_order: "asc" } });
    assert.deepEqual(slides.map((row) => row.id), [first.slideId, second.slideId]);
    assert.equal(await testDb.prisma.sfPresentationBoard.count({ where: { project_id: projectId } }), 1);

    // Deleting the note never touches the slides' own copies.
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId: image.id, version: await noteVersion(image.id) });
    for (const row of await testDb.prisma.sfPresentationSlideImage.findMany({ where: { slide_id: { in: slides.map((slide) => slide.id) } } })) assert.ok(storage.objects.has(row.image_key));
  });

  it("shows the current code after a reorder and drops a usage whose option is deleted, keeping the card", async () => {
    const { projectId } = await newProject("Reorder project");
    const first = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Stone", snapshot: { productName: "First" } });
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(3) });
    const used = await ideas.useIdeaInSchedule({ ...as(designer), cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "Second" } });
    const before = (await ideas.listIdeaCards(as(designer)))[0].usages[0].code;
    const prefix = (await testDb.prisma.sfScheduleEntry.findUniqueOrThrow({ where: { id: used.entryId } })).prefix;
    await sf.schedule.reorderEntries({ ...as(designer), projectId, section: "MATERIAL", prefix, orderedIds: [used.entryId, first.entryId] });
    const after = (await ideas.listIdeaCards(as(designer)))[0].usages[0].code;
    assert.notEqual(after, before);
    const entry = await testDb.prisma.sfScheduleEntry.findUniqueOrThrow({ where: { id: used.entryId } });
    assert.equal(entry.increment, 1);
    assert.ok(after.endsWith("01"), after);

    await sf.schedule.deleteOption({ ...as(designer), projectId, optionId: used.optionId });
    const [card] = await ideas.listIdeaCards(as(designer));
    assert.equal(card.id, cardId);
    assert.deepEqual(card.usages, []);
    assert.ok(storage.objects.has((await testDb.prisma.sfIdeaCard.findUniqueOrThrow({ where: { id: cardId } })).image_key));
  });

  it("offers and allows only the projects the user holds, never a completed or archived one", async () => {
    const outsiderGrants = [P.access, P.projectRead, P.scheduleManage, P.ideasManage];
    const outsider = await seedUser("Outside Designer", outsiderGrants);
    const held = await newProject("Held project");
    const completed = await newProject("Completed project");
    const archived = await newProject("Archived project");
    await testDb.prisma.sfProject.update({ where: { id: completed.projectId }, data: { status: "COMPLETED" } });
    await testDb.prisma.sfProject.update({ where: { id: archived.projectId }, data: { archived_at: new Date() } });
    assert.deepEqual((await ideas.listIdeaTargets(as(designer))).map((project) => project.name), ["Held project"]);
    assert.deepEqual(await ideas.listIdeaTargets(as(outsider, outsiderGrants)), []);
    // A manager override holds every open project.
    assert.deepEqual((await ideas.listIdeaTargets(as(outsider))).map((project) => project.name), ["Held project"]);
    // The drafter has no schedule permission in this fixture.
    assert.deepEqual(await ideas.listIdeaTargets(as(drafter, DRAFTER_GRANTS)), []);

    const mine = await ideas.createIdeaCard({ ...as(outsider, outsiderGrants), file: cardImage(4) });
    const use = (projectId: string) => ideas.useIdeaInSchedule({ ...as(outsider, outsiderGrants), cardId: mine.cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "X" } });
    await rejectsWith(use(held.projectId), "PERMISSION_DENIED");
    const designerCard = await ideas.createIdeaCard({ ...as(designer), file: cardImage(6) });
    const scheduleObjects = () => [...storage.objects.keys()].filter((key) => key.startsWith("studioflow/schedule/")).length;
    const objectsBefore = scheduleObjects();
    const useAsDesigner = (projectId: string) => ideas.useIdeaInSchedule({ ...as(designer), cardId: designerCard.cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "X" } });
    await rejectsWith(useAsDesigner(completed.projectId), "PROJECT_COMPLETED");
    await rejectsWith(useAsDesigner(archived.projectId), "PROJECT_ARCHIVED");
    assert.equal(await testDb.prisma.sfIdeaUsage.count(), 0);
    assert.equal(scheduleObjects(), objectsBefore);
  });

  it("leaves no row, usage or copied object when the use fails inside the transaction", async () => {
    const { projectId } = await newProject("Failing use");
    const other = await newProject("Not this one");
    const foreign = await sf.schedule.createEntry({ ...as(designer), projectId: other.projectId, section: "MATERIAL", category: "Stone", snapshot: { productName: "Elsewhere" } });
    const { cardId } = await ideas.createIdeaCard({ ...as(designer), file: cardImage(7) });
    const before = { entries: await testDb.prisma.sfScheduleEntry.count(), options: await testDb.prisma.sfScheduleOption.count(), objects: storage.objects.size };
    // An entry of another project, and a product name the schedule refuses, both fail after the image copy.
    await rejectsWith(ideas.useIdeaInSchedule({ ...as(designer), cardId, projectId, target: { kind: "option", entryId: foreign.entryId }, option: { productName: "X" } }), "SCHEDULE_ITEM_NOT_FOUND");
    await assert.rejects(ideas.useIdeaInSchedule({ ...as(designer), cardId, projectId, target: { kind: "new-item", section: "MATERIAL", category: "Stone" }, option: { productName: "   " } }));
    assert.deepEqual({ entries: await testDb.prisma.sfScheduleEntry.count(), options: await testDb.prisma.sfScheduleOption.count(), objects: storage.objects.size }, before);
    assert.equal(await testDb.prisma.sfIdeaUsage.count(), 0);
  });
});

describe("WO-SF-WORKSPACE-01 project Workspace", () => {
  afterEach(() => storage.objects.clear());

  async function setup(name = "Heloskin Cimanggu") {
    const { projectId } = await newProject(name);
    const moodboard = await phaseOf(projectId, "moodboard");
    const cd = await phaseOf(projectId, "cd");
    return { projectId, moodboard, cd, base: { ...as(designer), projectId } };
  }

  it("keeps Notes, Workspace, phase detail and Deliverable reads private to assigned PICs and managers while Schedule item search stays readable", async () => {
    const { projectId, moodboard, base } = await setup("Private workspace reads");
    const entry = await sf.schedule.createEntry({ ...base, section: "MATERIAL", category: "Paint", snapshot: { productName: "Private palette" } });
    await sf.workspace.createWorkspaceCard({ ...base, body: "Private note", tags: ["palette"], itemEntryIds: [entry.entryId] });
    await sf.workspace.createWorkspaceImage({ ...base, file: png() });
    await sf.workspace.postThreadMessage({ ...base, phaseId: moodboard.id, thread: { x: 10, y: 20 }, body: "Private thread" });

    const readGrants = [P.access, P.projectRead];
    const outsider = await seedUser("Workspace read outsider", readGrants);
    const restricted = { grants: readGrants, actorId: outsider.id, projectId };
    const signedRead = mock.method(storage, "createSignedReadUrl", async () => "https://test.invalid/private");
    try {
      for (const read of [
        () => sf.workspace.readWorkspace(restricted),
        () => sf.workspace.listWorkspaceThreads(restricted),
        () => sf.workspace.listProjectNotes(restricted),
        () => sf.workspace.listNoteTags(restricted),
        () => sf.workspace.listNotesForItem({ ...restricted, entryId: entry.entryId }),
        () => sf.phases.getPhaseDetail({ ...restricted, phaseId: moodboard.id }),
        () => sf.phases.listDeliverables({ ...restricted, phaseId: moodboard.id }),
      ]) await rejectsWith(read(), "PERMISSION_DENIED");
      assert.equal(signedRead.mock.callCount(), 0, "assignment refusal happens before private asset URLs are signed");
    } finally {
      signedRead.mock.restore();
    }

    assert.equal((await sf.workspace.searchNoteItems({ grants: readGrants, projectId, query: "palette" }))[0]?.entryId, entry.entryId, "Schedule-derived search retains its read-only contract");

    const manager = await seedUser("Workspace read manager", [...readGrants, P.projectManage]);
    for (const allowed of [
      { grants: readGrants, actorId: designer.id, projectId },
      { grants: readGrants, actorId: drafter.id, projectId },
      { grants: [...readGrants, P.projectManage], actorId: manager.id, projectId },
    ]) {
      assert.equal((await sf.workspace.readWorkspace(allowed)).length, 2);
      assert.equal((await sf.workspace.listWorkspaceThreads(allowed)).length, 1);
      assert.equal((await sf.workspace.listProjectNotes(allowed)).notes.length, 3);
      assert.deepEqual(await sf.workspace.listNoteTags(allowed), [{ name: "palette", count: 1 }]);
      assert.equal((await sf.workspace.listNotesForItem({ ...allowed, entryId: entry.entryId }))[0]?.body, "Private note");
      assert.equal((await sf.phases.getPhaseDetail({ ...allowed, phaseId: moodboard.id })).id, moodboard.id);
      assert.deepEqual((await sf.phases.listDeliverables({ ...allowed, phaseId: moodboard.id })).items, []);
    }
  });

  it("holds every element in the project's one default section, created once even for concurrent first elements", async () => {
    const { projectId, moodboard, base } = await setup();
    const [first, second] = await Promise.all([
      sf.workspace.createWorkspaceCard({ ...base, body: "Client prefers warm wood" }),
      sf.workspace.createWorkspaceCard({ ...base, body: "Second concurrent card" }),
    ]);
    const sections = await testDb.prisma.sfWorkspaceSection.findMany({ where: { project_id: projectId } });
    assert.deepEqual(sections.map((section) => section.system_key), ["DEFAULT"], "a project has exactly one, system-made section");
    const labelled = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Terrazzo sample" });
    const labelledRow = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: labelled.cardId } });
    assert.equal(labelledRow.section_id, sections[0]!.id);
    assert.equal(labelledRow.iteration_id, (await openIteration(moodboard.id)).id, "a phase-labelled card takes the phase's latest round as its round label");

    const board = await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId });
    assert.deepEqual(board.map((card) => card.id).sort(), [first.cardId, second.cardId, labelled.cardId].sort());
    assert.deepEqual(board.map((card) => card.sortOrder).sort(), [0, 1, 2]);
    assert.ok(!("sectionId" in board[0]!), "the board read has no sections");
    const events = await testDb.prisma.auditEvent.findMany({ where: { action: { startsWith: "studioflow.workspace-" } } });
    assert.ok(events.some((event) => {
      const metadata = event.metadata as { projectId?: string; isDefault?: boolean; bySystem?: boolean };
      return event.action === "studioflow.workspace-section.created" && event.entity_id === sections[0]!.id && metadata.projectId === projectId && metadata.isDefault === true && metadata.bySystem === true;
    }));
    for (const event of events) assert.doesNotMatch(JSON.stringify(event.metadata), /warm wood|Terrazzo/, "audit never carries card text");
  });

  it("filters by phase label, sets and clears the label (clearing the round too), and refuses another project's phase", async () => {
    const { projectId, moodboard, cd, base } = await setup();
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Palette" });
    await sf.workspace.createWorkspaceCard({ ...base, body: "General" });
    assert.deepEqual((await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId, phaseId: moodboard.id })).map((card) => card.id), [cardId]);
    assert.equal((await sf.phases.getPhaseDetail({ grants: ALL, actorId: MANAGER_READER, projectId, phaseId: moodboard.id })).notes.length, 1, "the phase notes feed shows only its own cards");

    let version = (await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } })).version;
    ({ version } = await sf.workspace.setWorkspaceCardPhase({ ...base, cardId, phaseId: cd.id, version }));
    let row = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([row.phase_id, row.iteration_id], [cd.id, null], "a new phase label drops the old round label");
    ({ version } = await sf.workspace.setWorkspaceCardPhase({ ...base, cardId, phaseId: null, version }));
    row = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([row.phase_id, row.iteration_id], [null, null]);

    const other = await newProject("Other project");
    const foreignPhase = await phaseOf(other.projectId, "moodboard");
    await rejectsWith(sf.workspace.setWorkspaceCardPhase({ ...base, cardId, phaseId: foreignPhase.id, version }), "WORKSPACE_PHASE_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, phaseId: foreignPhase.id, body: "x" }), "WORKSPACE_PHASE_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceImage({ ...base, phaseId: foreignPhase.id, file: png() }), "WORKSPACE_PHASE_INVALID");
    assert.equal(storage.objects.size, 0, "a refused label stores nothing");
  });

  it("refuses a write naming an older version and changes nothing", async () => {
    const { projectId, base } = await setup();
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, body: "First" });
    const read = (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId }))[0]!;
    const saved = await sf.workspace.updateWorkspaceCardText({ ...base, cardId, body: "Second", version: read.version });
    assert.equal(saved.version, read.version + 1);
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId, body: "Stale edit", version: read.version }), "WORKSPACE_CARD_STALE");
    await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...base, cardId, pinned: true, version: read.version }), "WORKSPACE_CARD_STALE");
    await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...base, cardId, version: read.version }), "WORKSPACE_CARD_STALE");
    const row = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([row.body, row.is_pinned], ["Second", false]);
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId, version: saved.version });
    assert.equal(await testDb.prisma.sfWorkspaceCard.count({ where: { id: cardId } }), 0);
  });

  it("gates unlabelled cards on the project's document people and labelled cards on the phase rule", async () => {
    const { projectId, moodboard, cd, base } = await setup();
    const unassignedGrants = ALL.filter((grant) => grant !== P.projectOverride);
    const outsider = await seedUser("Workspace outsider", unassignedGrants);
    const viewer = await seedUser("Workspace viewer", [P.access, P.projectRead]);
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...as(outsider, unassignedGrants), projectId, body: "x" }), "PERMISSION_DENIED");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...as(viewer, [P.access, P.projectRead]), projectId, body: "x" }), "PERMISSION_DENIED");
    // The drafter may write a general card and a card on the drafter's phase, but not on the designer's Moodboard.
    await sf.workspace.createWorkspaceCard({ ...as(drafter, DRAFTER_GRANTS), projectId, body: "Drafter general" });
    await sf.workspace.createWorkspaceCard({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, body: "Drafter CD" });
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, body: "x" }), "PERMISSION_DENIED");
    const general = await sf.workspace.createWorkspaceCard({ ...base, body: "Designer general" });
    const version = (await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: general.cardId } })).version;
    await rejectsWith(sf.workspace.setWorkspaceCardPhase({ ...as(drafter, DRAFTER_GRANTS), projectId, cardId: general.cardId, phaseId: moodboard.id, version }), "PERMISSION_DENIED");
    assert.equal((await sf.workspace.readWorkspace({ grants: [P.access, P.projectRead], actorId: designer.id, projectId })).length, 3, "assigned readers see every card");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: clock } });
    await assert.rejects(sf.workspace.createWorkspaceCard({ ...base, body: "after archive" }));
  });

  it("puts a client answer and a site visit on the board with their labels, atomically, as the step's record", async () => {
    const { projectId, moodboard, base } = await setup();
    await sf.workspace.createWorkspaceCard({ ...base, body: "Creates the default" });
    const defaultSection = await testDb.prisma.sfWorkspaceSection.findFirstOrThrow({ where: { project_id: projectId } });
    const iteration = await openIteration(moodboard.id);
    const phaseBase = { ...base, phaseId: moodboard.id };
    await sf.phases.sendIteration({ ...phaseBase, iterationId: iteration.id });
    const answered = await sf.phases.recordClientAnswer({ ...phaseBase, iterationId: iteration.id, note: "Warmer, please" });
    const card = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: answered.noteId! } });
    assert.deepEqual([card.section_id, card.phase_id, card.iteration_id, card.origin, card.workflow_record, card.canvas_x, card.canvas_y, card.canvas_w], [defaultSection.id, moodboard.id, iteration.id, "CLIENT_ANSWER", true, null, null, null]);

    const failingAudit = createStudioFlowService(testDb.prisma, {
      runTransaction: (work) => testDb.prisma.$transaction((tx) => work(tx)), auditWriter: { write: async () => { throw new Error("audit down"); } },
      people: createPeopleDirectory(testDb.prisma), storage, notificationWriter: createNotificationWriter(), masterData: createMasterDataPublicRead(testDb.prisma), now: () => clock,
    } as StudioFlowPorts);
    const before = await testDb.prisma.sfWorkspaceCard.count();
    for (const key of ["layout", "design3d", "cd"] as const) await sf.phases.bypassPhase({ ...as(designer), projectId, phaseId: (await phaseOf(projectId, key)).id, reason: "Skip" });
    const supervision = await phaseOf(projectId, "supervision");
    await assert.rejects(failingAudit.phases.createSupervisionVisit({ ...base, phaseId: supervision.id, visitDate: "2026-09-20", note: "Ceiling checked" }));
    assert.equal(await testDb.prisma.sfWorkspaceCard.count(), before, "a failed visit leaves no card behind");
    const visit = await sf.phases.createSupervisionVisit({ ...base, phaseId: supervision.id, visitDate: "2026-09-20", note: "Ceiling checked" });
    const visitCard = await testDb.prisma.sfWorkspaceCard.findFirstOrThrow({ where: { iteration_id: visit.iterationId } });
    assert.deepEqual([visitCard.section_id, visitCard.phase_id, visitCard.origin, visitCard.workflow_record, visitCard.body, visitCard.canvas_x, visitCard.canvas_y, visitCard.canvas_w], [defaultSection.id, supervision.id, "SITE_VISIT", true, "Ceiling checked", null, null, null]);
  });

  it("keeps a recorded answer's origin and labels fixed, and lets the answer dialog add text and screenshots to it", async () => {
    const { projectId, moodboard, cd, base } = await setup();
    const iteration = await openIteration(moodboard.id);
    const phaseBase = { ...base, phaseId: moodboard.id };
    // Before the answer is recorded, nothing can be filed as part of it.
    await sf.phases.sendIteration({ ...phaseBase, iterationId: iteration.id });
    await rejectsWith(sf.phases.postPhaseNote({ ...phaseBase, body: "Too early", answeredIterationId: iteration.id }), "ITERATION_NOT_ANSWERED");
    await rejectsWith(sf.phases.postPhaseImage({ ...phaseBase, file: png(), answeredIterationId: iteration.id }), "ITERATION_NOT_ANSWERED");
    assert.equal(storage.objects.size, 0, "a refused answer image stores nothing");

    const answered = await sf.phases.recordClientAnswer({ ...phaseBase, iterationId: iteration.id, note: "Warmer, please" });
    const more = await sf.phases.postPhaseNote({ ...phaseBase, body: "Also a lighter floor", answeredIterationId: iteration.id });
    const shot = await sf.phases.postPhaseImage({ ...phaseBase, file: png(), answeredIterationId: iteration.id });
    const rows = await testDb.prisma.sfWorkspaceCard.findMany({ where: { id: { in: [answered.noteId!, more.noteId, shot.imageId] } } });
    for (const row of rows) assert.deepEqual([row.origin, row.workflow_record, row.phase_id, row.iteration_id], ["CLIENT_ANSWER", true, moodboard.id, iteration.id], row.kind);

    const read = (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId })).find((item) => item.id === answered.noteId)!;
    assert.equal(read.workflowRecord, true);
    await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...base, cardId: read.id, clientAnswer: false, version: read.version }), "WORKSPACE_RECORD_LOCKED");
    await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...phaseBase, cardId: read.id, clientAnswer: false, version: await noteVersion(read.id) }), "WORKSPACE_RECORD_LOCKED");
    await rejectsWith(sf.workspace.setWorkspaceCardPhase({ ...base, cardId: read.id, phaseId: cd.id, version: read.version }), "WORKSPACE_RECORD_LOCKED");
    await rejectsWith(sf.workspace.setWorkspaceCardPhase({ ...base, cardId: read.id, phaseId: null, version: read.version }), "WORKSPACE_RECORD_LOCKED");
    // Its text can still be corrected and it can be starred; the record is its origin and labels.
    const starred = await sf.workspace.setWorkspaceCardFlags({ ...base, cardId: read.id, pinned: true, version: read.version });
    await sf.workspace.updateWorkspaceCardText({ ...base, cardId: read.id, body: "Warmer, please (soft beige)", version: starred.version });
    const after = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: read.id } });
    assert.deepEqual([after.origin, after.phase_id, after.iteration_id, after.is_pinned, after.body], ["CLIENT_ANSWER", moodboard.id, iteration.id, true, "Warmer, please (soft beige)"]);

    // A note marked by hand stays switchable.
    const manual = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Heard on the phone", clientAnswer: true });
    const manualRow = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: manual.cardId } });
    assert.equal(manualRow.workflow_record, false);
    await sf.workspace.setWorkspaceCardFlags({ ...base, cardId: manual.cardId, clientAnswer: false, version: manualRow.version });
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: manual.cardId } })).origin, "NOTE");
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId: read.id, version: after.version });
    assert.equal(await testDb.prisma.sfWorkspaceCard.findUnique({ where: { id: read.id } }), null, "G1 keeps official records deletable");
  });

  it("stores optional geometry, places a last-write-wins batch without bumping versions, and orders the phone document by canvas", async () => {
    const { projectId, base } = await setup();
    const unplaced = await sf.workspace.createWorkspaceCard({ ...base, body: "Unplaced first" });
    const placed = await sf.workspace.createWorkspaceCard({ ...base, body: "Placed", x: 80, y: 240, w: 256 });
    const moving = await sf.workspace.createWorkspaceCard({ ...base, body: "Move me", x: 240, y: 80, w: 256 });
    const beforeVersion = (await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: moving.cardId } })).version;
    const auditsBefore = await testDb.prisma.auditEvent.count({ where: { action: { startsWith: "studioflow.workspace-card." } } });

    await sf.workspace.placeWorkspaceItems({
      ...base,
      cards: [
        { id: moving.cardId, x: 300, y: 300, w: 256 },
        { id: moving.cardId, x: 40, y: 400, w: 288 },
        { id: placed.cardId, x: 80, y: 120, w: 256 },
      ],
    });

    const board = await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId });
    assert.deepEqual(board.map((card) => [card.id, card.sortOrder, card.canvas]), [
      [placed.cardId, 0, { x: 80, y: 120, w: 256 }],
      [moving.cardId, 1, { x: 40, y: 400, w: 288 }],
      [unplaced.cardId, 2, null],
    ], "the last value in a batch wins; placed elements lead top to bottom and unplaced ones keep their order after them");
    assert.equal(board[1]!.version, beforeVersion, "layout never bumps the element version");
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: { startsWith: "studioflow.workspace-card." } } }), auditsBefore, "pure geometry is not audited");
    const saved = await sf.workspace.updateWorkspaceCardText({ ...base, cardId: moving.cardId, body: "Edited after move", version: beforeVersion });
    assert.equal(saved.version, beforeVersion + 1, "a version read before the move is still valid for text");
  });

  it("refuses invalid, foreign, unauthorized, oversized, archived, and completed canvas batches atomically", async () => {
    const { projectId, moodboard, base } = await setup();
    const defaultCard = await sf.workspace.createWorkspaceCard({ ...base, body: "General" });
    const labelled = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Designer phase" });
    const other = await setup("Other canvas project");
    const foreignCard = await sf.workspace.createWorkspaceCard({ ...other.base, body: "Foreign" });

    await rejectsWith(sf.workspace.placeWorkspaceItems({ ...base, cards: [{ id: foreignCard.cardId, x: 0, y: 0, w: 180 }] }), "PHASE_NOTE_NOT_FOUND");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, body: "Partial", x: 1 }), "WORKSPACE_CANVAS_INVALID");
    await rejectsWith(sf.workspace.placeWorkspaceItems({ ...base, cards: [{ id: defaultCard.cardId, x: 100_001, y: 0, w: 180 }] }), "WORKSPACE_CANVAS_INVALID");

    const before = await testDb.prisma.sfWorkspaceCard.findMany({ where: { id: { in: [defaultCard.cardId, labelled.cardId] } }, orderBy: { id: "asc" } });
    await rejectsWith(sf.workspace.placeWorkspaceItems({
      ...as(drafter, DRAFTER_GRANTS), projectId,
      cards: [{ id: defaultCard.cardId, x: 10, y: 10, w: 180 }, { id: labelled.cardId, x: 20, y: 20, w: 180 }],
    }), "PERMISSION_DENIED");
    assert.deepEqual(await testDb.prisma.sfWorkspaceCard.findMany({ where: { id: { in: [defaultCard.cardId, labelled.cardId] } }, orderBy: { id: "asc" } }), before, "one refused item rolls the whole batch back");
    await rejectsWith(sf.workspace.placeWorkspaceItems({ ...as(designer, [P.access, P.projectRead]), projectId, cards: [{ id: defaultCard.cardId, x: 0, y: 0, w: 180 }] }), "PERMISSION_DENIED");
    await rejectsWith(sf.workspace.placeWorkspaceItems({ ...base, cards: Array.from({ length: 501 }, () => ({ id: defaultCard.cardId, x: 0, y: 0, w: 180 })) }), "WORKSPACE_CANVAS_LIMIT");

    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: clock } });
    await assert.rejects(sf.workspace.placeWorkspaceItems({ ...base, cards: [{ id: defaultCard.cardId, x: 0, y: 0, w: 180 }] }));
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: null, status: "COMPLETED" } });
    await assert.rejects(sf.workspace.placeWorkspaceItems({ ...base, cards: [{ id: defaultCard.cardId, x: 0, y: 0, w: 180 }] }));
  });
});

describe("WO-SF-WORKSPACE-04 standalone board elements", () => {
  afterEach(() => storage.objects.clear());

  const PDF = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 1, 2, 3]);

  async function setup(name = "Board project") {
    const { projectId } = await newProject(name);
    const moodboard = await phaseOf(projectId, "moodboard");
    await openIteration(moodboard.id);
    return { projectId, moodboard, base: { ...as(designer), projectId } };
  }

  it("creates an image element in one step, reads it as its own one image, and keeps text-only commands off it", async () => {
    const { projectId, moodboard, base } = await setup();
    const { cardId } = await sf.workspace.createWorkspaceImage({ ...base, phaseId: moodboard.id, clientAnswer: true, x: 40, y: 80, w: 120, file: png() });
    const row = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([row.kind, row.body, row.origin, row.phase_id, row.canvas_x, row.canvas_y, row.canvas_w, row.content_type, row.uploaded_by_name], ["IMAGE", "", "CLIENT_ANSWER", moodboard.id, 40, 80, 120, "image/png", "Dina Designer"]);
    assert.ok(row.storage_key!.startsWith(`studioflow/notes/${projectId}/`) && storage.objects.has(row.storage_key!));
    const view = (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId })).find((card) => card.id === cardId)!;
    assert.deepEqual([view.kind, view.file, view.images.map((image) => [image.id, image.contentType, image.url?.startsWith("https://storage.invalid/")])], ["IMAGE", null, [[cardId, "image/png", true]]]);
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId, body: "Caption", version: row.version }), "WORKSPACE_ELEMENT_NOT_TEXT");
    await rejectsWith(sf.workspace.setWorkspaceTextStyle({ ...base, cardId, textStyle: "HEADING", version: row.version }), "WORKSPACE_ELEMENT_NOT_TEXT");
    await rejectsWith(sf.workspace.createWorkspaceImage({ ...base, file: { body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), contentType: "image/png" } }), "NOTE_IMAGE_TYPE");
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId, version: row.version });
    assert.equal(storage.objects.size, 0, "deleting the element releases its object");
  });

  it("creates file elements from an allow-list checked against the bytes, and refuses everything else with nothing stored", async () => {
    const { projectId, moodboard, base } = await setup();
    const { cardId } = await sf.workspace.createWorkspaceFile({ ...base, x: 0, y: 0, w: 256, file: { body: PDF(), name: "DED Dapur R2.pdf" } });
    const row = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([row.kind, row.file_name, row.content_type, row.bytes, row.body], ["FILE", "DED Dapur R2.pdf", "application/pdf", PDF().byteLength, ""]);
    assert.ok(row.storage_key!.startsWith(`studioflow/workspace-files/${projectId}/`) && row.storage_key!.endsWith(".pdf"));
    const view = (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId })).find((card) => card.id === cardId)!;
    assert.deepEqual([view.kind, view.images, view.file?.name, view.file?.contentType, view.file?.url?.startsWith("https://storage.invalid/")], ["FILE", [], "DED Dapur R2.pdf", "application/pdf", true]);
    assert.equal(JSON.stringify(view).includes(row.storage_key!), false, "the storage key never leaks into a read");

    await sf.workspace.createWorkspaceFile({ ...base, file: { body: new TextEncoder().encode("a,b\n1,2\n"), name: "quantities.csv" } });
    await sf.workspace.createWorkspaceFile({ ...base, file: { body: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]), name: "Schedule.XLSX" } });
    const stored = storage.objects.size;
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: PNG, name: "plan.pdf" } }), "WORKSPACE_FILE_TYPE");
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: PDF(), name: "setup.exe" } }), "WORKSPACE_FILE_TYPE");
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: PDF(), name: "no-extension" } }), "WORKSPACE_FILE_TYPE");
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: new Uint8Array([0x61, 0, 0x62]), name: "notes.txt" } }), "WORKSPACE_FILE_TYPE");
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: new Uint8Array(0), name: "empty.pdf" } }), "WORKSPACE_FILE_SIZE");
    const big = new Uint8Array(25 * 1024 * 1024 + 1); big.set(PDF());
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: big, name: "huge.pdf" } }), "WORKSPACE_FILE_SIZE");

    const viewer = await seedUser("Vera Board Viewer", [P.access, P.projectRead]);
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...as(viewer, [P.access, P.projectRead]), projectId, file: { body: PDF(), name: "a.pdf" } }), "PERMISSION_DENIED");
    // The drafter has no seat on the Moodboard phase, so cannot label a file with it.
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: moodboard.id, file: { body: PDF(), name: "a.pdf" } }), "PERMISSION_DENIED");
    await sf.projects.archiveProject({ ...as(designer), projectId, reason: "Paused" });
    await rejectsWith(sf.workspace.createWorkspaceFile({ ...base, file: { body: PDF(), name: "a.pdf" } }), "PROJECT_ARCHIVED");
    await rejectsWith(sf.workspace.createWorkspaceImage({ ...base, file: png() }), "PROJECT_ARCHIVED");
    assert.equal(storage.objects.size, stored, "a refused upload stores nothing");
  });

  it("keeps a text element's style and lets it be as narrow as an image", async () => {
    const { projectId, base } = await setup();
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, body: "Dapur dan ruang makan", textStyle: "HEADING", x: 0, y: 0, w: 120 });
    let view = (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId }))[0]!;
    assert.deepEqual([view.kind, view.textStyle, view.canvas?.w], ["TEXT", "HEADING", 120]);
    const changed = await sf.workspace.setWorkspaceTextStyle({ ...base, cardId, textStyle: "STICKY", version: view.version });
    assert.equal(changed.version, view.version + 1);
    view = (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId }))[0]!;
    assert.equal(view.textStyle, "STICKY");
    await rejectsWith(sf.workspace.setWorkspaceTextStyle({ ...base, cardId, textStyle: "HEADING", version: view.version - 1 }), "WORKSPACE_CARD_STALE");
    await rejectsWith(sf.workspace.setWorkspaceTextStyle({ ...base, cardId, textStyle: "LOUD", version: view.version }), "WORKSPACE_TEXT_STYLE_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, body: "Too narrow", x: 0, y: 0, w: 119 }), "WORKSPACE_CANVAS_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, body: "   " }), "PHASE_NOTE_EMPTY");
  });

  it("lays an image pasted into a placed text element beside it, with the text's labels", async () => {
    const { projectId, moodboard, base } = await setup();
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, clientAnswer: true, body: "Backsplash too busy", x: 100, y: 200, w: 300 });
    // Labels and place come from the text; what the caller sends for them is not used.
    const first = await sf.workspace.createWorkspaceImage({ ...base, besideId: cardId, phaseId: null, x: 0, y: 0, w: 120, file: png() });
    const second = await sf.workspace.createWorkspaceImage({ ...base, besideId: cardId, file: png() });
    const rows = await testDb.prisma.sfWorkspaceCard.findMany({ where: { id: { in: [first.cardId, second.cardId] } }, orderBy: { canvas_y: "asc" } });
    assert.deepEqual(rows.map((row) => [row.id, row.kind, row.canvas_x, row.canvas_y, row.canvas_w, row.phase_id, row.origin]), [
      [first.cardId, "IMAGE", 416, 200, 240, moodboard.id, "CLIENT_ANSWER"],
      [second.cardId, "IMAGE", 416, 224, 240, moodboard.id, "CLIENT_ANSWER"],
    ]);
    const text = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([text.kind, text.body], ["TEXT", "Backsplash too busy"], "the text stays text");
    assert.equal((await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId })).length, 3);
    // Beside an element of another project: not reachable.
    const other = await setup("Other board project");
    await rejectsWith(sf.workspace.createWorkspaceImage({ ...other.base, besideId: cardId, file: png() }), "PHASE_NOTE_NOT_FOUND");
  });

  it("keeps project-chat replies, topic tags and schedule links on one note stream", async () => {
    const { projectId, moodboard, base } = await setup();
    const layout = await phaseOf(projectId, "layout");
    const entry = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Homogeneous Tile", snapshot: { productName: "Ivory Tile" } });
    const root = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Root message", tags: ["#lampu"] });
    const reply = await sf.workspace.createWorkspaceCard({ ...base, phaseId: layout.id, body: "Reply message", replyToId: root.cardId, tags: ["Lampu"], itemEntryIds: [entry.entryId] });
    const stream = await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId });
    const note = stream.notes.find((item) => item.id === reply.cardId)!;
    assert.deepEqual(note.replyTo, { id: root.cardId, kind: "TEXT", excerpt: "Root message", authorName: "Dina Designer", clientFeedback: false });
    // A tag keeps the spelling it was first written with; "Lampu" finds the existing "lampu".
    assert.deepEqual(note.tags, ["lampu"]);
    // The code's prefix comes from the database's prefix list (HT when seeded, else a fallback), so read it back.
    const entryRow = await testDb.prisma.sfScheduleEntry.findUniqueOrThrow({ where: { id: entry.entryId } });
    const code = `${entryRow.prefix}-${String(entryRow.increment).padStart(2, "0")}`;
    assert.deepEqual(note.items.map((item) => [item.code, item.name]), [[code, "Ivory Tile"]]);
    assert.deepEqual((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, tag: "#lampu" })).notes.map((item) => item.id).sort(), [reply.cardId, root.cardId].sort());
    assert.deepEqual((await sf.workspace.listNotesForItem({ grants: ALL, actorId: designer.id, projectId, entryId: entry.entryId })).map((item) => item.id), [reply.cardId]);
    assert.deepEqual((await sf.workspace.searchNoteItems({ grants: ALL, projectId, query: `${entryRow.prefix.toLowerCase()}${entryRow.increment}` })).map((item) => item.entryId), [entry.entryId]);
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Bad", tags: ["feedback"] }), "NOTE_TAG_RESERVED");
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId: root.cardId, version: (await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: root.cardId } })).version });
    assert.equal((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId })).notes.find((item) => item.id === reply.cardId)!.replyTo, null);
  });

  it("enforces project chat boundaries, cleans only local orphan tags, filters and pages its stream", async () => {
    const { projectId, moodboard, base } = await setup();
    const layout = await phaseOf(projectId, "layout");
    const other = await setup("Other note project");
    const ownEntry = await sf.schedule.createEntry({ ...as(designer), projectId, section: "MATERIAL", category: "Tile", snapshot: { productName: "Own tile" } });
    const foreignEntry = await sf.schedule.createEntry({ ...as(designer), projectId: other.projectId, section: "MATERIAL", category: "Tile", snapshot: { productName: "Foreign tile" } });
    const root = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "one", tags: ["local"] });
    const feedback = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "two", clientAnswer: true, tags: ["filter"], itemEntryIds: [ownEntry.entryId] });
    const phaseB = await sf.workspace.createWorkspaceCard({ ...base, phaseId: layout.id, body: "three" });
    await sf.workspace.setWorkspaceCardFlags({ ...base, cardId: phaseB.cardId, pinned: true, version: (await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: phaseB.cardId } })).version });
    await sf.workspace.createWorkspaceCard({ ...other.base, phaseId: other.moodboard.id, body: "other", tags: ["local"] });
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "foreign reply", replyToId: (await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId: other.projectId }))[0]!.id }), "NOTE_REPLY_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "foreign item", itemEntryIds: [foreignEntry.entryId] }), "NOTE_ITEM_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "bad tag", tags: ["bad tag"] }), "NOTE_TAG_INVALID");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "many tags", tags: ["a", "b", "c", "d", "e", "f"] }), "NOTE_TAG_LIMIT");
    await rejectsWith(sf.workspace.createWorkspaceCard({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: layout.id, body: "wrong phase" }), "PERMISSION_DENIED");
    assert.equal((await testDb.prisma.sfNoteItemLink.findUniqueOrThrow({ where: { card_id_entry_id: { card_id: feedback.cardId, entry_id: ownEntry.entryId } } })).code_snapshot, "TI-01");
    assert.deepEqual((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, phaseId: moodboard.id })).notes.map((note) => note.id).sort(), [feedback.cardId, root.cardId].sort());
    assert.deepEqual((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, clientFeedback: true })).notes.map((note) => note.id), [feedback.cardId]);
    assert.deepEqual((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, starred: true })).notes.map((note) => note.id), [phaseB.cardId]);
    assert.deepEqual((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, entryId: ownEntry.entryId })).notes.map((note) => note.id), [feedback.cardId]);
    const first = await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, limit: 1 });
    const second = await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, limit: 10, cursor: first.cursor! });
    assert.equal(new Set([...first.notes, ...second.notes].map((note) => note.id)).size, 3);
    const rootRow = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: root.cardId } });
    await sf.workspace.setNoteTags({ ...base, cardId: root.cardId, tags: [], version: rootRow.version });
    assert.equal(await testDb.prisma.sfNoteTag.count({ where: { project_id: projectId, key: "local" } }), 0);
    assert.equal(await testDb.prisma.sfNoteTag.count({ where: { project_id: other.projectId, key: "local" } }), 1);
  });

  it("uses the final Schedule option for linked-note item names", async () => {
    const { projectId, moodboard, base } = await setup();
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "tile", prefix: "HT", increment: 9, sort_order: 9, active_index: 0 } });
    await testDb.prisma.sfScheduleOption.createMany({ data: [
      { entry_id: entry.id, label: "A2", product_name: "Wrong option", search_key: "wrong" },
      { entry_id: entry.id, label: "A10", product_name: "Final option", search_key: "final", is_final: true },
    ] });
    const note = await sf.workspace.createWorkspaceCard({ ...base, phaseId: moodboard.id, body: "Uses final", itemEntryIds: [entry.id] });
    assert.equal((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId })).notes.find((item) => item.id === note.cardId)!.items[0]!.name, "Final option");
    assert.equal((await sf.workspace.searchNoteItems({ grants: ALL, projectId, query: "final" })).find((item) => item.entryId === entry.id)!.name, "Final option");
  });
});

describe("WO-SF-BOARD-THREADS-01", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const image = { body: PNG, contentType: "image/png" };
  afterEach(() => storage.objects.clear());
  async function setup() {
    const { projectId } = await newProject("Board threads");
    const phase = await phaseOf(projectId, "moodboard");
    const base = { ...as(designer), projectId, phaseId: phase.id };
    const anchor = await sf.workspace.createWorkspaceCard({ ...base, body: "Anchor", x: 100, y: 200, w: 240 });
    return { projectId, phase, base, anchorId: anchor.cardId };
  }
  async function remove(projectId: string, cardId: string, actor = as(designer)) {
    return sf.workspace.deleteWorkspaceCard({ ...actor, projectId, cardId, version: await noteVersion(cardId) });
  }

  it("creates a thread only with its first text, supports free/placed/unplaced anchors and preserves Notes metadata and filters", async () => {
    const { projectId, base, anchorId } = await setup();
    const loose = await sf.workspace.createWorkspaceCard({ ...base, body: "Unplaced" });
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "TILE", prefix: "HT", increment: 1, sort_order: 0 } });
    const first = await sf.workspace.postThreadMessage({ ...base, thread: { x: 0, y: 100_000 }, body: "First @HT-01", tags: ["tile"], itemEntryIds: [entry.id] });
    clock = new Date(clock.getTime() + 1000);
    const reply = await sf.workspace.postThreadMessage({ ...base, thread: { threadId: first.threadId }, body: "Reply", replyToId: first.noteId, clientFeedback: true });
    const anchored = await sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: anchorId, offsetX: 20, offsetY: -10 }, body: "Attached" });
    const unplaced = await sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: loose.cardId, offsetX: 12, offsetY: 13 }, body: "Unplaced attached" });
    const rows = await sf.workspace.listWorkspaceThreads({ grants: ALL, actorId: designer.id, projectId });
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.find((row) => row.id === first.threadId), { id: first.threadId, version: 1, x: 0, y: 100_000, anchorCardId: null, offsetX: null, offsetY: null, messageCount: 2, clientFeedback: true, lastMessageAt: clock });
    assert.deepEqual(rows.filter((row) => row.anchorCardId).map((row) => [row.x, row.y]).sort((a, b) => a[0] - b[0]), [[12, 13], [120, 190]]);
    const board = await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId });
    assert.deepEqual(board.map((row) => row.id).sort(), [anchorId, loose.cardId].sort());
    assert.equal(board.find((row) => row.id === anchorId)!.anchoredThreadMessages, 1);
    const all = await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId });
    assert.equal(all.notes.length, 6);
    assert.equal(all.notes.find((row) => row.id === first.noteId)!.threadId, first.threadId);
    assert.deepEqual(all.notes.find((row) => row.id === first.noteId)!.tags, ["tile"]);
    assert.equal(all.notes.find((row) => row.id === first.noteId)!.items[0].entryId, entry.id);
    assert.equal(all.notes.find((row) => row.id === reply.noteId)!.replyTo?.id, first.noteId);
    assert.deepEqual((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, threadId: first.threadId })).notes.map((row) => row.id), [reply.noteId, first.noteId]);
    assert.equal((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, inThreads: true })).notes.length, 4);
    assert.equal((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, inThreads: true, clientFeedback: true })).notes[0].id, reply.noteId);
    const stored = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: unplaced.noteId } });
    assert.deepEqual([stored.canvas_x, stored.canvas_y, stored.canvas_w], [null, null, null]);
    await rejectsWith(sf.workspace.placeWorkspaceItems({ ...base, cards: [{ id: first.noteId, x: 1, y: 2, w: 240 }] }), "WORKSPACE_THREAD_MESSAGE");
    await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { x: 4, y: 5 }, body: "" }), "PHASE_NOTE_EMPTY");
    await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { x: 4, y: 5 }, body: "Bad tags", tags: ["feedback"] }), "NOTE_TAG_RESERVED");
    await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { x: 4, y: 5 }, body: "Bad item", itemEntryIds: [randomUUID()] }), "NOTE_ITEM_INVALID");
    await rejectsWith(sf.workspace.postThreadMessage({ ...base, phaseId: "", thread: { x: 4, y: 5 }, body: "No phase" }), "WORKSPACE_THREAD_PHASE_REQUIRED");
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { project_id: projectId } }), 3, "failed posts leave no empty thread");
    assert.ok(anchored.threadId);
  });

  it("creates the first image atomically in all three spec forms and cleans objects after a failed transaction", async () => {
    const { projectId, base, anchorId } = await setup();
    const first = await sf.workspace.postThreadImage({ ...base, thread: { x: 20, y: 30 }, file: image, tags: ["photos"], clientFeedback: true });
    const attached = await sf.workspace.postThreadImage({ ...base, thread: { anchorCardId: anchorId, offsetX: 3, offsetY: 4 }, file: image });
    const reply = await sf.workspace.postThreadImage({ ...base, thread: { threadId: first.threadId }, file: image, replyToId: first.imageId });
    const loose = await sf.workspace.createWorkspaceCard({ ...base, body: "Loose image anchor" });
    await sf.workspace.postThreadImage({ ...base, thread: { anchorCardId: loose.cardId, offsetX: 5, offsetY: 6 }, file: image });
    assert.equal(reply.threadId, first.threadId);
    const notes = (await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, inThreads: true })).notes;
    assert.equal(notes.length, 4);
    assert.equal(notes.find((note) => note.id === first.imageId)!.origin, "CLIENT_ANSWER");
    assert.deepEqual(notes.find((note) => note.id === first.imageId)!.tags, ["photos"]);
    assert.equal(notes.find((note) => note.id === reply.imageId)!.replyTo?.id, first.imageId);
    const objects = storage.objects.size;
    await rejectsWith(sf.workspace.postThreadImage({ ...base, thread: { x: 1, y: 2 }, file: image, tags: ["feedback"] }), "NOTE_TAG_RESERVED");
    assert.equal(storage.objects.size, objects);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { project_id: projectId } }), 3);
    await rejectsWith(sf.workspace.postThreadImage({ ...base, thread: { x: 1, y: 2 }, file: { ...image, body: new Uint8Array() } }), "NOTE_IMAGE_SIZE");
    assert.equal(storage.objects.size, objects);
    assert.ok(attached.threadId);
  });

  it("rejects foreign/message anchors and replies outside the selected thread without leaving threads or images", async () => {
    const { projectId, base, anchorId } = await setup();
    const other = await newProject("Foreign thread");
    const phase = await phaseOf(other.projectId, "moodboard");
    const foreign = await sf.workspace.postThreadMessage({ ...as(designer), projectId: other.projectId, phaseId: phase.id, thread: { x: 1, y: 2 }, body: "Foreign" });
    const own = await sf.workspace.postThreadMessage({ ...base, thread: { x: 3, y: 4 }, body: "Own" });
    const foreignAnchor = await sf.workspace.createWorkspaceCard({ ...as(designer), projectId: other.projectId, body: "Foreign anchor" });
    await assert.rejects(sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: foreignAnchor.cardId, offsetX: 1, offsetY: 2 }, body: "No" }));
    await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: own.noteId, offsetX: 1, offsetY: 2 }, body: "No" }), "WORKSPACE_THREAD_MESSAGE");
    await assert.rejects(sf.workspace.postThreadImage({ ...base, thread: { threadId: foreign.threadId }, file: image }));
    for (const replyToId of [anchorId, foreign.noteId]) {
      await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { threadId: own.threadId }, body: "No", replyToId }), "NOTE_REPLY_INVALID");
      await rejectsWith(sf.workspace.postThreadImage({ ...base, thread: { threadId: own.threadId }, file: image, replyToId }), "NOTE_REPLY_INVALID");
    }
    await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { x: 8, y: 9 }, body: "New thread reply", replyToId: own.noteId }), "NOTE_REPLY_INVALID");
    await rejectsWith(sf.workspace.postThreadImage({ ...base, thread: { x: 8, y: 9 }, file: image, replyToId: own.noteId }), "NOTE_REPLY_INVALID");
    assert.equal((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, threadId: foreign.threadId })).notes.length, 0);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { project_id: projectId } }), 1);
    assert.equal(storage.objects.size, 0);
  });

  it("keeps phase/PIC/status gates for text and image posts and project document access for free moves", async () => {
    const { projectId, phase, base } = await setup();
    const outsider = await seedUser("Outsider", [P.access, P.projectRead, P.phaseWork]);
    const thread = await sf.workspace.postThreadMessage({ ...base, thread: { x: 1, y: 2 }, body: "Original" });
    for (const actor of [as(drafter, DRAFTER_GRANTS), as(outsider, [P.access, P.projectRead, P.phaseWork]), as(designer, [P.access, P.projectRead])]) {
      await rejectsWith(sf.workspace.postThreadMessage({ ...actor, projectId, phaseId: phase.id, thread: { x: 1, y: 2 }, body: "No" }), "PERMISSION_DENIED");
      await rejectsWith(sf.workspace.postThreadImage({ ...actor, projectId, phaseId: phase.id, thread: { threadId: thread.threadId }, file: image }), "PERMISSION_DENIED");
    }
    await rejectsWith(sf.workspace.moveThread({ ...as(outsider, [P.access, P.projectRead, P.phaseWork]), projectId, threadId: thread.threadId, version: 1, x: 3, y: 4 }), "PERMISSION_DENIED");
    await sf.workspace.moveThread({ ...as(drafter, DRAFTER_GRANTS), projectId, threadId: thread.threadId, version: 1, x: 3, y: 4 });
    for (const [data, error] of [[{ status: "COMPLETED" as const }, "PROJECT_COMPLETED"], [{ status: "ON_HOLD" as const }, "PROJECT_NOT_ACTIVE"], [{ status: "ACTIVE" as const, archived_at: clock }, "PROJECT_ARCHIVED"]] as const) {
      await testDb.prisma.sfProject.update({ where: { id: projectId }, data });
      await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { x: 1, y: 2 }, body: "No" }), error);
      await rejectsWith(sf.workspace.postThreadImage({ ...base, thread: { threadId: thread.threadId }, file: image }), error);
      await rejectsWith(sf.workspace.moveThread({ ...base, threadId: thread.threadId, version: 2, x: 5, y: 6 }), error);
    }
    assert.equal(storage.objects.size, 0);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { project_id: projectId } }), 1);
  });

  it("moves only free threads with optimistic versions and bounded integer points", async () => {
    const { projectId, base, anchorId } = await setup();
    const free = await sf.workspace.postThreadMessage({ ...base, thread: { x: 1, y: 2 }, body: "Free" });
    const anchored = await sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: anchorId, offsetX: 1, offsetY: 2 }, body: "Anchored" });
    assert.deepEqual(await sf.workspace.moveThread({ ...base, threadId: free.threadId, version: 1, x: 100_000, y: 0 }), { threadId: free.threadId, version: 2 });
    await rejectsWith(sf.workspace.moveThread({ ...base, threadId: free.threadId, version: 1, x: 3, y: 4 }), "WORKSPACE_THREAD_STALE");
    await rejectsWith(sf.workspace.moveThread({ ...base, threadId: anchored.threadId, version: 1, x: 3, y: 4 }), "WORKSPACE_THREAD_ANCHORED");
    for (const x of [-1, 100_001, 1.2, NaN]) {
      await rejectsWith(sf.workspace.moveThread({ ...base, threadId: free.threadId, version: 2, x, y: 0 }), "WORKSPACE_CANVAS_INVALID");
      await rejectsWith(sf.workspace.postThreadMessage({ ...base, thread: { x, y: 0 }, body: "Bad point" }), "WORKSPACE_CANVAS_INVALID");
    }
    assert.equal((await sf.workspace.listWorkspaceThreads({ grants: ALL, actorId: designer.id, projectId })).find((row) => row.id === free.threadId)!.x, 100_000);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { project_id: projectId } }), 2);
  });

  it("removes the last single/album message's thread and queues failed image cleanup durably", async () => {
    const { projectId, base } = await setup();
    const single = await sf.workspace.postThreadMessage({ ...base, thread: { x: 1, y: 2 }, body: "Single" });
    await sf.workspace.updateWorkspaceCardText({ ...base, cardId: single.noteId, version: 1, body: "Edited in Notes", itemEntryIds: [] });
    await sf.workspace.setWorkspaceCardFlags({ ...base, cardId: single.noteId, version: 2, pinned: true });
    await remove(projectId, single.noteId);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { id: single.threadId } }), 0);
    const first = await sf.workspace.postThreadImage({ ...base, thread: { x: 3, y: 4 }, file: image });
    const second = await sf.workspace.postThreadImage({ ...base, thread: { threadId: first.threadId }, file: image });
    await remove(projectId, first.imageId);
    assert.equal((await sf.workspace.listWorkspaceThreads({ grants: ALL, actorId: designer.id, projectId }))[0].messageCount, 1);
    const row = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: second.imageId } });
    const failedDelete = mock.method(storage, "remove", async () => { throw Error("storage unavailable"); });
    try { await remove(projectId, second.imageId); } finally { failedDelete.mock.restore(); }
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { id: first.threadId } }), 0);
    const queued = await testDb.prisma.sfAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: row.storage_key! } });
    assert.equal(queued.resolved_at, null);
    assert.ok(queued.attempts >= 1);
  });

  it("refuses an anchor cascade across message labels atomically, then permits the full authorized cascade and storage cleanup", async () => {
    const { projectId, base } = await setup();
    const anchor = await sf.workspace.createWorkspaceCard({ ...as(drafter, DRAFTER_GRANTS), projectId, body: "General anchor" });
    const cd = await phaseOf(projectId, "cd");
    const first = await sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: anchor.cardId, offsetX: 1, offsetY: 2 }, body: "Designer label" });
    const second = await sf.workspace.postThreadImage({ ...as(drafter, DRAFTER_GRANTS), projectId, phaseId: cd.id, thread: { threadId: first.threadId }, file: image });
    await testDb.prisma.sfWorkspaceCard.update({ where: { id: first.noteId }, data: { workflow_record: true } });
    const more = await sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: anchor.cardId, offsetX: 8, offsetY: 9 }, body: "Second thread" });
    const auditCount = await testDb.prisma.auditEvent.count();
    await rejectsWith(remove(projectId, anchor.cardId, as(drafter, DRAFTER_GRANTS)), "WORKSPACE_THREAD_LOCKED");
    assert.equal(await testDb.prisma.auditEvent.count(), auditCount, "refusal writes no audit or deletion");
    assert.equal(await testDb.prisma.sfWorkspaceCard.count({ where: { id: { in: [anchor.cardId, first.noteId, second.imageId, more.noteId] } } }), 4);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { anchor_card_id: anchor.cardId } }), 2);
    assert.equal(storage.objects.size, 1);
    assert.equal((await sf.workspace.readWorkspace({ grants: ALL, actorId: designer.id, projectId })).find((row) => row.id === anchor.cardId)!.anchoredThreadMessages, 3);
    await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...base, cardId: anchor.cardId, version: 99 }), "WORKSPACE_CARD_STALE");
    await remove(projectId, anchor.cardId);
    assert.equal(await testDb.prisma.sfWorkspaceCard.count({ where: { id: { in: [anchor.cardId, first.noteId, second.imageId, more.noteId] } } }), 0);
    assert.equal(await testDb.prisma.sfWorkspaceThread.count({ where: { anchor_card_id: anchor.cardId } }), 0);
    assert.equal(storage.objects.size, 0);
    const audit = await testDb.prisma.auditEvent.findMany({ where: { action: "studioflow.workspace-thread.deleted" } });
    assert.equal(audit.length, 2);
    assert.deepEqual(audit.map((row) => (row.metadata as { messageCount: number }).messageCount).sort(), [1, 2]);
  });

  it("serialises a last-message delete against a new post without an empty or resurrected thread", async () => {
    const { projectId, base } = await setup();
    const first = await sf.workspace.postThreadMessage({ ...base, thread: { x: 1, y: 2 }, body: "First" });
    const results = await Promise.allSettled([
      remove(projectId, first.noteId),
      sf.workspace.postThreadMessage({ ...base, thread: { threadId: first.threadId }, body: "Concurrent" }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    const threads = await sf.workspace.listWorkspaceThreads({ grants: ALL, actorId: designer.id, projectId });
    assert.equal(threads.length, results[1].status === "fulfilled" ? 1 : 0);
    assert.ok(threads.every((row) => row.messageCount > 0));
  });

  it("retention detaches deleted image anchors, keeps text/absolute fallback points and removes only emptied threads", async () => {
    const { projectId, base } = await setup();
    const photo = await sf.workspace.createWorkspaceImage({ ...base, file: image, x: 100, y: 200, w: 240 });
    const attached = await sf.workspace.postThreadMessage({ ...base, thread: { anchorCardId: photo.cardId, offsetX: 5, offsetY: 6 }, body: "Keep text" });
    const onlyImage = await sf.workspace.postThreadImage({ ...base, thread: { x: 10, y: 20 }, file: image });
    const mixed = await sf.workspace.postThreadMessage({ ...base, thread: { x: 30, y: 40 }, body: "Keep mixed text" });
    await sf.workspace.postThreadImage({ ...base, thread: { threadId: mixed.threadId }, file: image });
    const other = await newProject("Unexpired thread");
    const otherPhase = await phaseOf(other.projectId, "moodboard");
    const untouched = await sf.workspace.postThreadImage({ ...as(designer), projectId: other.projectId, phaseId: otherPhase.id, thread: { x: 1, y: 2 }, file: image });
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date(clock.getTime() - 91 * 86_400_000) } });
    const db = testDb.prisma;
    const retention = createAssetRetentionService(db, { runTransaction: (work) => runSerializableTransaction(db, work), auditWriter: createAuditEventWriter(), people: createPeopleDirectory(db), storage, masterData: createMasterDataPublicRead(db), now: () => clock });
    await retention.purgeExpiredArchivedAssets({}, async () => ({ presentationSlides: 0 }));
    const row = await db.sfWorkspaceThread.findUniqueOrThrow({ where: { id: attached.threadId } });
    assert.deepEqual([row.anchor_card_id, row.offset_x, row.offset_y, row.x, row.y], [null, null, null, 105, 206]);
    assert.equal(await db.sfWorkspaceThread.count({ where: { id: onlyImage.threadId } }), 0);
    assert.equal(await db.sfWorkspaceCard.count({ where: { thread_id: mixed.threadId } }), 1);
    assert.equal(await db.sfWorkspaceCard.count({ where: { id: attached.noteId } }), 1);
    assert.equal(await db.sfWorkspaceThread.count({ where: { id: untouched.threadId } }), 1);
    assert.equal(storage.objects.size, 1, "only the other project's object remains");
  });
});

describe("WO-SF-NOTES-PRESENTATION-IMAGE-01 slice B", () => {
  it("searches bare/partial codes OR any option name in project scope, exact first then Schedule order, capped at ten", async () => {
    const { projectId } = await newProject("Suggestion search");
    const other = await newProject("Other suggestion project");
    const db = testDb.prisma;
    const make = (increment: number, sort_order: number, prefix = "HT", section: "MATERIAL" | "FIXTURE" = "MATERIAL", target = projectId) => db.sfScheduleEntry.create({ data: { project_id: target, section, category: "Tile", category_key: "tile", prefix, increment, sort_order } });
    const fixture = await make(1, 0, "FX", "FIXTURE");
    const ten = await make(10, 0);
    const reserved = await make(2, 1); // No options: must appear on an empty query.
    const one = await make(1, 2);
    const named = await make(1, 3, "ZZ");
    await db.sfScheduleOption.createMany({ data: [
      { entry_id: one.id, label: "A", product_name: "Teraso abu", search_key: "teraso" },
      { entry_id: named.id, label: "A", product_name: "HT1 alternate name", search_key: "ht1" },
      { entry_id: named.id, label: "B", product_name: "Chosen product", search_key: "chosen" },
    ] });
    await db.sfScheduleEntry.update({ where: { id: named.id }, data: { active_index: 1 } });
    const foreign = await make(1, 0, "HT", "MATERIAL", other.projectId);
    const search = (query: string) => sf.workspace.searchNoteItems({ grants: ALL, projectId, query });
    for (const query of ["HT", "ht", "H", "HT0", "@ HT-"]) assert.deepEqual((await search(query)).map((item) => item.entryId), [ten.id, reserved.id, one.id, ...(["HT", "ht", "H"].includes(query) ? [named.id] : [])], query);
    for (const query of ["HT1", "HT-01", "ht 01"]) assert.deepEqual((await search(query)).map((item) => item.entryId), query === "HT1" ? [one.id, ten.id, named.id] : [one.id, ten.id], query);
    assert.deepEqual((await search("TERASO")).map((item) => item.entryId), [one.id]);
    assert.equal((await search("HT1")).find((item) => item.entryId === named.id)!.name, "Chosen product", "name matching includes inactive options but shows the active one");
    const blank = await search("  ");
    assert.deepEqual(blank.map((item) => item.entryId), [ten.id, reserved.id, one.id, named.id, fixture.id], "Schedule section enum order is preserved");
    assert.equal(blank.find((item) => item.entryId === reserved.id)!.name, null);
    assert.equal(blank.find((item) => item.entryId === reserved.id)!.thumbnailUrl, null);
    assert.ok(!blank.some((item) => item.entryId === foreign.id));
    for (let index = 3; index < 14; index++) if (index !== 10) await make(index, index + 3);
    assert.equal((await search("")).length, 10);
    assert.deepEqual(await search("@"), await search(""));
    assert.equal((await search("HT")).length, 10);
    assert.equal((await search("HT-01"))[0].entryId, one.id, "exact survives the ten-result bound");
    assert.deepEqual(await search("no matching product"), []);
  });

  it("signs the final-else-active image for search and note item views without persisting URLs", async () => {
    const { projectId } = await newProject("Suggestion thumbnails");
    const phase = await phaseOf(projectId, "moodboard");
    const db = testDb.prisma;
    const entry = await db.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "tile", prefix: "HT", increment: 1, sort_order: 0, active_index: 0 } });
    for (const key of ["notes/active", "notes/final"]) await storage.put({ key, body: new Uint8Array([1]), contentType: "image/png", bytes: 1 });
    await db.sfScheduleOption.createMany({ data: [
      { entry_id: entry.id, label: "A2", product_name: "Final name", search_key: "final", image_key: "notes/final", is_final: true },
      { entry_id: entry.id, label: "A10", product_name: "Active name", search_key: "active", image_key: "notes/active" },
    ] });
    const note = await sf.workspace.createWorkspaceCard({ ...as(designer), projectId, phaseId: phase.id, body: "Use @HT-01", itemEntryIds: [entry.id] });
    const search = () => sf.workspace.searchNoteItems({ grants: ALL, projectId, query: "HT" });
    const read = async () => (await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId })).notes.find((item) => item.id === note.cardId)!.items[0];
    assert.equal((await search())[0].name, "Final name");
    assert.match((await search())[0].thumbnailUrl!, /notes%2Ffinal\?expires=900$/);
    assert.equal((await read()).entryId, entry.id);
    assert.equal((await read()).thumbnailUrl, (await search())[0].thumbnailUrl);
    await db.sfScheduleOption.updateMany({ where: { entry_id: entry.id }, data: { is_final: false } });
    assert.equal((await search())[0].name, "Active name", "the canonical option order determines active index");
    assert.match((await read()).thumbnailUrl!, /notes%2Factive\?expires=900$/);
    await storage.remove("notes/active");
    assert.equal((await search())[0].thumbnailUrl, null, "a storage failure stays local to the thumbnail");
    assert.equal((await read()).thumbnailUrl, null);
    assert.deepEqual((await db.sfScheduleOption.findMany({ where: { entry_id: entry.id }, orderBy: { label: "asc" } })).map((item) => item.image_key), ["notes/active", "notes/final"]);
  });
});

describe("WO-SF-NOTES-PRESENTATION-IMAGE-01 slice A", () => {
  it("refuses sequential stale edits, flags and deletion of a phase note without changing the first save", async () => {
    const { projectId } = await newProject("Versioned phase Notes");
    const phase = await phaseOf(projectId, "moodboard");
    const { noteId } = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: phase.id, body: "Before" });
    const base = { ...as(designer), projectId, cardId: noteId };
    const read = (await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId })).notes[0]!;
    await sf.workspace.updateWorkspaceCardText({ ...base, body: "First editor", version: read.version, itemEntryIds: [] });
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, body: "Old second draft", version: read.version, itemEntryIds: [] }), "WORKSPACE_CARD_STALE");
    await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...base, pinned: true, version: read.version }), "WORKSPACE_CARD_STALE");
    await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...base, version: read.version }), "WORKSPACE_CARD_STALE");
    const saved = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: noteId } });
    assert.deepEqual([saved.body, saved.version, saved.is_pinned], ["First editor", read.version + 1, false]);
  });

  it("edits, stars and deletes General notes under document rights with Board disabled, without widening phase rights", async () => {
    const { projectId } = await newProject("General Notes with Board off");
    await testDb.prisma.moduleState.create({ data: { module_id: "workspace-board", state: "DISABLED", last_version: "1.0.0", updated_by: "test" } });
    const base = { ...as(drafter, DRAFTER_GRANTS), projectId };
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, body: "General" });
    const saved = await sf.workspace.updateWorkspaceCardText({ ...base, cardId, body: "Edited General", version: await noteVersion(cardId), itemEntryIds: [] });
    const starred = await sf.workspace.setWorkspaceCardFlags({ ...base, cardId, pinned: true, version: saved.version });
    assert.equal((await sf.workspace.listProjectNotes({ grants: ALL, actorId: designer.id, projectId, starred: true })).notes[0]!.id, cardId);
    const grants = [P.access, P.projectRead, P.phaseWork];
    const unassigned = await seedUser("Unassigned phase-work holder", grants);
    const viewer = await seedUser("Notes viewer", [P.access, P.projectRead]);
    // Canonical phase transition rights derive from the same project PIC assignment as document rights.
    // A phase-work grant alone is not that assignment; inventing a phase-only PIC would change the policy.
    for (const ctx of [as(unassigned, grants), as(viewer, [P.access, P.projectRead])]) {
      await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...ctx, projectId, cardId, body: "Denied", version: starred.version, itemEntryIds: [] }), "PERMISSION_DENIED");
      await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...ctx, projectId, cardId, pinned: false, version: starred.version }), "PERMISSION_DENIED");
      await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...ctx, projectId, cardId, version: starred.version }), "PERMISSION_DENIED");
    }
    const moodboard = await phaseOf(projectId, "moodboard");
    const labelled = await sf.phases.postPhaseNote({ ...as(designer), projectId, phaseId: moodboard.id, body: "Designer phase" });
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId: labelled.noteId, body: "Wrong seat", version: await noteVersion(labelled.noteId), itemEntryIds: [] }), "PERMISSION_DENIED");
    await sf.workspace.deleteWorkspaceCard({ ...base, cardId, version: starred.version });
    assert.equal(await testDb.prisma.sfWorkspaceCard.findUnique({ where: { id: cardId } }), null);
    assert.equal((await testDb.prisma.moduleState.findUniqueOrThrow({ where: { module_id: "workspace-board" } })).state, "DISABLED");
  });

  it("refuses every existing-note mutation on completed, archived and non-ACTIVE projects", async () => {
    const { projectId } = await newProject("Closed Notes");
    const base = { ...as(designer), projectId };
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, body: "Keep" });
    const version = await noteVersion(cardId);
    for (const [status, archived_at, code] of [
      ["COMPLETED", null, "PROJECT_COMPLETED"],
      ["ACTIVE", clock, "PROJECT_ARCHIVED"],
      ["ON_HOLD", null, "PROJECT_NOT_ACTIVE"],
    ] as const) {
      await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { status, archived_at } });
      await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId, version, body: "Denied", itemEntryIds: [] }), code);
      await rejectsWith(sf.workspace.setWorkspaceCardFlags({ ...base, cardId, version, pinned: true }), code);
      await rejectsWith(sf.workspace.deleteWorkspaceCard({ ...base, cardId, version }), code);
    }
    assert.equal((await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } })).body, "Keep");
  });

  it("replaces the full edited mention set atomically while preserving Board's omitted-link semantics", async () => {
    const { projectId } = await newProject("Edited Notes links");
    const base = { ...as(designer), projectId };
    const entries = [];
    for (let n = 1; n <= 11; n++) entries.push(await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "tile", prefix: "HT", increment: n, sort_order: n } }));
    const { cardId } = await sf.workspace.createWorkspaceCard({ ...base, body: "Use @HT-01", itemEntryIds: [entries[0]!.id] });
    let saved = await sf.workspace.updateWorkspaceCardText({ ...base, cardId, version: await noteVersion(cardId), body: "Removed mention", itemEntryIds: [] });
    assert.equal(await testDb.prisma.sfNoteItemLink.count({ where: { card_id: cardId } }), 0);
    saved = await sf.workspace.updateWorkspaceCardText({ ...base, cardId, version: saved.version, body: "Use @HT-02 @ht2", itemEntryIds: [entries[1]!.id, entries[1]!.id] });
    assert.deepEqual((await testDb.prisma.sfNoteItemLink.findMany({ where: { card_id: cardId } })).map((link) => [link.entry_id, link.code_snapshot]), [[entries[1]!.id, "HT-02"]]);
    saved = await sf.workspace.updateWorkspaceCardText({ ...base, cardId, version: saved.version, body: "Board has an explicit association" });
    assert.equal(await testDb.prisma.sfNoteItemLink.count({ where: { card_id: cardId } }), 1, "undefined keeps Board links");
    const other = await newProject("Foreign linked item");
    const foreign = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: other.projectId, section: "MATERIAL", category: "Tile", category_key: "tile", prefix: "HT", increment: 1, sort_order: 0 } });
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId, version: saved.version, body: "Too many", itemEntryIds: entries.map((entry) => entry.id) }), "NOTE_ITEM_LIMIT");
    await rejectsWith(sf.workspace.updateWorkspaceCardText({ ...base, cardId, version: saved.version, body: "Foreign", itemEntryIds: [foreign.id] }), "NOTE_ITEM_INVALID");
    const after = await testDb.prisma.sfWorkspaceCard.findUniqueOrThrow({ where: { id: cardId } });
    assert.deepEqual([after.body, after.version], ["Board has an explicit association", saved.version], "failed link validation rolls the text/version back too");
    assert.deepEqual((await testDb.prisma.sfNoteItemLink.findMany({ where: { card_id: cardId } })).map((link) => link.entry_id), [entries[1]!.id]);
  });
});
