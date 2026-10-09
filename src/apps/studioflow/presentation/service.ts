import { createPrivateObjectKey } from "@platform/core/storage";

import { discardObjects, removeUnreferenced as removeUnreferencedAssets } from "../asset-cleanup";
import { STUDIOFLOW_IMAGE_TYPES, sniffImage } from "../domain/images";
import { scheduleCode } from "../domain/schedule";
import {
  P,
  hasPermission,
  invalid,
  loadWritableProject,
  notFound,
  optionalText,
  requireCommand,
  requireProjectAccess,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";

const BOARD_ENTITY = "presentation-board";
const SLIDE_ENTITY = "presentation-slide";
const ANNOTATION_ENTITY = "presentation-annotation";
const IMAGE_BYTES = 3 * 1024 * 1024;
/** The board an image is put on by "Add to moodboard"; found by this title (any letter case), created when missing. */
const MOODBOARD_TITLE = "Moodboard";
const SIGNED_URL_SECONDS = 15 * 60;

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
  const extension = STUDIOFLOW_IMAGE_TYPES[file.contentType];
  if (!extension) throw invalid("PRESENTATION_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
  if (file.body.byteLength === 0 || file.body.byteLength > IMAGE_BYTES) throw invalid("PRESENTATION_IMAGE_SIZE", "Images must be smaller than 3 MB.");
  if (!sniffImage(file.body, file.contentType)) throw invalid("PRESENTATION_IMAGE_TYPE", "This file is not a valid image.");
  return extension;
}

function orderIds(ids: readonly string[], expected: readonly string[]): void {
  if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some((id) => !expected.includes(id))) {
    throw invalid("PRESENTATION_ORDER_INVALID", "The reordered items must match the current list.");
  }
}

