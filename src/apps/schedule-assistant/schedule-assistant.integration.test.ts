import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closePrismaConnection } from "@platform/core/db";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { createIntegrationTokenService, REFERENCE_SCOPE_GRANTS } from "@platform/core/integrations";
import { initializeModuleRegistry, resetModuleRegistryForTests } from "@platform/core/modules";
import { createNotificationWriter } from "@platform/core/notifications/persistence";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { initializePermissionRegistry, resetPermissionRegistryForTests } from "@platform/core/rbac/registry";
import { FakeObjectStorage } from "@platform/core/storage";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { createStudioFlowScheduleComposer, type ScheduleComposerOperation } from "@/apps/studioflow/public/schedule-composer";
import type { PrismaClient } from "@/generated/prisma/client";

import { APP_REGISTRATIONS, MODULE_MANIFESTS } from "../../app/app-registrations";
import { applyBatch, listProjects, previewBatch, readContext, searchBrands, searchReusableOptions } from "./runtime";
import { SCHEDULE_ASSISTANT_READ_SCOPE, SCHEDULE_ASSISTANT_SCOPE_GRANTS, SCHEDULE_ASSISTANT_WRITE_SCOPE } from "./scope-grants";

/**
 * WO-SCHEDULE-ASSISTANT-01 acceptance 1-12: the six routes through the real platform integration kit (token, scope,
 * live grants, module switch, idempotency, transaction) against the disposable rebuild test database.
 */

let testDb: TestDb;
const DESIGNER = Object.values(P).filter((permission) => permission !== P.projectManage && permission !== P.projectOverride && permission !== P.phaseOverride);
const MANAGER = [...DESIGNER, P.projectManage];
const TOKEN_GRANTS = ["platform.integration.manage", P.scheduleAssistantUse];
const BOTH = [SCHEDULE_ASSISTANT_READ_SCOPE, SCHEDULE_ASSISTANT_WRITE_SCOPE];
const BASE = "http://localhost/api/integrations/v1/schedule-assistant";

type Person = { id: string; name: string };
type Envelope = { ok: boolean; data?: any; error?: { kind: string; code: string; message: string } };

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
  const created = await tokens().createOwn({ userId: person.id, displayName: person.name, grants: TOKEN_GRANTS, label: "Schedule Assistant", scopes, scopeGrants: [...REFERENCE_SCOPE_GRANTS, ...SCHEDULE_ASSISTANT_SCOPE_GRANTS] });
  return created.secret;
}

async function setModule(state: "ENABLED" | "DISABLED") {
  await testDb.prisma.moduleState.upsert({
    where: { module_id: "schedule-assistant" },
    create: { module_id: "schedule-assistant", state, last_version: "1.0.0", updated_by: "test" },
    update: { state },
  });
}

async function newProject(name: string, pics: { designer?: Person; drafter?: Person } = {}) {
  const project = await testDb.prisma.sfProject.create({ data: { name, pic_designer_id: (pics.designer ?? designer).id, pic_drafter_id: (pics.drafter ?? drafter).id, created_by_id: designer.id } });
  return project.id;
}

const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

