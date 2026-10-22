import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closePrismaConnection } from "@platform/core/db";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { createIntegrationTokenService, REFERENCE_SCOPE_GRANTS } from "@platform/core/integrations";
import { initializeModuleRegistry, resetModuleRegistryForTests } from "@platform/core/modules";
import { initializePermissionRegistry, resetPermissionRegistryForTests } from "@platform/core/rbac/registry";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";

import { APP_REGISTRATIONS, MODULE_MANIFESTS } from "../../app/app-registrations";
import { createEntry, listProjects, readSchedule, resolveEntries, scheduleTitle } from "./runtime";
import { SKETCHUP_READ_SCOPE, SKETCHUP_SCOPE_GRANTS, SKETCHUP_WRITE_SCOPE } from "./scope-grants";

/**
 * WO-SKETCHUP-01 rev 2, Stage 1a: the four SketchUp routes through the real platform integration kit (token, scope,
 * live grants, module switch, idempotency, transaction) against the disposable rebuild test database.
 */

let testDb: TestDb;
const DESIGNER = Object.values(P).filter((permission) => permission !== P.projectManage && permission !== P.projectOverride && permission !== P.phaseOverride);
const TOKEN_GRANTS = ["platform.integration.manage", P.sketchupUse];
const BOTH = [SKETCHUP_READ_SCOPE, SKETCHUP_WRITE_SCOPE];
const BASE = "http://localhost/api/integrations/v1/sketchup";

type Person = { id: string; name: string };
type Envelope = { ok: boolean; data?: any; error?: { kind: string; code: string; safeMessage: string } };

let designer: Person;
let drafter: Person;

async function seedUser(name: string, grants: readonly string[]): Promise<Person> {
  const id = randomUUID();
  const roleId = randomUUID();
  await testDb.prisma.user.create({ data: { id, email: `${id}@test.local`, display_name: name, password_hash: "x" } });
  await testDb.prisma.role.create({ data: { id: roleId, code: `role-${roleId}`, name: `${name} role` } });
  await testDb.prisma.rolePermission.createMany({ data: grants.map((permission) => ({ id: randomUUID(), role_id: roleId, permission_id: permission })) });
  await testDb.prisma.userRole.create({ data: { id: randomUUID(), user_id: id, role_id: roleId } });
  return { id, name };
}

async function setGrants(person: Person, grants: readonly string[]) {
  const role = await testDb.prisma.userRole.findFirstOrThrow({ where: { user_id: person.id } });
  await testDb.prisma.rolePermission.deleteMany({ where: { role_id: role.role_id } });
  await testDb.prisma.rolePermission.createMany({ data: grants.map((permission) => ({ id: randomUUID(), role_id: role.role_id, permission_id: permission })) });
}

function tokens() {
  return createIntegrationTokenService({ db: testDb.prisma, runTransaction: (work) => testDb.prisma.$transaction(work), auditWriter: createAuditEventWriter(), now: () => new Date(), generateId: randomUUID });
}

async function tokenFor(person: Person, scopes: readonly string[] = BOTH) {
  const created = await tokens().createOwn({ userId: person.id, displayName: person.name, grants: TOKEN_GRANTS, label: "SketchUp", scopes, scopeGrants: [...REFERENCE_SCOPE_GRANTS, ...SKETCHUP_SCOPE_GRANTS] });
  return created.secret;
}

async function setModule(state: "ENABLED" | "DISABLED") {
  await testDb.prisma.moduleState.upsert({
    where: { module_id: "sketchup" },
    create: { module_id: "sketchup", state, last_version: "1.0.0", updated_by: "test" },
    update: { state },
  });
}

async function newProject(name: string) {
  const project = await testDb.prisma.sfProject.create({ data: { name, pic_designer_id: designer.id, pic_drafter_id: drafter.id, created_by_id: designer.id } });
  return project.id;
}

async function entry(projectId: string, category: string, prefix: string, increment: number, options: Array<{ label: string; brand?: string; product: string; final?: boolean }> = []) {
  const row = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category, category_key: category.toUpperCase(), prefix, increment, sort_order: increment } });
  for (const option of options) {
    await testDb.prisma.sfScheduleOption.create({ data: { entry_id: row.id, label: option.label, brand_name: option.brand ?? null, product_name: option.product, is_final: option.final ?? false, status: option.final ? "APPROVED" : "DRAFT", search_key: option.product.toLowerCase() } });
  }
  return row.id;
}

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

