import { createPrivateObjectKey, type ObjectStorage } from "@platform/core/storage";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import {
  hasPermission,
  invalid,
  notFound,
  optionalText,
  requirePresentationCommand,
  requirePresentationRead,
  requiredText,
  writePresentationAudit,
  type PresentationCommandContext,
  type PresentationDb,
  type PresentationPorts,
  type PresentationReadContext,
  type PresentationTx,
} from "./shared";

const BOARD_ENTITY = "presentation-board";
const SLIDE_ENTITY = "presentation-slide";
const ANNOTATION_ENTITY = "presentation-annotation";
const IMAGE_BYTES = 3 * 1024 * 1024;
/** The board an image is put on by "Add to moodboard"; found by this title (any letter case), created when missing. */
const MOODBOARD_TITLE = "Moodboard";
const SIGNED_URL_SECONDS = 15 * 60;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type PresentationImageUpload = { body: Uint8Array; contentType: string; imageRatio?: number | null };
export type PresentationLabelSide = "auto" | "left" | "right";

function labelSide(value: string | undefined): PresentationLabelSide {
  if (value === undefined || value === "auto" || value === "left" || value === "right") return value ?? "auto";
  throw invalid("PRESENTATION_LABEL_SIDE", "Choose automatic, left, or right label placement.");
}

function storedLabelSide(value: PresentationLabelSide): "AUTO" | "LEFT" | "RIGHT" {
  return value === "auto" ? "AUTO" : value === "left" ? "LEFT" : "RIGHT";
}

function pin(value: number, axis: "x" | "y"): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw invalid("PRESENTATION_PIN_INVALID", `Pin ${axis} must be between 0 and 100.`);
  return value;
}

function imageRatio(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value <= 0) throw invalid("PRESENTATION_IMAGE_RATIO", "Image dimensions are invalid.");
  return value;
}

function validateImage(file: PresentationImageUpload): string {
  const extension = IMAGE_TYPES[file.contentType];
  if (!extension) throw invalid("PRESENTATION_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
  if (file.body.byteLength === 0 || file.body.byteLength > IMAGE_BYTES) throw invalid("PRESENTATION_IMAGE_SIZE", "Images must be smaller than 3 MB.");
  if (!sniffImage(file.body, file.contentType)) throw invalid("PRESENTATION_IMAGE_TYPE", "This file is not a valid image.");
  return extension;
}

function sniffImage(body: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") return body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47;
  if (contentType === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === "image/webp") return body.length >= 12 && String.fromCharCode(...body.slice(0, 4)) === "RIFF" && String.fromCharCode(...body.slice(8, 12)) === "WEBP";
  return false;
}

function orderIds(ids: readonly string[], expected: readonly string[]): void {
  if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some((id) => !expected.includes(id))) {
    throw invalid("PRESENTATION_ORDER_INVALID", "The reordered items must match the current list.");
  }
}

export async function retryPresentationAssetCleanup(db: PresentationDb, storage: ObjectStorage, limit = 25) {
  const pending = await db.presentationAssetCleanupFailure.findMany({ where: { resolved_at: null }, orderBy: [{ first_failed_at: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(limit, 100)) });
  let resolved = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      await storage.remove(item.storage_key);
      await db.presentationAssetCleanupFailure.update({ where: { id: item.id }, data: { resolved_at: new Date(), last_attempt_at: new Date() } });
      resolved++;
    } catch {
      await db.presentationAssetCleanupFailure.update({ where: { id: item.id }, data: { attempts: { increment: 1 }, last_attempt_at: new Date() } });
      failed++;
    }
  }
  return { attempted: pending.length, resolved, failed };
}

