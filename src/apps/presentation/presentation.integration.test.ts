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
import type { PresentationPorts } from "./shared";

let testDb: TestDb;
let presentation: PresentationService;
let ports: PresentationPorts;
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
  ports = { runTransaction, auditWriter: createAuditEventWriter(), storage, studioFlow: createStudioFlowPresentationBridge(testDb.prisma) };
  presentation = createPresentationService(testDb.prisma, ports);
});

beforeEach(async () => {
  await testDb.pool.query('TRUNCATE TABLE "presentation"."sf_presentation_annotation", "presentation"."sf_presentation_slide_image", "presentation"."sf_presentation_slide", "presentation"."sf_presentation_board", "presentation"."asset_cleanup_failure" RESTART IDENTITY CASCADE');
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
    let board = await presentation.getBoard({ ...read(), boardId: first.boardId });
    const pin = await presentation.addAnnotation({ ...command(), imageId: board.slides[0].images[0].id, pinX: 25, pinY: 75, scheduleEntryId: entry.id, note: "Warm finish" });
    board = await presentation.getBoard({ ...read(), boardId: first.boardId });
    assert.equal(slideIds.length, 2);
    assert.deepEqual(board.slides[0].images[0].annotations[0].scheduleEntry, { id: entry.id, code: "ST-01", productName: "Travertine" });

    await testDb.prisma.sfScheduleEntry.delete({ where: { id: entry.id } });
    const beforeRead = await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: pin.annotationId } });
    let writes = 0;
    // Prisma delegates are proxies; use a guarded port instead of redefining their method descriptors.
    const annotationPort = new Proxy(testDb.prisma.sfPresentationAnnotation, { get(delegate, key, receiver) {
      if (["update", "updateMany", "delete", "deleteMany", "upsert", "create", "createMany"].includes(String(key))) return async () => { writes++; throw new Error("Viewing must not write annotations"); };
      return Reflect.get(delegate, key, receiver);
    } });
    const readPort = new Proxy(testDb.prisma, { get(db, key, receiver) { return key === "sfPresentationAnnotation" ? annotationPort : Reflect.get(db, key, receiver); } });
    const reader = createPresentationService(readPort, ports);
    for (let n = 0; n < 2; n++) {
      board = await reader.getBoard({ ...read(), grants: [P.access, P.projectRead], boardId: first.boardId });
      assert.equal(board.slides[0].images[0].annotations[0].scheduleEntryId, null);
      assert.equal(board.slides[0].images[0].annotations[0].scheduleEntry, null);
    }
    assert.equal(writes, 0);
    assert.deepEqual(await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: pin.annotationId } }), beforeRead, "reads preserve the dangling stored ID and every other field");
    await presentation.clearScheduleEntryLink(entry.id);
    assert.equal((await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: pin.annotationId } })).schedule_entry_id, null);
    assert.ok((await testDb.prisma.auditEvent.findMany({ where: { app_id: "presentation" } })).every((event) => event.action.startsWith("presentation.")));
  });

  it("moves a pin without changing its linked item, note, label side or order, and retains write gates", async () => {
    const { boardId } = await presentation.createBoard({ ...command(), title: "Pin movement" });
    await presentation.addSlides({ ...command(), boardId, files: [png()] });
    const image = (await presentation.getBoard({ ...read(), boardId })).slides[0]!.images[0]!;
    const entry = await testDb.prisma.sfScheduleEntry.create({ data: { project_id: projectId, section: "MATERIAL", category: "Tile", category_key: "tile", prefix: "HT", increment: 1, sort_order: 0 } });
    const { annotationId } = await presentation.addAnnotation({ ...command(), imageId: image.id, pinX: 20, pinY: 30, scheduleEntryId: entry.id, labelSide: "left", note: "Keep this caption" });
    const beforeMove = await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: annotationId } });
    const metadata = (row: typeof beforeMove) => [row.image_id, row.schedule_entry_id, row.label_side, row.note, row.sort_order];
    for (const [pinX, pinY] of [[0, 100], [100, 0], [41, 57]]) {
      await presentation.updateAnnotation({ ...command(), annotationId, pinX, pinY });
      const moved = await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: annotationId } });
      assert.deepEqual([moved.pin_x, moved.pin_y], [pinX, pinY]);
      assert.deepEqual(metadata(moved), metadata(beforeMove));
    }
    await rejectsWith(presentation.updateAnnotation({ ...command(), annotationId, pinX: -1 }), "PRESENTATION_PIN_INVALID");
    await rejectsWith(presentation.updateAnnotation({ ...command(), annotationId, pinY: 101 }), "PRESENTATION_PIN_INVALID");
    await rejectsWith(presentation.updateAnnotation({ ...command(), annotationId, pinX: 50, grants: [P.access, P.projectRead] }), "PERMISSION_DENIED");
    const foreign = await testDb.prisma.sfProject.create({ data: { name: "Other pin project", pic_designer_id: userId, pic_drafter_id: userId, created_by_id: userId } });
    await rejectsWith(presentation.updateAnnotation({ ...command(), projectId: foreign.id, annotationId, pinX: 50 }), "PRESENTATION_ANNOTATION_NOT_FOUND");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date() } });
    await rejectsWith(presentation.updateAnnotation({ ...command(), annotationId, pinX: 50 }), "PROJECT_ARCHIVED");
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: null, status: "COMPLETED" } });
    await rejectsWith(presentation.updateAnnotation({ ...command(), annotationId, pinY: 50 }), "PROJECT_COMPLETED");
    assert.deepEqual(metadata(await testDb.prisma.sfPresentationAnnotation.findUniqueOrThrow({ where: { id: annotationId } })), metadata(beforeMove));
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
    const key = (await testDb.prisma.sfPresentationSlideImage.findFirstOrThrow({ where: { slide_id: slideIds[0] } })).image_key;
    const failure = mock.method(storage, "remove", async () => { throw new Error("storage unavailable"); });
    try { await presentation.deleteSlide({ ...command(), slideId: slideIds[0] }); } finally { failure.mock.restore(); }
    assert.equal((await testDb.prisma.presentationAssetCleanupFailure.findUniqueOrThrow({ where: { storage_key: key } })).resolved_at, null);
    assert.deepEqual(await presentation.retryAssetCleanup(), { attempted: 1, resolved: 1, failed: 0 });

    const { slideIds: later } = await presentation.addSlides({ ...command(), boardId: board.boardId, files: [png()] });
    const laterKey = (await testDb.prisma.sfPresentationSlideImage.findFirstOrThrow({ where: { slide_id: later[0] } })).image_key;
    await testDb.prisma.sfProject.update({ where: { id: projectId }, data: { archived_at: new Date() } });
    assert.deepEqual(await presentation.purgeArchivedProjectAssets(projectId), { presentationSlides: 1 });
    assert.equal(await testDb.prisma.sfPresentationSlide.count({ where: { id: later[0] } }), 0);
    assert.equal(storage.objects.has(laterKey), false);
    assert.equal(await testDb.prisma.sfPresentationBoard.count({ where: { id: board.boardId } }), 1);
  });

  it("lays out a slide: boxes, swaps, fit and focus, refuses a smaller layout over a used box, and cleans up a replaced image", async () => {
    const { boardId } = await presentation.createBoard({ ...command(), title: "Layouts" });
    const { slideId } = await presentation.addSlide({ ...command(), boardId, layout: "one-two" });
    const first = await presentation.placeImage({ ...command(), slideId, slot: 0, file: { ...png(), imageRatio: 1.5 } });
    const second = await presentation.placeImage({ ...command(), slideId, slot: 2, file: png() });
    await presentation.addAnnotation({ ...command(), imageId: second.imageId, pinX: 10, pinY: 20 });
    let slide = (await presentation.getBoard({ ...read(), boardId })).slides[0]!;
    assert.deepEqual(slide.images.map((image) => [image.slot, image.fit, image.imageRatio]), [[0, "cover", 1.5], [2, "cover", null]]);

    await presentation.moveImage({ ...command(), imageId: second.imageId, slot: 0 });
    slide = (await presentation.getBoard({ ...read(), boardId })).slides[0]!;
    assert.deepEqual(slide.images.map((image) => [image.id, image.slot]), [[second.imageId, 0], [first.imageId, 2]], "the two images trade boxes");
    assert.equal(slide.images[0]!.annotations.length, 1, "pins travel with their image");

    await presentation.updateImage({ ...command(), imageId: first.imageId, fit: "contain", focusX: 20, focusY: 80 });
    await rejectsWith(presentation.updateSlide({ ...command(), slideId, layout: "two-side" }), "PRESENTATION_LAYOUT_TOO_SMALL");
    await rejectsWith(presentation.placeImage({ ...command(), slideId, slot: 3, file: png() }), "PRESENTATION_SLOT_INVALID");
    await presentation.updateSlide({ ...command(), slideId, layout: "four", title: "Fasad", caption: "Material" });
    slide = (await presentation.getBoard({ ...read(), boardId })).slides[0]!;
    assert.deepEqual([slide.layout, slide.title, slide.caption], ["four", "Fasad", "Material"]);
    assert.deepEqual([slide.images[1]!.fit, slide.images[1]!.focusX, slide.images[1]!.focusY], ["contain", 20, 80]);

    const replacedKey = (await testDb.prisma.sfPresentationSlideImage.findUniqueOrThrow({ where: { id: second.imageId } })).image_key;
    await presentation.placeImage({ ...command(), slideId, slot: 0, file: png() });
    assert.equal(storage.objects.has(replacedKey), false, "a replaced image is removed from storage");
    assert.equal(await testDb.prisma.sfPresentationAnnotation.count(), 0, "and its pins with it");
    const removedKey = (await testDb.prisma.sfPresentationSlideImage.findUniqueOrThrow({ where: { id: first.imageId } })).image_key;
    await presentation.removeImage({ ...command(), imageId: first.imageId });
    assert.equal(storage.objects.has(removedKey), false);
    assert.deepEqual((await presentation.getBoard({ ...read(), boardId })).slides[0]!.images.map((image) => image.slot), [0]);
  });

  it("commits a slide delete with its cleanup already queued, so a failed object removal is retried later", async () => {
    const board = await presentation.createBoard({ ...command(), title: "Queued cleanup" });
    const { slideIds } = await presentation.addSlides({ ...command(), boardId: board.boardId, files: [png(), png()] });
    const [first, second] = await Promise.all(slideIds.map(async (id) => ({ id, image_key: (await testDb.prisma.sfPresentationSlideImage.findFirstOrThrow({ where: { slide_id: id } })).image_key })));

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