function req(method: "GET" | "POST", path: string, secret?: string, body?: unknown, key?: string) {
  return new Request(`${BASE}/${path}`, {
    method,
    headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(response: Promise<Response>) {
  const res = await response;
  return { status: res.status, replayed: res.headers.get("idempotency-replayed") === "true", body: (await res.json()) as Envelope };
}

const schedule = (secret: string, projectId: string) => call(readSchedule(req("GET", `projects/${projectId}/schedule`, secret), params(projectId)));
const resolve = (secret: string, projectId: string, entryIds: string[]) => call(resolveEntries(req("POST", `projects/${projectId}/resolve`, secret, { entryIds }), params(projectId)));
const create = (secret: string, projectId: string, body: unknown, key: string = randomUUID()) => call(createEntry(req("POST", `projects/${projectId}/entries`, secret, body, key), params(projectId)));

before(async () => {
  resetPermissionRegistryForTests();
  initializePermissionRegistry(APP_REGISTRATIONS);
  resetModuleRegistryForTests();
  initializeModuleRegistry(MODULE_MANIFESTS);
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
});

beforeEach(async () => {
  await testDb.pool.query(`TRUNCATE TABLE ${["sf_schedule_sample_request", "sf_schedule_option", "sf_schedule_entry", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix", "sf_project"].map((table) => `"studioflow"."${table}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await truncatePlatformTables(testDb);
  await setModule("ENABLED");
  designer = await seedUser("Dina Designer", DESIGNER);
  drafter = await seedUser("Dodi Drafter", DESIGNER);
});

after(async () => {
  resetModuleRegistryForTests();
  await closePrismaConnection();
  await closeTestDb(testDb);
});

describe("module switch, token and scopes", () => {
  it("refuses every route while the module is off and offers the scopes only with the module grant", async () => {
    const projectId = await newProject("Switch");
    const secret = await tokenFor(designer);
    await setModule("DISABLED");
    assert.equal((await call(listProjects(req("GET", "projects", secret)))).status, 403);
    assert.equal((await schedule(secret, projectId)).status, 403);
    assert.equal((await resolve(secret, projectId, [randomUUID()])).status, 403);
    assert.equal((await create(secret, projectId, { section: "MATERIAL", category: "Paint" })).status, 403);
    await setModule("ENABLED");
    assert.equal((await call(listProjects(req("GET", "projects", secret)))).status, 200);
    await assert.rejects(
      tokens().createOwn({ userId: designer.id, displayName: designer.name, grants: ["platform.integration.manage"], label: "No grant", scopes: [SKETCHUP_READ_SCOPE], scopeGrants: SKETCHUP_SCOPE_GRANTS }),
      (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN",
    );
  });

  it("checks the token, the scope and the live grants on every call", async () => {
    const projectId = await newProject("Auth");
    assert.equal((await schedule("", projectId)).status, 401);
    const readOnly = await tokenFor(designer, [SKETCHUP_READ_SCOPE]);
    assert.equal((await schedule(readOnly, projectId)).status, 200);
    assert.equal((await create(readOnly, projectId, { section: "MATERIAL", category: "Paint" })).body.error?.code, "INTEGRATION_SCOPE_DENIED");
    assert.equal(await testDb.prisma.sfScheduleEntry.count(), 0);
    const secret = await tokenFor(designer);
    await setGrants(designer, DESIGNER.filter((permission) => permission !== P.scheduleManage));
    assert.equal((await create(secret, projectId, { section: "MATERIAL", category: "Paint" })).status, 403);
    await setGrants(designer, DESIGNER.filter((permission) => permission !== P.sketchupUse));
    assert.equal((await schedule(secret, projectId)).status, 403);
  });

  it("refuses an invalid body before anything runs", async () => {
    const projectId = await newProject("Validation");
    const secret = await tokenFor(designer);
    assert.equal((await create(secret, projectId, { section: "MATERIAL", category: "Paint", extra: true })).status, 400);
    assert.equal((await create(secret, projectId, { section: "ROOF", category: "Paint" })).status, 400);
    assert.equal((await resolve(secret, projectId, [])).status, 400);
    assert.equal((await resolve(secret, projectId, ["not-a-uuid"])).status, 400);
    assert.equal(await testDb.prisma.sfScheduleEntry.count(), 0);
  });
});

describe("reads", () => {
  it("lists the schedule with codes and the final option (else A) as title, and no storage keys", async () => {
    const projectId = await newProject("Read");
    await entry(projectId, "Solid Surface", "SO", 1, [{ label: "A", brand: "Corian", product: "Deep Nocturne" }, { label: "B", brand: "Corian", product: "Glacier White", final: true }]);
    await entry(projectId, "Paint", "PT", 8, [{ label: "A", product: "Texture Paint" }]);
    await entry(projectId, "Paint", "PT", 9);
    const secret = await tokenFor(designer);
    const read = await schedule(secret, projectId);
    assert.equal(read.status, 200, JSON.stringify(read.body));
    assert.deepEqual(read.body.data.entries.map((row: { code: string; title: string }) => [row.code, row.title]), [["PT-08", "Texture Paint"], ["PT-09", ""], ["SO-01", "Corian Glacier White"]]);
    assert.equal(JSON.stringify(read.body).includes("image_key"), false);
    assert.ok(Array.isArray(read.body.data.categoryChoices));
    assert.equal(scheduleTitle([]), "");
  });

  it("resolves linked items to their current code, and another project's or a deleted item to null", async () => {
    const projectId = await newProject("Resolve");
    const otherId = await newProject("Other");
    const mine = await entry(projectId, "High Pressure Laminate", "PL", 1);
    const foreign = await entry(otherId, "Paint", "PT", 1);
    const gone = randomUUID();
    const secret = await tokenFor(designer);
    await testDb.prisma.sfScheduleEntry.update({ where: { id: mine }, data: { increment: 7 } });
    const resolved = await resolve(secret, projectId, [mine, foreign, gone, mine]);
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
    assert.deepEqual(resolved.body.data, [{ entryId: mine, code: "PL-07" }, { entryId: foreign, code: null }, { entryId: gone, code: null }]);
  });

  it("lets only the assigned team read a project's schedule", async () => {
    const projectId = await newProject("Access");
    const outsider = await seedUser("Olga Outsider", DESIGNER);
    const secret = await tokenFor(outsider);
    assert.equal((await schedule(secret, projectId)).status, 403);
    assert.deepEqual((await call(listProjects(req("GET", "projects", secret)))).body.data, []);
  });
});

describe("create entry", () => {
  it("lets StudioFlow allocate the next code, audits it as sketchup, and replays an exact retry", async () => {
    const projectId = await newProject("Create");
    await entry(projectId, "Solid Surface", "SO", 1);
    await testDb.prisma.sfSchedulePrefix.create({ data: { section: "MATERIAL", category: "Solid Surface", category_key: "SOLID SURFACE", prefix: "SO" } });
    const secret = await tokenFor(designer);
    const key = randomUUID();
    const first = await create(secret, projectId, { section: "MATERIAL", category: "Solid Surface" }, key);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual({ ...first.body.data, entryId: undefined }, { entryId: undefined, code: "SO-02", category: "Solid Surface", prefix: "SO" });
    const again = await create(secret, projectId, { section: "MATERIAL", category: "Solid Surface" }, key);
    assert.equal(again.replayed, true);
    assert.deepEqual(again.body, first.body);
    assert.equal(await testDb.prisma.sfScheduleEntry.count({ where: { project_id: projectId } }), 2);
    const audit = await testDb.prisma.auditEvent.findFirstOrThrow({ where: { action: "studioflow.schedule.entry-created" } });
    assert.equal((audit.metadata as Record<string, unknown>).via, "sketchup");
    assert.equal((await create(secret, projectId, { section: "MATERIAL", category: "Solid Surface" }, "")).body.error?.code, "IDEMPOTENCY_KEY_REQUIRED");
  });

  it("refuses a new category that looks like a studio one unless the user confirms it", async () => {
    const projectId = await newProject("Similar");
    await testDb.prisma.sfSchedulePrefix.create({ data: { section: "MATERIAL", category: "High Pressure Laminate", category_key: "HIGH PRESSURE LAMINATE", prefix: "PL" } });
    const secret = await tokenFor(designer);
    const refused = await create(secret, projectId, { section: "MATERIAL", category: "HPL" });
    assert.equal(refused.body.error?.code, "SKETCHUP_CATEGORY_SIMILAR");
    assert.match(refused.body.error?.safeMessage ?? "", /High Pressure Laminate \(PL\)/);
    assert.equal(await testDb.prisma.sfScheduleEntry.count(), 0);
    const confirmed = await create(secret, projectId, { section: "MATERIAL", category: "HPL", confirmNewCategory: true });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const studio = await create(secret, projectId, { section: "MATERIAL", category: "High Pressure Laminate" });
    assert.equal(studio.body.data.code, "PL-01");
  });

  it("refuses archived and completed projects", async () => {
    const archived = await newProject("Archived");
    const completed = await newProject("Completed");
    await testDb.prisma.sfProject.update({ where: { id: archived }, data: { archived_at: new Date() } });
    await testDb.prisma.sfProject.update({ where: { id: completed }, data: { status: "COMPLETED" } });
    const secret = await tokenFor(designer);
    assert.equal((await create(secret, archived, { section: "MATERIAL", category: "Paint" })).body.error?.code, "PROJECT_ARCHIVED");
    assert.equal((await create(secret, completed, { section: "MATERIAL", category: "Paint" })).body.error?.code, "PROJECT_COMPLETED");
    assert.equal(await testDb.prisma.sfScheduleEntry.count(), 0);
  });
});
