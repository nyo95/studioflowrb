import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it, mock } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { AppError } from "@platform/core/errors";
import { initializePermissionRegistry } from "@platform/core/rbac/registry";
import { FakeObjectStorage } from "@platform/core/storage";
import { APP_REGISTRATIONS } from "@/app/app-registrations";
import { STUDIOFLOW_PERMISSIONS as P } from "@/apps/studioflow/public";
import { createStudioFlowPresentationBridge } from "@/apps/studioflow/public/presentation-bridge";

import { createPresentationService, type PresentationService } from "./service";

let testDb: TestDb;
let presentation: PresentationService;
let storage: FakeObjectStorage;
let userId: string;
let projectId: string;
const grants = Object.values(P);
const actor = () => ({ kind: "USER" as const, userId, label: "Designer" });
const command = () => ({ grants, actor: actor(), projectId });
const read = () => ({ grants, actorId: userId, projectId });
const png = () => ({ body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), contentType: "image/png" });

function code(error: unknown) { return error instanceof AppError ? error.code : undefined; }
async function rejectsWith(promise: Promise<unknown>, expected: string) {
  await assert.rejects(promise, (error: unknown) => { assert.equal(code(error), expected); return true; });
}

before(async () => {
  initializePermissionRegistry(APP_REGISTRATIONS);
  testDb = await createTestDb(requireDisposableTestDatabaseUrl());
  storage = new FakeObjectStorage();
  const runTransaction = <T>(work: (tx: Parameters<Parameters<typeof testDb.prisma.$transaction>[0]>[0]) => Promise<T>) => testDb.prisma.$transaction((tx) => work(tx));
  presentation = createPresentationService(testDb.prisma, { runTransaction, auditWriter: createAuditEventWriter(), storage, studioFlow: createStudioFlowPresentationBridge(testDb.prisma) });
});

beforeEach(async () => {
  await testDb.pool.query('TRUNCATE TABLE "presentation"."sf_presentation_annotation", "presentation"."sf_presentation_slide", "presentation"."sf_presentation_board", "presentation"."asset_cleanup_failure" RESTART IDENTITY CASCADE');
  await testDb.pool.query('TRUNCATE TABLE "studioflow"."sf_schedule_option", "studioflow"."sf_schedule_entry", "studioflow"."sf_project" RESTART IDENTITY CASCADE');
  await truncatePlatformTables(testDb);
  storage.objects.clear();
  userId = randomUUID();
  await testDb.prisma.user.create({ data: { id: userId, email: `${userId}@test.local`, display_name: "Designer", password_hash: "x" } });
  projectId = randomUUID();
  await testDb.prisma.sfProject.create({ data: { id: projectId, name: `Presentation ${projectId}`, pic_designer_id: userId, pic_drafter_id: userId, created_by_id: userId } });
});

after(async () => closeTestDb(testDb));