export function createPresentationService(db: PresentationDb, ports: PresentationPorts) {
  const { runTransaction, storage } = ports;

  async function requireProjectWrite(input: PresentationCommandContext & { projectId: string }): Promise<string> {
    requirePresentationCommand(input);
    return (await ports.studioFlow.requireProjectDocumentWrite(input)).actorId;
  }

  async function enqueueUnreferencedCleanup(tx: PresentationTx, keys: readonly string[]): Promise<string[]> {
    const orphaned: string[] = [];
    for (const key of [...new Set(keys)]) {
      if (await tx.sfPresentationSlide.count({ where: { image_key: key } })) continue;
      await tx.presentationAssetCleanupFailure.upsert({ where: { storage_key: key }, create: { storage_key: key, attempts: 0 }, update: { resolved_at: null } });
      orphaned.push(key);
    }
    return orphaned;
  }

  async function removeQueued(keys: readonly string[]) {
    for (const key of [...new Set(keys)]) {
      if (await db.sfPresentationSlide.count({ where: { image_key: key } })) continue;
      try {
        await storage.remove(key);
        await db.presentationAssetCleanupFailure.updateMany({ where: { storage_key: key, resolved_at: null }, data: { resolved_at: new Date() } });
      } catch {
        await db.presentationAssetCleanupFailure.upsert({ where: { storage_key: key }, create: { storage_key: key, attempts: 1 }, update: { attempts: { increment: 1 }, last_attempt_at: new Date(), resolved_at: null } }).catch(() => {});
      }
    }
  }

  async function discardNew(keys: readonly string[]) {
    for (const key of keys) {
      try { await storage.remove(key); } catch {
        await db.presentationAssetCleanupFailure.upsert({ where: { storage_key: key }, create: { storage_key: key, attempts: 1 }, update: { attempts: { increment: 1 }, last_attempt_at: new Date(), resolved_at: null } }).catch(() => {});
      }
    }
  }

  async function signedUrl(key: string): Promise<string | null> {
    try {
      return await storage.createSignedReadUrl(key, SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  }

  async function loadBoard(tx: PresentationDb | PresentationTx, projectId: string, boardId: string) {
    const board = await tx.sfPresentationBoard.findUnique({ where: { id: boardId } });
    if (!board || board.project_id !== projectId) throw notFound("presentation board");
    return board;
  }

  async function loadSlide(tx: PresentationDb | PresentationTx, projectId: string, slideId: string) {
    const slide = await tx.sfPresentationSlide.findUnique({ where: { id: slideId }, include: { board: true } });
    if (!slide || slide.board.project_id !== projectId) throw notFound("presentation slide");
    return slide;
  }

  async function loadAnnotation(tx: PresentationDb | PresentationTx, projectId: string, annotationId: string) {
    const annotation = await tx.sfPresentationAnnotation.findUnique({ where: { id: annotationId }, include: { slide: { include: { board: true } } } });
    if (!annotation || annotation.slide.board.project_id !== projectId) throw notFound("presentation annotation");
    return annotation;
  }

  async function validateScheduleEntry(input: PresentationReadContext & { projectId: string }, scheduleEntryId: string | null | undefined): Promise<string | null> {
    if (!scheduleEntryId) return null;
    const [entry] = await ports.studioFlow.resolvePresentationScheduleLinks({ ...input, entryIds: [scheduleEntryId] });
    if (!entry) throw invalid("PRESENTATION_SCHEDULE_ENTRY", "Choose a Product Schedule entry from this project.");
    return entry.entryId;
  }

  return {
    canManage(grants: PresentationReadContext["grants"]) {
      return hasPermission(grants, STUDIOFLOW_PERMISSIONS.access) && hasPermission(grants, STUDIOFLOW_PERMISSIONS.presentationManage);
    },

    async countProjectBoards(input: PresentationReadContext & { projectId: string }) {
      requirePresentationRead(input);
      await ports.studioFlow.readProjectDocumentContext(input);
      return db.sfPresentationBoard.count({ where: { project_id: input.projectId } });
    },

    async listBoards(input: PresentationReadContext & { projectId: string }) {
      requirePresentationRead(input);
      await ports.studioFlow.readProjectDocumentContext(input);
      const boards = await db.sfPresentationBoard.findMany({ where: { project_id: input.projectId }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }], include: { _count: { select: { slides: true } } } });
      return boards.map((board) => ({ id: board.id, projectId: board.project_id, title: board.title, sortOrder: board.sort_order, slideCount: board._count.slides }));
    },

    async listScheduleChoices(input: PresentationReadContext & { projectId: string }) {
      requirePresentationRead(input);
      return ports.studioFlow.listPresentationScheduleChoices(input);
    },

    async getBoard(input: PresentationReadContext & { projectId: string; boardId: string }) {
      requirePresentationRead(input);
      await ports.studioFlow.readProjectDocumentContext(input);
      const board = await db.sfPresentationBoard.findUnique({ where: { id: input.boardId }, include: { slides: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }], include: { annotations: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] } } } } });
      if (!board || board.project_id !== input.projectId) throw notFound("presentation board");
      const links = await ports.studioFlow.resolvePresentationScheduleLinks({ ...input, entryIds: board.slides.flatMap((slide) => slide.annotations.flatMap((annotation) => annotation.schedule_entry_id ? [annotation.schedule_entry_id] : [])) });
      const byId = new Map(links.map((entry) => [entry.entryId, entry]));
      const missing = board.slides.flatMap((slide) => slide.annotations).filter((annotation) => annotation.schedule_entry_id && !byId.has(annotation.schedule_entry_id)).map((annotation) => annotation.id);
      if (missing.length) await db.sfPresentationAnnotation.updateMany({ where: { id: { in: missing } }, data: { schedule_entry_id: null } });
      return { id: board.id, projectId: board.project_id, title: board.title, slides: await Promise.all(board.slides.map(async (slide) => ({ id: slide.id, imageUrl: await signedUrl(slide.image_key), imageRatio: slide.image_ratio, sortOrder: slide.sort_order, annotations: slide.annotations.map((annotation) => {
        const entry = annotation.schedule_entry_id ? byId.get(annotation.schedule_entry_id) ?? null : null;
        return { id: annotation.id, scheduleEntryId: entry?.entryId ?? null, pinX: annotation.pin_x, pinY: annotation.pin_y, labelSide: annotation.label_side.toLowerCase() as PresentationLabelSide, note: annotation.note, sortOrder: annotation.sort_order, scheduleEntry: entry ? { id: entry.entryId, code: entry.code, productName: entry.productName } : null };
      }) }))) };
    },

    async createBoard(input: PresentationCommandContext & { projectId: string; title: string }) {
      const userId = await requireProjectWrite(input);
      const title = requiredText(input.title, "PRESENTATION_TITLE_REQUIRED", "Board title", 200);
      return runTransaction(async (tx) => {
        const max = await tx.sfPresentationBoard.aggregate({ where: { project_id: input.projectId }, _max: { sort_order: true } });
        const board = await tx.sfPresentationBoard.create({ data: { project_id: input.projectId, title, sort_order: (max._max.sort_order ?? -1) + 1, created_by_id: userId } });
        await writePresentationAudit(ports, tx, { action: "presentation.board.created", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId } });
        return { boardId: board.id };
      });
    },

    async updateBoard(input: PresentationCommandContext & { projectId: string; boardId: string; title: string }) {
      await requireProjectWrite(input);
      const title = requiredText(input.title, "PRESENTATION_TITLE_REQUIRED", "Board title", 200);
      return runTransaction(async (tx) => { const board = await loadBoard(tx, input.projectId, input.boardId); await tx.sfPresentationBoard.update({ where: { id: board.id }, data: { title } }); await writePresentationAudit(ports, tx, { action: "presentation.board.updated", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, changes: { title: { from: board.title, to: title } }, metadata: { projectId: input.projectId } }); return { boardId: board.id }; });
    },

    async reorderBoards(input: PresentationCommandContext & { projectId: string; orderedIds: string[] }) {
      await requireProjectWrite(input);
      return runTransaction(async (tx) => { const boards = await tx.sfPresentationBoard.findMany({ where: { project_id: input.projectId }, select: { id: true } }); orderIds(input.orderedIds, boards.map((board) => board.id)); for (const [sortOrder, id] of input.orderedIds.entries()) await tx.sfPresentationBoard.update({ where: { id }, data: { sort_order: sortOrder } }); await writePresentationAudit(ports, tx, { action: "presentation.boards.reordered", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { projectId: input.projectId, count: input.orderedIds.length } }); });
    },

    async deleteBoard(input: PresentationCommandContext & { projectId: string; boardId: string }) {
      await requireProjectWrite(input);
      const result = await runTransaction(async (tx) => { const board = await loadBoard(tx, input.projectId, input.boardId); const slides = await tx.sfPresentationSlide.findMany({ where: { board_id: board.id }, select: { image_key: true } }); await tx.sfPresentationBoard.delete({ where: { id: board.id } }); await writePresentationAudit(ports, tx, { action: "presentation.board.deleted", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, slideCount: slides.length } }); return { imageKeys: await enqueueUnreferencedCleanup(tx, slides.map((slide) => slide.image_key)) }; });
      await removeQueued(result.imageKeys);
    },

    async addStoredImageToMoodboard(input: PresentationCommandContext & { projectId: string; source: { key: string; contentType: string } }) {
      const userId = await requireProjectWrite(input);
      const extension = IMAGE_TYPES[input.source.contentType];
      if (!extension) throw invalid("PRESENTATION_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
      const key = createPrivateObjectKey(`presentation/${input.projectId}`, extension);
      await storage.copy({ fromKey: input.source.key, toKey: key });
      try {
        return await runTransaction(async (tx) => {
          let board = await tx.sfPresentationBoard.findFirst({ where: { project_id: input.projectId, title: { equals: MOODBOARD_TITLE, mode: "insensitive" } }, orderBy: { sort_order: "asc" } });
          const created = !board;
          if (!board) { const max = await tx.sfPresentationBoard.aggregate({ where: { project_id: input.projectId }, _max: { sort_order: true } }); board = await tx.sfPresentationBoard.create({ data: { project_id: input.projectId, title: MOODBOARD_TITLE, sort_order: (max._max.sort_order ?? -1) + 1, created_by_id: userId } }); await writePresentationAudit(ports, tx, { action: "presentation.board.created", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, source: "moodboard" } }); }
          const last = await tx.sfPresentationSlide.aggregate({ where: { board_id: board.id }, _max: { sort_order: true } });
          const slide = await tx.sfPresentationSlide.create({ data: { board_id: board.id, image_key: key, image_ratio: null, sort_order: (last._max.sort_order ?? -1) + 1 } });
          await writePresentationAudit(ports, tx, { action: "presentation.slides.added", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, count: 1, source: "moodboard" } });
          return { boardId: board.id, slideId: slide.id, created };
        });
      } catch (error) { await discardNew([key]); throw error; }
    },

    async addSlides(input: PresentationCommandContext & { projectId: string; boardId: string; files: PresentationImageUpload[] }) {
      await requireProjectWrite(input);
      if (input.files.length === 0) throw invalid("PRESENTATION_IMAGES_REQUIRED", "Choose at least one image.");
      const uploads = input.files.map((file) => ({ file, extension: validateImage(file), ratio: imageRatio(file.imageRatio) }));
      await loadBoard(db, input.projectId, input.boardId);
      const keys: string[] = [];
      try {
        for (const upload of uploads) { const key = createPrivateObjectKey(`presentation/${input.projectId}`, upload.extension); await storage.put({ key, body: upload.file.body, bytes: upload.file.body.byteLength, contentType: upload.file.contentType }); keys.push(key); }
        return await runTransaction(async (tx) => { const board = await loadBoard(tx, input.projectId, input.boardId); const max = await tx.sfPresentationSlide.aggregate({ where: { board_id: board.id }, _max: { sort_order: true } }); const slides = []; for (const [index, key] of keys.entries()) slides.push(await tx.sfPresentationSlide.create({ data: { board_id: board.id, image_key: key, image_ratio: uploads[index].ratio, sort_order: (max._max.sort_order ?? -1) + index + 1 } })); await writePresentationAudit(ports, tx, { action: "presentation.slides.added", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, count: slides.length, bytes: uploads.reduce((total, item) => total + item.file.body.byteLength, 0) } }); return { slideIds: slides.map((slide) => slide.id) }; });
      } catch (error) { await discardNew(keys); throw error; }
    },

    async reorderSlides(input: PresentationCommandContext & { projectId: string; boardId: string; orderedIds: string[] }) {
      await requireProjectWrite(input);
      return runTransaction(async (tx) => { await loadBoard(tx, input.projectId, input.boardId); const slides = await tx.sfPresentationSlide.findMany({ where: { board_id: input.boardId }, select: { id: true } }); orderIds(input.orderedIds, slides.map((slide) => slide.id)); for (const [sortOrder, id] of input.orderedIds.entries()) await tx.sfPresentationSlide.update({ where: { id }, data: { sort_order: sortOrder } }); await writePresentationAudit(ports, tx, { action: "presentation.slides.reordered", entityType: BOARD_ENTITY, entityId: input.boardId, actor: input.actor, metadata: { projectId: input.projectId, count: input.orderedIds.length } }); });
    },

    async deleteSlide(input: PresentationCommandContext & { projectId: string; slideId: string }) {
      await requireProjectWrite(input);
      const result = await runTransaction(async (tx) => { const slide = await loadSlide(tx, input.projectId, input.slideId); await tx.sfPresentationSlide.delete({ where: { id: slide.id } }); await writePresentationAudit(ports, tx, { action: "presentation.slide.deleted", entityType: SLIDE_ENTITY, entityId: slide.id, actor: input.actor, metadata: { projectId: input.projectId, boardId: slide.board_id } }); return { imageKeys: await enqueueUnreferencedCleanup(tx, [slide.image_key]) }; });
      await removeQueued(result.imageKeys);
    },

    async addAnnotation(input: PresentationCommandContext & { projectId: string; slideId: string; pinX: number; pinY: number; scheduleEntryId?: string | null; labelSide?: string; note?: string | null }) {
      const actorId = await requireProjectWrite(input);
      const pinX = pin(input.pinX, "x"); const pinY = pin(input.pinY, "y"); const side = labelSide(input.labelSide); const note = optionalText(input.note, 2000);
      const scheduleEntryId = await validateScheduleEntry({ grants: input.grants, actorId, projectId: input.projectId }, input.scheduleEntryId);
      return runTransaction(async (tx) => { const slide = await loadSlide(tx, input.projectId, input.slideId); const max = await tx.sfPresentationAnnotation.aggregate({ where: { slide_id: slide.id }, _max: { sort_order: true } }); const annotation = await tx.sfPresentationAnnotation.create({ data: { slide_id: slide.id, schedule_entry_id: scheduleEntryId, pin_x: pinX, pin_y: pinY, label_side: storedLabelSide(side), note, sort_order: (max._max.sort_order ?? -1) + 1 } }); await writePresentationAudit(ports, tx, { action: "presentation.annotation.created", entityType: ANNOTATION_ENTITY, entityId: annotation.id, actor: input.actor, metadata: { projectId: input.projectId, slideId: slide.id, scheduleEntryId } }); return { annotationId: annotation.id }; });
    },

    async updateAnnotation(input: PresentationCommandContext & { projectId: string; annotationId: string; pinX?: number; pinY?: number; scheduleEntryId?: string | null; labelSide?: string; note?: string | null }) {
      const actorId = await requireProjectWrite(input);
      const side = input.labelSide === undefined ? undefined : labelSide(input.labelSide); const note = input.note === undefined ? undefined : optionalText(input.note, 2000); const scheduleEntryId = input.scheduleEntryId === undefined ? undefined : await validateScheduleEntry({ grants: input.grants, actorId, projectId: input.projectId }, input.scheduleEntryId); const pinX = input.pinX === undefined ? undefined : pin(input.pinX, "x"); const pinY = input.pinY === undefined ? undefined : pin(input.pinY, "y");
      return runTransaction(async (tx) => { const annotation = await loadAnnotation(tx, input.projectId, input.annotationId); await tx.sfPresentationAnnotation.update({ where: { id: annotation.id }, data: { pin_x: pinX, pin_y: pinY, schedule_entry_id: scheduleEntryId, label_side: side === undefined ? undefined : storedLabelSide(side), note } }); await writePresentationAudit(ports, tx, { action: "presentation.annotation.updated", entityType: ANNOTATION_ENTITY, entityId: annotation.id, actor: input.actor, metadata: { projectId: input.projectId, slideId: annotation.slide_id } }); return { annotationId: annotation.id }; });
    },

    async deleteAnnotation(input: PresentationCommandContext & { projectId: string; annotationId: string }) {
      await requireProjectWrite(input);
      return runTransaction(async (tx) => { const annotation = await loadAnnotation(tx, input.projectId, input.annotationId); await tx.sfPresentationAnnotation.delete({ where: { id: annotation.id } }); await writePresentationAudit(ports, tx, { action: "presentation.annotation.deleted", entityType: ANNOTATION_ENTITY, entityId: annotation.id, actor: input.actor, metadata: { projectId: input.projectId, slideId: annotation.slide_id } }); });
    },

    async clearScheduleEntryLink(entryId: string) {
      return db.sfPresentationAnnotation.updateMany({ where: { schedule_entry_id: entryId }, data: { schedule_entry_id: null } });
    },

    async purgeArchivedProjectAssets(projectId: string) {
      const actor = { kind: "SYSTEM" as const, label: "Presentation asset retention" };
      const result = await runTransaction(async (tx) => { const slides = await tx.sfPresentationSlide.findMany({ where: { board: { project_id: projectId } }, select: { id: true, image_key: true } }); await tx.sfPresentationSlide.deleteMany({ where: { board: { project_id: projectId } } }); await writePresentationAudit(ports, tx, { action: "presentation.project.assets-purged", entityType: "project", entityId: projectId, actor, metadata: { projectId, presentationSlides: slides.length } }); return { presentationSlides: slides.length, imageKeys: await enqueueUnreferencedCleanup(tx, slides.map((slide) => slide.image_key)) }; });
      await removeQueued(result.imageKeys);
      return { presentationSlides: result.presentationSlides };
    },

    retryAssetCleanup(limit?: number) { return retryPresentationAssetCleanup(db, storage, limit); },
    permission: STUDIOFLOW_PERMISSIONS.presentationManage,
  };
}

export type PresentationService = ReturnType<typeof createPresentationService>;