export function createPresentationService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction, storage } = ports;

  async function requirePresentationCommand(input: CommandContext & { projectId: string }): Promise<string> {
    const userId = requireCommand(input, P.presentationManage);
    await requireProjectAccess(db, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "document" });
    return userId;
  }

  async function removeUnreferenced(keys: readonly (string | null | undefined)[]) {
    await removeUnreferencedAssets(db, storage, keys);
  }

  async function signedUrl(key: string): Promise<string | null> {
    try {
      return await storage.createSignedReadUrl(key, SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  }

  async function loadBoard(tx: TxClient, projectId: string, boardId: string, write: boolean) {
    const board = await tx.sfPresentationBoard.findUnique({ where: { id: boardId } });
    if (!board || board.project_id !== projectId) throw notFound("presentation board");
    if (write) await loadWritableProject(tx, projectId);
    return board;
  }

  async function loadSlide(tx: TxClient, projectId: string, slideId: string, write: boolean) {
    const slide = await tx.sfPresentationSlide.findUnique({ where: { id: slideId }, include: { board: true } });
    if (!slide || slide.board.project_id !== projectId) throw notFound("presentation slide");
    if (write) await loadWritableProject(tx, projectId);
    return slide;
  }

  async function loadAnnotation(tx: TxClient, projectId: string, annotationId: string, write: boolean) {
    const annotation = await tx.sfPresentationAnnotation.findUnique({ where: { id: annotationId }, include: { slide: { include: { board: true } } } });
    if (!annotation || annotation.slide.board.project_id !== projectId) throw notFound("presentation annotation");
    if (write) await loadWritableProject(tx, projectId);
    return annotation;
  }

  async function validateScheduleEntry(tx: TxClient, projectId: string, scheduleEntryId: string | null | undefined): Promise<string | null> {
    if (!scheduleEntryId) return null;
    const entry = await tx.sfScheduleEntry.findUnique({ where: { id: scheduleEntryId }, select: { id: true, project_id: true } });
    if (!entry || entry.project_id !== projectId) throw invalid("PRESENTATION_SCHEDULE_ENTRY", "Choose a Product Schedule entry from this project.");
    return entry.id;
  }

  return {
    canManage(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.access) && hasPermission(grants, P.presentationManage);
    },

    async listBoards(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const boards = await db.sfPresentationBoard.findMany({
        where: { project_id: input.projectId },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        include: { _count: { select: { slides: true } } },
      });
      return boards.map((board) => ({ id: board.id, projectId: board.project_id, title: board.title, sortOrder: board.sort_order, slideCount: board._count.slides }));
    },

    async listScheduleChoices(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const entries = await db.sfScheduleEntry.findMany({
        where: { project_id: input.projectId },
        orderBy: [{ section: "asc" }, { category_key: "asc" }, { increment: "asc" }],
        include: { options: { orderBy: { label: "asc" } } },
      });
      return entries.map((entry) => {
        const option = entry.options.find((row) => row.is_final) ?? entry.options[0] ?? null;
        return { id: entry.id, code: scheduleCode(entry.prefix, entry.increment), productName: option?.product_name ?? null };
      });
    },

    async getBoard(input: ReadContext & { projectId: string; boardId: string }) {
      requireRead(input.grants);
      const board = await db.sfPresentationBoard.findUnique({
        where: { id: input.boardId },
        include: {
          slides: {
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
            include: {
              annotations: {
                orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
                include: { schedule_entry: { include: { options: { orderBy: { label: "asc" } } } } },
              },
            },
          },
        },
      });
      if (!board || board.project_id !== input.projectId) throw notFound("presentation board");
      return {
        id: board.id,
        projectId: board.project_id,
        title: board.title,
        slides: await Promise.all(board.slides.map(async (slide) => ({
          id: slide.id,
          imageUrl: await signedUrl(slide.image_key),
          imageRatio: slide.image_ratio,
          sortOrder: slide.sort_order,
          annotations: slide.annotations.map((annotation) => {
            const entry = annotation.schedule_entry;
            const option = entry?.options.find((row) => row.is_final) ?? entry?.options[0] ?? null;
            return {
              id: annotation.id,
              scheduleEntryId: annotation.schedule_entry_id,
              pinX: annotation.pin_x,
              pinY: annotation.pin_y,
              labelSide: annotation.label_side.toLowerCase() as PresentationLabelSide,
              note: annotation.note,
              sortOrder: annotation.sort_order,
              scheduleEntry: entry ? { id: entry.id, code: scheduleCode(entry.prefix, entry.increment), productName: option?.product_name ?? null } : null,
            };
          }),
        }))),
      };
    },

    async createBoard(input: CommandContext & { projectId: string; title: string }) {
      const userId = await requirePresentationCommand(input);
      const title = requiredText(input.title, "PRESENTATION_TITLE_REQUIRED", "Board title", 200);
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const max = await tx.sfPresentationBoard.aggregate({ where: { project_id: input.projectId }, _max: { sort_order: true } });
        const board = await tx.sfPresentationBoard.create({ data: { project_id: input.projectId, title, sort_order: (max._max.sort_order ?? -1) + 1, created_by_id: userId } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.board-created", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, title } });
        return { boardId: board.id };
      });
    },

    async updateBoard(input: CommandContext & { projectId: string; boardId: string; title: string }) {
      await requirePresentationCommand(input);
      const title = requiredText(input.title, "PRESENTATION_TITLE_REQUIRED", "Board title", 200);
      return runTransaction(async (tx) => {
        const board = await loadBoard(tx, input.projectId, input.boardId, true);
        await tx.sfPresentationBoard.update({ where: { id: board.id }, data: { title } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.board-updated", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, changes: { title: { from: board.title, to: title } }, metadata: { projectId: input.projectId } });
        return { boardId: board.id };
      });
    },

    async reorderBoards(input: CommandContext & { projectId: string; orderedIds: string[] }) {
      await requirePresentationCommand(input);
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const boards = await tx.sfPresentationBoard.findMany({ where: { project_id: input.projectId }, select: { id: true } });
        orderIds(input.orderedIds, boards.map((board) => board.id));
        for (const [sortOrder, id] of input.orderedIds.entries()) await tx.sfPresentationBoard.update({ where: { id }, data: { sort_order: sortOrder } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.boards-reordered", entityType: "project", entityId: input.projectId, actor: input.actor, metadata: { projectId: input.projectId, count: input.orderedIds.length } });
      });
    },

    async deleteBoard(input: CommandContext & { projectId: string; boardId: string }) {
      await requirePresentationCommand(input);
      const result = await runTransaction(async (tx) => {
        const board = await loadBoard(tx, input.projectId, input.boardId, true);
        const slides = await tx.sfPresentationSlide.findMany({ where: { board_id: board.id }, select: { image_key: true } });
        await tx.sfPresentationBoard.delete({ where: { id: board.id } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.board-deleted", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, title: board.title, slideCount: slides.length } });
        return { imageKeys: slides.map((slide) => slide.image_key) };
      });
      await removeUnreferenced(result.imageKeys);
    },

    /**
     * Puts an image that already lives in storage (an Ideas card, a phase-note image) on the project's "Moodboard" board as its
     * last slide, creating that board when the project has none. The object is copied, so removing either side never touches the other.
     */
    async addStoredImageToMoodboard(input: CommandContext & { projectId: string; source: { key: string; contentType: string } }) {
      const userId = await requirePresentationCommand(input);
      const extension = STUDIOFLOW_IMAGE_TYPES[input.source.contentType];
      if (!extension) throw invalid("PRESENTATION_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
      const key = createPrivateObjectKey(`studioflow/presentation/${input.projectId}`, extension);
      await storage.copy({ fromKey: input.source.key, toKey: key });
      try {
        return await runTransaction(async (tx) => {
          await loadWritableProject(tx, input.projectId);
          let board = await tx.sfPresentationBoard.findFirst({ where: { project_id: input.projectId, title: { equals: MOODBOARD_TITLE, mode: "insensitive" } }, orderBy: { sort_order: "asc" } });
          const created = !board;
          if (!board) {
            const max = await tx.sfPresentationBoard.aggregate({ where: { project_id: input.projectId }, _max: { sort_order: true } });
            board = await tx.sfPresentationBoard.create({ data: { project_id: input.projectId, title: MOODBOARD_TITLE, sort_order: (max._max.sort_order ?? -1) + 1, created_by_id: userId } });
            await writeAudit(ports, tx, { action: "studioflow.presentation.board-created", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, title: MOODBOARD_TITLE } });
          }
          const last = await tx.sfPresentationSlide.aggregate({ where: { board_id: board.id }, _max: { sort_order: true } });
          const slide = await tx.sfPresentationSlide.create({ data: { board_id: board.id, image_key: key, image_ratio: null, sort_order: (last._max.sort_order ?? -1) + 1 } });
          await writeAudit(ports, tx, { action: "studioflow.presentation.slides-added", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, count: 1, source: "moodboard" } });
          return { boardId: board.id, slideId: slide.id, created };
        });
      } catch (error) {
        await discardObjects(db, storage, [key]);
        throw error;
      }
    },

    async addSlides(input: CommandContext & { projectId: string; boardId: string; files: PresentationImageUpload[] }) {
      await requirePresentationCommand(input);
      if (input.files.length === 0) throw invalid("PRESENTATION_IMAGES_REQUIRED", "Choose at least one image.");
      const uploads = input.files.map((file) => ({ file, extension: validateImage(file), ratio: imageRatio(file.imageRatio) }));
      await loadBoard(db, input.projectId, input.boardId, true);
      const keys: string[] = [];
      try {
        for (const upload of uploads) {
          const key = createPrivateObjectKey(`studioflow/presentation/${input.projectId}`, upload.extension);
          await storage.put({ key, body: upload.file.body, bytes: upload.file.body.byteLength, contentType: upload.file.contentType });
          keys.push(key);
        }
        return await runTransaction(async (tx) => {
          const board = await loadBoard(tx, input.projectId, input.boardId, true);
          const max = await tx.sfPresentationSlide.aggregate({ where: { board_id: board.id }, _max: { sort_order: true } });
          const slides = [];
          for (const [index, key] of keys.entries()) {
            slides.push(await tx.sfPresentationSlide.create({ data: { board_id: board.id, image_key: key, image_ratio: uploads[index].ratio, sort_order: (max._max.sort_order ?? -1) + index + 1 } }));
          }
          await writeAudit(ports, tx, { action: "studioflow.presentation.slides-added", entityType: BOARD_ENTITY, entityId: board.id, actor: input.actor, metadata: { projectId: input.projectId, count: slides.length, bytes: uploads.reduce((total, item) => total + item.file.body.byteLength, 0) } });
          return { slideIds: slides.map((slide) => slide.id) };
        });
      } catch (error) {
        // No slide row committed; removal failures still go to the retry ledger.
        await discardObjects(db, storage, keys);
        throw error;
      }
    },

    async reorderSlides(input: CommandContext & { projectId: string; boardId: string; orderedIds: string[] }) {
      await requirePresentationCommand(input);
      return runTransaction(async (tx) => {
        await loadBoard(tx, input.projectId, input.boardId, true);
        const slides = await tx.sfPresentationSlide.findMany({ where: { board_id: input.boardId }, select: { id: true } });
        orderIds(input.orderedIds, slides.map((slide) => slide.id));
        for (const [sortOrder, id] of input.orderedIds.entries()) await tx.sfPresentationSlide.update({ where: { id }, data: { sort_order: sortOrder } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.slides-reordered", entityType: BOARD_ENTITY, entityId: input.boardId, actor: input.actor, metadata: { projectId: input.projectId, count: input.orderedIds.length } });
      });
    },

    async deleteSlide(input: CommandContext & { projectId: string; slideId: string }) {
      await requirePresentationCommand(input);
      const result = await runTransaction(async (tx) => {
        const slide = await loadSlide(tx, input.projectId, input.slideId, true);
        await tx.sfPresentationSlide.delete({ where: { id: slide.id } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.slide-deleted", entityType: SLIDE_ENTITY, entityId: slide.id, actor: input.actor, metadata: { projectId: input.projectId, boardId: slide.board_id } });
        return { imageKey: slide.image_key };
      });
      await removeUnreferenced([result.imageKey]);
    },

    async addAnnotation(input: CommandContext & { projectId: string; slideId: string; pinX: number; pinY: number; scheduleEntryId?: string | null; labelSide?: string; note?: string | null }) {
      await requirePresentationCommand(input);
      const pinX = pin(input.pinX, "x");
      const pinY = pin(input.pinY, "y");
      const side = labelSide(input.labelSide);
      const note = optionalText(input.note, 2000);
      return runTransaction(async (tx) => {
        const slide = await loadSlide(tx, input.projectId, input.slideId, true);
        const scheduleEntryId = await validateScheduleEntry(tx, input.projectId, input.scheduleEntryId);
        const max = await tx.sfPresentationAnnotation.aggregate({ where: { slide_id: slide.id }, _max: { sort_order: true } });
        const annotation = await tx.sfPresentationAnnotation.create({ data: { slide_id: slide.id, schedule_entry_id: scheduleEntryId, pin_x: pinX, pin_y: pinY, label_side: storedLabelSide(side), note, sort_order: (max._max.sort_order ?? -1) + 1 } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.annotation-created", entityType: ANNOTATION_ENTITY, entityId: annotation.id, actor: input.actor, metadata: { projectId: input.projectId, slideId: slide.id, scheduleEntryId } });
        return { annotationId: annotation.id };
      });
    },

    async updateAnnotation(input: CommandContext & { projectId: string; annotationId: string; pinX?: number; pinY?: number; scheduleEntryId?: string | null; labelSide?: string; note?: string | null }) {
      await requirePresentationCommand(input);
      const side = input.labelSide === undefined ? undefined : labelSide(input.labelSide);
      const note = input.note === undefined ? undefined : optionalText(input.note, 2000);
      return runTransaction(async (tx) => {
        const annotation = await loadAnnotation(tx, input.projectId, input.annotationId, true);
        const scheduleEntryId = input.scheduleEntryId === undefined ? undefined : await validateScheduleEntry(tx, input.projectId, input.scheduleEntryId);
        const pinX = input.pinX === undefined ? undefined : pin(input.pinX, "x");
        const pinY = input.pinY === undefined ? undefined : pin(input.pinY, "y");
        await tx.sfPresentationAnnotation.update({ where: { id: annotation.id }, data: { pin_x: pinX, pin_y: pinY, schedule_entry_id: scheduleEntryId, label_side: side === undefined ? undefined : storedLabelSide(side), note } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.annotation-updated", entityType: ANNOTATION_ENTITY, entityId: annotation.id, actor: input.actor, metadata: { projectId: input.projectId, slideId: annotation.slide_id } });
        return { annotationId: annotation.id };
      });
    },

    async deleteAnnotation(input: CommandContext & { projectId: string; annotationId: string }) {
      await requirePresentationCommand(input);
      return runTransaction(async (tx) => {
        const annotation = await loadAnnotation(tx, input.projectId, input.annotationId, true);
        await tx.sfPresentationAnnotation.delete({ where: { id: annotation.id } });
        await writeAudit(ports, tx, { action: "studioflow.presentation.annotation-deleted", entityType: ANNOTATION_ENTITY, entityId: annotation.id, actor: input.actor, metadata: { projectId: input.projectId, slideId: annotation.slide_id } });
      });
    },
  };
}

export type PresentationService = ReturnType<typeof createPresentationService>;