describe("Presentation extracted module", () => {
  it("keeps board, slide, pin and live Schedule behavior behind StudioFlow public facts", async () => {
    const first = await presentation.createBoard({ ...command(), title: "Concept" });
    const second = await presentation.createBoard({ ...command(), title: "Details" });
    await presentation.reorderBoards({ ...command(), orderedIds: [second.boardId, first.boardId] });
    assert.deepEqual((await presentation.listBoards(read())).map((board) => board.id), [second.boardId, first.boardId]);

    const { slideIds } = await presentation.addSlides({ ...command(), boardId: first.boardId, files: [png(), png()] });
    assert.equal((await presentation.countProjectBoards(read())), 2);
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Stone", category_key: "stone", prefix: "ST", increment: 1, sort_order: 0 } });
    await testDb.prisma.sfScheduleOption.create({ data: { entry_id: entry.id, label: "A", product_name: "Travertine", search_key: "travertine", is_final: true } });
    const pin = await presentation.addAnnotation({ ...command(), slideId: slideIds[0], pinX: 25, pinY: 75, scheduleEntryId: entry.id, note: "Warm finish" });
    let board = await presentation.getBoard({ ...read(), boardId: first.boardId });
    assert.deepEqual(board.slides[0].annotations[0].scheduleEntry, { id: entry.id, code: "ST-01", productName: "Travertine" });

    await testDb.prisma.sfScheduleEntry.delete({ where: { id: entry.id } });
    board = await presentation.getBoard({ ...read(), boardId: first.boardId });
    assert.equal(board.slides[0].annotations[0].scheduleEntryId, null);
    assert.equal((await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: pin.annotationId } })).schedule_entry_id, null);
    assert.ok((await testDb.prisma.auditEvent.findMany({ where: { app_id: "presentation" } })).every((event) => event.action.startsWith("presentation.")));
  });

  it("enforces PIC, permission, project scope, archive and completed gates", async () => {
    const outsider = randomUUID();
    await rejectsWith(presentation.createBoard({ grants: grants.filter((grant) => grant !== P.projectOverride), actor: { kind: "USER", userId: outsider, label: "Other" }, projectId, title: "Denied" }), "PERMISSION_DENIED");
    await rejectsWith(presentation.createBoard({ grants: grants.filter((grant) => grant !== P.presentationManage), actor: actor(), projectId, title: "Denied" }), "PERMISSION_DENIED");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date() } });
    await rejectsWith(presentation.createBoard({ ...command(), title: "Archived" }), "PROJECT_ARCHIVED");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: null, status: "COMPLETED" } });
    await rejectsWith(presentation.createBoard({ ...command(), title: "Completed" }), "PROJECT_COMPLETED");
  });

  it("tracks failed slide cleanup, retries it, and purges archived project slides independently", async () => {
    const board = await presentation.createBoard({ ...command(), title: "Cleanup" });
    const { slideIds } = await presentation.addSlides({ ...command(), boardId: board.boardId, files: [png()] });
    const key = (await testDb.prisma.sfPresentationSlide.findUniqueOrThrow({ where: { id: slideIds[0] } })).image_key;
    const failure = mock.method(storage, "remove", async () => { throw new Error("storage unavailable"); });
    try { await presentation.deleteSlide({ ...command(), slideId: slideIds[0] }); } finally { failure.mock.restore(); }
    assert.equal((await testDb.prisma.presentationAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: key } })).resolved_at, null);
    assert.deepEqual(await presentation.retryAssetCleanup(), { attempted: 1, resolved: 1, failed: 0 });

    const { slideIds: later } = await presentation.addSlides({ ...command(), boardId: board.boardId, files: [png()] });
    const laterKey = (await testDb.prisma.sfPresentationSlide.findUniqueOrThrow({ where: { id: later[0] } })).image_key;
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date() } });
    assert.deepEqual(await presentation.purgeArchivedProjectAssets(projectId), { presentationSlides: 1 });
    assert.equal(await testDb.prisma.sfPresentationSlide.count({ where: { id: later[0] } }), 0);
    assert.equal(storage.objects.has(laterKey), false);
    assert.equal(await testDb.prisma.sfPresentationBoard.count({ where: { id: board.boardId } }), 1);
  });

  it("commits a slide delete with its cleanup already queued, so a failed object removal is retried later", async () => {
    const board = await presentation.createBoard({ ...command(), title: "Queued cleanup" });
    const { slideIds } = await presentation.addSlides({ ...command(), boardId: board.boardId, files: [png(), png()] });
    const [first, second] = await Promise.all(slideIds.map((id) => testDb.prisma.sfPresentationSlide.findUniqueOrThrow({ where: { id } })));

    // Each slide owns its object (image_key is unique), so the queue entry is written inside the deleting transaction.
    const failure = mock.method(storage, "remove", async () => { throw new Error("storage unavailable"); });
    try { await presentation.deleteSlide({ ...command(), slideId: first!.id }); } finally { failure.mock.restore(); }
    assert.equal(await testDb.prisma.sfPresentationSlide.count({ where: { id: first!.id } }), 0, "the database delete commits");
    assert.equal(storage.objects.has(first!.image_key), true, "the failed removal leaves the object for a retry");
    const queued = await testDb.prisma.presentationAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: first!.image_key } });
    assert.deepEqual([queued.resolved_at, queued.attempts], [null, 1], "queued at zero in the transaction, one failed attempt after it");

    await presentation.deleteSlide({ ...command(), slideId: second!.id });
    assert.equal(storage.objects.has(second!.image_key), false);
    assert.equal((await testDb.prisma.presentationAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: second!.image_key } })).resolved_at instanceof Date, true, "a successful removal resolves its entry");
  });
});
