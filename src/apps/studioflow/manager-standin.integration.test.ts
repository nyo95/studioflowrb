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

import { APP_REGISTRATIONS } from "../../app/app-registrations";
import { LEGACY_PHASE_DEFINITION_IDS as LEGACY } from "./domain/phase";
import { STUDIOFLOW_PERMISSIONS as P } from "./permissions";
import { STUDIOFLOW_ROLE_PROFILES } from "./role-profiles";
import { createStudioFlowService, type StudioFlowService } from "./service";
import type { StudioFlowPorts } from "./shared";

const ALL = [...Object.values(P)];
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

const MANAGER = [...STUDIOFLOW_ROLE_PROFILES.find((profile) => profile.code === "studio-manager")!.permissionIds] as string[];
const DESIGNER = [...STUDIOFLOW_ROLE_PROFILES.find((profile) => profile.code === "designer")!.permissionIds] as string[];

describe("Manager stands in for an absent PIC (WO-SF-ROLES-01)", () => {
  it("lets the Manager profile update status through the phase buttons without reading the private book", async () => {
    const projectId = await newProject("Absent PIC");
    const moodboard = await phaseOf(projectId, LEGACY.moodboard);
    const round = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id, status: "NOT_SENT" } });
    const manager = await seedUser("Mona Manager", MANAGER);
    const base = { ...as(manager, MANAGER), projectId, phaseId: moodboard.id };

    await sf.phases.sendIteration({ ...base, iterationId: round.id });
    await sf.phases.recordClientAnswer({ ...base, iterationId: round.id, note: "Client wants a lighter floor" });
    await sf.phases.chooseIterationOutcome({ ...base, iterationId: round.id, outcome: "REVISION" });
    assert.deepEqual((await testDb.prisma.sfRevision.findMany({ where: { phase_id: moodboard.id }, orderBy: { major: "asc" } })).map((row) => row.status), ["REVISED", "NOT_SENT"]);

    // The client's answer is a workflow record: the Manager sees it. The private book stays closed to the Manager.
    const notes = await sf.workspace.listProjectNotes({ grants: MANAGER, actorId: manager.id, projectId, limit: 20 });
    assert.ok(notes.notes.some((note) => note.body.includes("lighter floor")));
    await rejectsWith(sf.bookTodos.listProjectTodos({ grants: MANAGER, actorId: manager.id, projectId }), "PROJECT_NOT_FOUND");
    const next = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id, status: "NOT_SENT" } });
    await rejectsWith(sf.bookFeedback.recordClientFeedback({ ...as(manager, MANAGER), projectId, iterationId: next.id, points: ["Through the book"] }), "PERMISSION_DENIED");
    // The Manager may also reset a phase's history (owner, 2026-10-24); the same call is refused for a plain Designer.
    await rejectsWith(sf.phases.overrideRevision({ ...as(await seedUser("Dina Plain", DESIGNER), DESIGNER), projectId, phaseId: moodboard.id, mode: "HARD_RESET_ACTIVE", major: 1, note: "no" }), "PERMISSION_DENIED");
    await sf.phases.overrideRevision({ ...base, mode: "HARD_RESET_ACTIVE", major: 3, note: "PIC is away, restarting the phase" });
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "studioflow.phase.revision-overridden", actor_user_id: manager.id } }), 1);
    assert.deepEqual((await testDb.prisma.sfRevision.findMany({ where: { phase_id: moodboard.id } })).map((row) => row.major), [3]);
  });

  it("applies one override rule: manage and override together; override alone, or a Designer who is not on the project, is refused", async () => {
    const projectId = await newProject("One rule");
    const moodboard = await phaseOf(projectId, LEGACY.moodboard);
    const round = await testDb.prisma.sfRevision.findFirstOrThrow({ where: { phase_id: moodboard.id, status: "NOT_SENT" } });
    const send = (person: Person, grants: string[]) => sf.phases.sendIteration({ ...as(person, grants), projectId, phaseId: moodboard.id, iterationId: round.id });

    const stranger = await seedUser("Sam Stranger", DESIGNER);
    await rejectsWith(send(stranger, DESIGNER), "PERMISSION_DENIED");
    const halfConfigured = [P.access, P.projectRead, P.phaseWork, P.projectOverride];
    const half = await seedUser("Hana Half", halfConfigured);
    await rejectsWith(send(half, halfConfigured), "PERMISSION_DENIED");

    const pair = [P.access, P.projectRead, P.phaseWork, P.projectManage, P.projectOverride];
    const covering = await seedUser("Cora Cover", pair);
    await send(covering, pair);
    assert.equal((await testDb.prisma.sfRevision.findUniqueOrThrow({ where: { id: round.id } })).status, "SENT");
  });
});