function req(method: "GET" | "POST", path: string, secret?: string, body?: unknown, key?: string) {
  return new Request(`${BASE}/${path}`, {
    method,
    headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(response: Promise<Response>) {
  const res = await response;
  return { status: res.status, replayed: res.headers.get("idempotency-replayed") === "true", body: (await res.json()) as Envelope };
}

const context = (secret: string, projectId: string) => call(readContext(req("GET", `projects/${projectId}/context`, secret), params(projectId)));
const preview = (secret: string, projectId: string, operations: unknown[]) => call(previewBatch(req("POST", `projects/${projectId}/preview`, secret, { operations }), params(projectId)));
function apply(secret: string, projectId: string, body: unknown, key: string) {
  return call(applyBatch(req("POST", `projects/${projectId}/apply`, secret, body, key), params(projectId)));
}

async function counts() {
  const [entries, options, audits, requests] = await Promise.all([
    testDb.prisma.sfScheduleEntry.count(),
    testDb.prisma.sfScheduleOption.count(),
    testDb.prisma.auditEvent.count(),
    testDb.prisma.integrationRequest.count(),
  ]);
  return { entries, options, audits, requests };
}

async function brand(name: string) {
  return testDb.prisma.brand.create({ data: { id: randomUUID(), name, slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 6)}` } });
}

async function template(section: "MATERIAL" | "FIXTURE", category: string, productName: string) {
  const parent = await testDb.prisma.sfScheduleTemplateCategory.create({ data: { section, category, category_key: category.toUpperCase(), sort_order: 1 } });
  return testDb.prisma.sfScheduleTemplateItem.create({ data: { template_category_id: parent.id, section, category, category_key: category.toUpperCase(), product_name: productName, sort_order: 1 } });
}

before(async () => {
  resetPermissionRegistryForTests();
  initializePermissionRegistry(APP_REGISTRATIONS);
  resetModuleRegistryForTests();
  initializeModuleRegistry(MODULE_MANIFESTS);
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
});

beforeEach(async () => {
  await testDb.pool.query(`TRUNCATE TABLE ${["sf_schedule_sample_request", "sf_schedule_option", "sf_schedule_entry", "sf_schedule_template_item", "sf_schedule_template_category", "sf_schedule_prefix", "sf_project"].map((table) => `"studioflow"."${table}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await testDb.pool.query(`TRUNCATE TABLE "master_data"."Brand" RESTART IDENTITY CASCADE`);
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
    assert.equal((await context(secret, projectId)).status, 403);
    assert.equal((await preview(secret, projectId, [{ op: "apply_templates" }])).status, 403);
    await setModule("ENABLED");
    assert.equal((await call(listProjects(req("GET", "projects", secret)))).status, 200);
    await assert.rejects(
      tokens().createOwn({ userId: designer.id, displayName: designer.name, grants: ["platform.integration.manage"], label: "No grant", scopes: [SCHEDULE_ASSISTANT_READ_SCOPE], scopeGrants: SCHEDULE_ASSISTANT_SCOPE_GRANTS }),
      (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN",
    );
  });

  it("checks the token, the scope and the live grants on every call", async () => {
    const projectId = await newProject("Auth");
    assert.equal((await context("", projectId)).status, 401);
    assert.equal((await context(`sfk_${"a".repeat(12)}_${"B".repeat(43)}`, projectId)).status, 401);
    const readOnly = await tokenFor(designer, [SCHEDULE_ASSISTANT_READ_SCOPE]);
    assert.equal((await context(readOnly, projectId)).status, 200);
    const denied = await apply(readOnly, projectId, { operationId: randomUUID(), digest: "f".repeat(64), operations: [{ op: "apply_templates" }] }, randomUUID());
    assert.equal(denied.body.error?.code, "INTEGRATION_SCOPE_DENIED");
    const secret = await tokenFor(designer);
    await setGrants(designer, DESIGNER.filter((permission) => permission !== P.scheduleManage));
    assert.equal((await preview(secret, projectId, [{ op: "apply_templates" }])).status, 403);
    await setGrants(designer, DESIGNER.filter((permission) => permission !== P.scheduleAssistantUse));
    assert.equal((await context(secret, projectId)).status, 403);
  });
});

describe("project access", () => {
  it("lets only the assigned team or a manager read, and only the assigned team apply", async () => {
    const projectId = await newProject("Access");
    const outsider = await seedUser("Olga Outsider", DESIGNER);
    const manager = await seedUser("Mira Manager", MANAGER);
    const outsiderToken = await tokenFor(outsider);
    const managerToken = await tokenFor(manager);
    assert.equal((await context(outsiderToken, projectId)).status, 403);
    assert.equal((await preview(outsiderToken, projectId, [{ op: "apply_templates" }])).status, 403);
    assert.deepEqual((await call(listProjects(req("GET", "projects", outsiderToken)))).body.data, []);
    const managerContext = await context(managerToken, projectId);
    assert.equal(managerContext.status, 200);
    assert.equal(managerContext.body.data.project.canApply, false);
    assert.equal((await preview(managerToken, projectId, [{ op: "apply_templates" }])).status, 403);
    const designerToken = await tokenFor(designer);
    const listed = (await call(listProjects(req("GET", "projects", designerToken)))).body.data;
    assert.deepEqual(listed, [{ id: projectId, name: "Access", status: "ACTIVE", canApply: true }]);
  });

  it("refuses preview and apply on archived and completed projects", async () => {
    const archived = await newProject("Archived");
    const completed = await newProject("Completed");
    await testDb.prisma.sfProject.update({ where: { id: archived }, data: { archived_at: new Date() } });
    await testDb.prisma.sfProject.update({ where: { id: completed }, data: { status: "COMPLETED" } });
    const secret = await tokenFor(designer);
    assert.equal((await preview(secret, archived, [{ op: "apply_templates" }])).body.error?.code, "PROJECT_ARCHIVED");
    assert.equal((await preview(secret, completed, [{ op: "apply_templates" }])).body.error?.code, "PROJECT_COMPLETED");
    assert.equal((await apply(secret, completed, { operationId: randomUUID(), digest: "f".repeat(64), operations: [{ op: "apply_templates" }] }, randomUUID())).body.error?.code, "PROJECT_COMPLETED");
    const listed = (await call(listProjects(req("GET", "projects", secret)))).body.data as Array<{ name: string; canApply: boolean }>;
    assert.deepEqual(listed.map((project) => [project.name, project.canApply]), [["Completed", false]]);
  });
});

describe("preview", () => {
  it("writes nothing, even while it applies templates and allocates codes", async () => {
    const projectId = await newProject("Dry run");
    await template("MATERIAL", "Paint", "Jotun Majestic");
    const secret = await tokenFor(designer);
    const before = await counts();
    const result = await preview(secret, projectId, [
      { op: "apply_templates" },
      { op: "create_entry", ref: "lamp", section: "FIXTURE", category: "Downlight", qty: "12", unit: "pcs", option: { productName: "Philips DN020" } },
      { op: "create_option", entryRef: "lamp", option: { productName: "Osram LEDvance" } },
    ]);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.valid, true);
    assert.match(result.body.data.digest, /^[a-f0-9]{64}$/);
    assert.equal(result.body.data.templatesCreated, 1);
    const [, lamp, extra] = result.body.data.operations;
    assert.equal(lamp.entryCode, "DO-01");
    assert.equal(lamp.optionLabel, "A");
    assert.equal(lamp.newCategory, true);
    assert.equal(lamp.entryId, undefined);
    assert.equal(extra.optionLabel, "B");
    assert.deepEqual(await counts(), before);
  });

  it("returns every issue of an invalid batch at once, with indexes and Brand suggestions", async () => {
    const projectId = await newProject("Issues");
    const otherProject = await newProject("Other");
    const foreign = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: otherProject, section: "FIXTURE", category: "Lamp", category_key: "LAMP", prefix: "LA", increment: 1, sort_order: 1 } });
    const own = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "FIXTURE", category: "Lamp", category_key: "LAMP", prefix: "LA", increment: 1, sort_order: 1 } });
    await brand("Roman Granit");
    const secret = await tokenFor(designer);
    const before = await counts();
    const result = await preview(secret, projectId, [
      { op: "create_entry", section: "MATERIAL", category: "Tile", qty: "3", option: { productName: "Granitio", brandName: "Roman" } },
      { op: "update_entry", entryId: foreign.id, location: "Lobby" },
      { op: "update_entry", entryId: own.id, location: "Lobby" },
      { op: "update_entry", entryId: own.id, qty: "1.234" },
      { op: "create_option", entryRef: "missing", option: { productName: "X" } },
      { op: "apply_templates" },
    ]);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.valid, false);
    const issues = result.body.data.issues as Array<{ index: number; code: string; suggestions?: Array<{ name: string }> }>;
    assert.deepEqual(issues.map((issue) => [issue.index, issue.code]), [
      [0, "SCHEDULE_QTY_NOT_FOR_MATERIAL"],
      [0, "SCHEDULE_BRAND_NOT_FOUND"],
      [1, "SCHEDULE_ENTRY_NOT_FOUND"],
      [3, "SCHEDULE_DUPLICATE_UPDATE"],
      [3, "SCHEDULE_QTY_INVALID"],
      [4, "SCHEDULE_ENTRY_REF_INVALID"],
      [5, "SCHEDULE_TEMPLATES_FIRST"],
    ]);
    assert.deepEqual(issues[1].suggestions?.map((suggestion) => suggestion.name), ["Roman Granit"]);
    assert.deepEqual(await counts(), before);
    const shape = await preview(secret, projectId, [{ op: "delete_entry", entryId: own.id }]);
    assert.equal(shape.body.error?.code, "INTEGRATION_BODY_INVALID");
  });
});

describe("apply", () => {
  it("applies exactly the previewed batch: same codes, never final, Brand snapshot, audited, read back", async () => {
    const projectId = await newProject("Apply");
    const roman = await brand("Roman");
    const secret = await tokenFor(designer);
    const operations = [
      { op: "create_entry", ref: "tile", section: "MATERIAL", category: "Tile", location: "Lobby", option: { productName: "Granitio", brandId: roman.id, color: "Ivory" } },
      { op: "create_option", entryRef: "tile", option: { productName: "Granitio Matt", brandId: roman.id } },
      { op: "create_entry", section: "FIXTURE", category: "Downlight", qty: "4", unit: "pcs" },
    ];
    const previewed = (await preview(secret, projectId, operations)).body.data;
    const operationId = randomUUID();
    const applied = await apply(secret, projectId, { operationId, digest: previewed.digest, operations }, operationId);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const results = applied.body.data.operations as Array<{ entryCode: string; optionLabel?: string; entryId: string }>;
    assert.deepEqual(results.map((result) => [result.entryCode, result.optionLabel ?? null]), previewed.operations.map((result: { entryCode: string; optionLabel?: string }) => [result.entryCode, result.optionLabel ?? null]));
    const options = await testDb.prisma.sfScheduleOption.findMany({ orderBy: { label: "asc" } });
    assert.deepEqual(options.map((option) => [option.label, option.is_final, option.status, option.brand_name]), [["A", false, "DRAFT", "Roman"], ["B", false, "DRAFT", "Roman"]]);
    const audits = await testDb.prisma.auditEvent.findMany({ where: { app_id: "studioflow" } });
    assert.equal(audits.length, 3);
    for (const audit of audits) assert.deepEqual([(audit.metadata as Record<string, unknown>).via, (audit.metadata as Record<string, unknown>).operationId], ["schedule-assistant", operationId]);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { action: "integration.write" } }), 1);
    const readBack = (await context(secret, projectId)).body.data;
    assert.deepEqual(readBack.entries.map((entry: { code: string }) => entry.code).sort(), ["DO-01", "TI-01"]);
  });

  it("refuses a stale preview and writes nothing", async () => {
    const projectId = await newProject("Stale");
    const secret = await tokenFor(designer);
    const operations = [{ op: "create_entry", section: "FIXTURE", category: "Lamp" }];
    const previewed = (await preview(secret, projectId, operations)).body.data;
    await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "FIXTURE", category: "Chair", category_key: "CHAIR", prefix: "CH", increment: 1, sort_order: 1 } });
    const before = await counts();
    const operationId = randomUUID();
    const stale = await apply(secret, projectId, { operationId, digest: previewed.digest, operations }, operationId);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error?.code, "SCHEDULE_PREVIEW_STALE");
    const after = await counts();
    assert.equal(after.entries, before.entries);
    assert.equal(after.options, before.options);
  });

  it("replays an exact retry and refuses the same key with a different body", async () => {
    const projectId = await newProject("Replay");
    const secret = await tokenFor(designer);
    const operations = [{ op: "create_entry", section: "FIXTURE", category: "Lamp" }];
    const previewed = (await preview(secret, projectId, operations)).body.data;
    const operationId = randomUUID();
    const body = JSON.stringify({ operationId, digest: previewed.digest, operations });
    const first = await apply(secret, projectId, body, operationId);
    const again = await apply(secret, projectId, body, operationId);
    assert.equal(first.status, 200);
    assert.equal(again.replayed, true);
    assert.deepEqual(again.body, first.body);
    assert.equal(await testDb.prisma.sfScheduleEntry.count(), 1);
    const changed = await apply(secret, projectId, { operationId, digest: previewed.digest, operations: [{ op: "create_entry", section: "FIXTURE", category: "Chair" }] }, operationId);
    assert.equal(changed.body.error?.code, "IDEMPOTENCY_KEY_REUSED");
  });

  it("never gives two concurrent batches the same code", async () => {
    const projectId = await newProject("Concurrent");
    const secret = await tokenFor(designer);
    const one = [{ op: "create_entry", section: "FIXTURE", category: "Lamp", option: { productName: "One" } }];
    const two = [{ op: "create_entry", section: "FIXTURE", category: "Lamp", option: { productName: "Two" } }];
    const [first, second] = await Promise.all([preview(secret, projectId, one), preview(secret, projectId, two)]);
    const keys = [randomUUID(), randomUUID()];
    const results = await Promise.all([
      apply(secret, projectId, { operationId: keys[0], digest: first.body.data.digest, operations: one }, keys[0]),
      apply(secret, projectId, { operationId: keys[1], digest: second.body.data.digest, operations: two }, keys[1]),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.ok(statuses.every((status) => status === 200 || status === 409), JSON.stringify(statuses));
    for (const result of results.filter((item) => item.status === 409)) assert.equal(result.body.error?.code, "SCHEDULE_PREVIEW_STALE");
    const codes = (await testDb.prisma.sfScheduleEntry.findMany({ where: { project_id: projectId } })).map((entry) => `${entry.prefix}-${entry.increment}`);
    assert.equal(new Set(codes).size, codes.length);
    assert.equal(codes.length, statuses.filter((status) => status === 200).length);
  });

  it("patches an option: omitted fields stay, null clears, the photo stays, an unchanged patch writes nothing", async () => {
    const projectId = await newProject("Patch");
    const roman = await brand("Roman");
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "TILE", prefix: "TI", increment: 1, sort_order: 1 } });
    const option = await testDb.prisma.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", brand_id: roman.id, brand_name: "Roman", product_name: "Granitio", color: "Ivory", finishing: "Matt", image_key: "studioflow/schedule/photo.png", is_final: true, status: "APPROVED", search_key: "granitio" } });
    await testDb.prisma.brand.update({ where: { id: roman.id }, data: { deleted_at: new Date() } });
    const secret = await tokenFor(designer);
    const operations = [{ op: "update_option", optionId: option.id, patch: { color: "Grey", finishing: null } }];
    const previewed = (await preview(secret, projectId, operations)).body.data;
    assert.equal(previewed.valid, true, JSON.stringify(previewed));
    assert.deepEqual(previewed.operations[0].changes, { color: { from: "Ivory", to: "Grey" }, finishing: { from: "Matt", to: null } });
    const operationId = randomUUID();
    assert.equal((await apply(secret, projectId, { operationId, digest: previewed.digest, operations }, operationId)).status, 200);
    const saved = await testDb.prisma.sfScheduleOption.findUniqueOrThrow({ where: { id: option.id } });
    assert.deepEqual([saved.product_name, saved.color, saved.finishing, saved.brand_name, saved.image_key, saved.is_final, saved.status, saved.label], ["Granitio", "Grey", null, "Roman", "studioflow/schedule/photo.png", true, "APPROVED", "A"]);
    const auditsBefore = await testDb.prisma.auditEvent.count({ where: { app_id: "studioflow" } });
    const same = [{ op: "update_option", optionId: option.id, patch: { color: "Grey" } }];
    const unchanged = (await preview(secret, projectId, same)).body.data;
    assert.equal(unchanged.operations[0].effect, "no_change");
    const key = randomUUID();
    await apply(secret, projectId, { operationId: key, digest: unchanged.digest, operations: same }, key);
    assert.equal(await testDb.prisma.auditEvent.count({ where: { app_id: "studioflow" } }), auditsBefore);
  });

  it("applies a 100-operation batch in one transaction well under the 30 s ceiling", async () => {
    const projectId = await newProject("Large");
    const secret = await tokenFor(designer);
    const operations = Array.from({ length: 100 }, (_, index) => ({ op: "create_entry", section: "FIXTURE", category: `Item ${index % 10}`, option: { productName: `Product ${index}` } }));
    const started = Date.now();
    const previewed = (await preview(secret, projectId, operations)).body.data;
    const operationId = randomUUID();
    const applied = await apply(secret, projectId, { operationId, digest: previewed.digest, operations }, operationId);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(await testDb.prisma.sfScheduleEntry.count({ where: { project_id: projectId } }), 100);
    assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`);
  });
});

describe("rollback", () => {
  it("rolls back earlier operations when a later one fails after validation", async () => {
    const projectId = await newProject("Rollback");
    const roman = await brand("Roman");
    const db = testDb.prisma;
    const masterData = createMasterDataPublicRead(db);
    // After the preview, the Brand passes apply's validation and is gone by the time the writer snapshots it.
    let applying = false;
    let lookups = 0;
    const ports: Parameters<typeof createStudioFlowScheduleComposer>[1] = {
      runTransaction: <T>(work: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>) => db.$transaction((tx) => work(tx)),
      auditWriter: createAuditEventWriter(),
      people: createPeopleDirectory(db),
      storage: new FakeObjectStorage(),
      notificationWriter: createNotificationWriter(),
      masterData: { ...masterData, getBrandLibraryRead: async (id: string) => (applying && ++lookups > 1 ? null : masterData.getBrandLibraryRead(id)) },
    };
    const composer = createStudioFlowScheduleComposer(db, ports);
    const ctx = { grants: DESIGNER, actor: { kind: "USER" as const, userId: designer.id, label: designer.name }, projectId };
    const operations: ScheduleComposerOperation[] = [
      { op: "create_entry", section: "FIXTURE", category: "Lamp", option: { productName: "First" } },
      { op: "create_entry", section: "MATERIAL", category: "Tile", option: { productName: "Second", brandId: roman.id } },
    ];
    const previewed = await composer.previewBatch({ ...ctx, operations });
    assert.equal(previewed.valid, true);
    const before = await counts();
    applying = true;
    await assert.rejects(
      db.$transaction((tx) => composer.applyBatch(tx, { ...ctx, operationId: randomUUID(), digest: previewed.valid ? previewed.digest : "", operations })),
      (error: unknown) => error instanceof AppError && error.code === "SCHEDULE_BRAND_NOT_FOUND" && error.safeMessage.startsWith("Operation 2"),
    );
    assert.equal(lookups, 2);
    assert.deepEqual(await counts(), before);
  });
});

describe("reads", () => {
  it("return bounded data with no storage keys or signed URLs", async () => {
    const projectId = await newProject("Reads");
    const otherProject = await newProject("Past project");
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "TILE", prefix: "TI", increment: 1, sort_order: 1 } });
    await testDb.prisma.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", product_name: "Granitio", image_key: "studioflow/schedule/secret-key.png", search_key: "granitio" } });
    const past = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: otherProject, section: "MATERIAL", category: "Tile", category_key: "TILE", prefix: "TI", increment: 1, sort_order: 1 } });
    await testDb.prisma.sfScheduleOption.create({ data: { entry_id: past.id, label: "A", product_name: "Granit Lama", image_key: "studioflow/schedule/past-key.png", search_key: "granit lama" } });
    await template("FIXTURE", "Lamp", "Philips");
    await brand("Roman");
    const secret = await tokenFor(designer);
    const read = await context(secret, projectId);
    assert.equal(read.body.data.entries[0].options[0].hasImage, true);
    assert.deepEqual(read.body.data.templatesNotApplied, [{ section: "FIXTURE", category: "Lamp", productName: "Philips", brandName: null }]);
    const reusable = await call(searchReusableOptions(req("GET", `projects/${projectId}/reusable-options?q=granit`, secret), params(projectId)));
    assert.deepEqual(reusable.body.data.map((row: { productName: string }) => row.productName), ["Granit Lama"]);
    const brands = await call(searchBrands(req("GET", "brands?q=ro", secret)));
    assert.deepEqual(brands.body.data.map((row: { name: string }) => row.name), ["Roman"]);
    assert.equal((await call(searchBrands(req("GET", "brands?q=r", secret)))).status, 400);
    for (const payload of [read.body, reusable.body, brands.body]) {
      const text = JSON.stringify(payload);
      assert.equal(text.includes("studioflow/schedule/"), false);
      assert.equal(/https?:\/\//.test(text), false);
    }
  });
});
