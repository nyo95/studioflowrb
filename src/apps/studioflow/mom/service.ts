import { createPrivateObjectKey } from "@platform/core/storage";
import { currentDateOnly, isDateOnlyString } from "@platform/utilities/date";

import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import {
  MOM_DEFAULT_TOPIC,
  MOM_IMAGE_TYPES,
  MOM_LIMITS,
  MOM_LIST_STYLES,
  MOM_POINT_STYLES,
  isImageSlot,
  isPermutation,
  moveId,
  type MomImageSlot,
  type MomListStyle,
  type MomPointStyle,
} from "../domain/mom";
import {
  P,
  conflict,
  hasPermission,
  invalid,
  loadWritableProject,
  notFound,
  nowOf,
  optionalText,
  requireCommand,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";

const SIGNED_URL_SECONDS = 15 * 60;
const MOM_ENTITY = "mom-document";

export type MomImageUpload = { body: Uint8Array; contentType: string };

function scopeError() {
  return notFound("MOM record");
}

function listStyleOf(value: string): MomListStyle {
  if (!(MOM_LIST_STYLES as readonly string[]).includes(value)) throw invalid("MOM_LIST_STYLE_INVALID", "Choose a valid list style.");
  return value as MomListStyle;
}

function pointStyleOf(value: string): MomPointStyle {
  if (!(MOM_POINT_STYLES as readonly string[]).includes(value)) throw invalid("MOM_POINT_STYLE_INVALID", "Choose a valid point style.");
  return value as MomPointStyle;
}

function pointText(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\r\n/g, "\n");
  if (text.length > MOM_LIMITS.pointText) throw invalid("MOM_POINT_TOO_LONG", "This note is too long.");
  return text;
}

/** Magic-byte check so a renamed file cannot pose as an image. */
function sniffImage(body: Uint8Array, contentType: string): boolean {
  const b = body;
  if (contentType === "image/png") return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (contentType === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (contentType === "image/webp") {
    return b.length > 12 && String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP";
  }
  return false;
}

export function createMomService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction, storage } = ports;

  async function loadDocument(tx: TxClient, projectId: string, documentId: string, write: boolean) {
    const document = await tx.sfMomDocument.findUnique({ where: { id: documentId } });
    if (!document || document.project_id !== projectId) throw scopeError();
    if (write) await loadWritableProject(tx, projectId);
    return document;
  }

  async function loadItem(tx: TxClient, projectId: string, itemId: string) {
    const item = await tx.sfMomItem.findUnique({ where: { id: itemId }, include: { document: true } });
    if (!item || item.document.project_id !== projectId) throw scopeError();
    await loadWritableProject(tx, projectId);
    return item;
  }

  async function loadPoint(tx: TxClient, projectId: string, pointId: string) {
    const point = await tx.sfMomPoint.findUnique({ where: { id: pointId }, include: { item: { include: { document: true } } } });
    if (!point || point.item.document.project_id !== projectId) throw scopeError();
    await loadWritableProject(tx, projectId);
    return point;
  }

  async function touch(tx: TxClient, documentId: string) {
    await tx.sfMomDocument.update({ where: { id: documentId }, data: { updated_at: nowOf(ports) } });
  }

  async function writeOrder(tx: TxClient, table: "item" | "point", ids: readonly string[]) {
    for (const [index, id] of ids.entries()) {
      if (table === "item") await tx.sfMomItem.update({ where: { id }, data: { sort_order: index } });
      else await tx.sfMomPoint.update({ where: { id }, data: { sort_order: index } });
    }
  }

  async function itemIds(tx: TxClient, documentId: string) {
    return (await tx.sfMomItem.findMany({ where: { document_id: documentId }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }], select: { id: true } })).map((row) => row.id);
  }

  async function pointIds(tx: TxClient, itemId: string) {
    return (await tx.sfMomPoint.findMany({ where: { item_id: itemId }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }], select: { id: true } })).map((row) => row.id);
  }

  async function createItem(tx: TxClient, documentId: string, sortOrder: number) {
    const item = await tx.sfMomItem.create({ data: { document_id: documentId, sort_order: sortOrder } });
    await tx.sfMomPoint.create({ data: { item_id: item.id, sort_order: 0, text: "" } });
    return item;
  }

  /** Storage cleanup runs after commit; a failure leaves an orphan object, never a broken row. */
  async function removeObjects(keys: readonly string[]) {
    await Promise.all(keys.map((key) => storage.remove(key).catch(() => undefined)));
  }

  async function signedUrl(key: string): Promise<string | null> {
    try {
      return await storage.createSignedReadUrl(key, SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  }

  return {
    canManage(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.access) && hasPermission(grants, P.momManage);
    },

    // ── Reads ──────────────────────────────────────────────────────────────
    async listDocuments(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const rows = await db.sfMomDocument.findMany({
        where: { project_id: input.projectId },
        orderBy: [{ meeting_date: "desc" }, { updated_at: "desc" }],
        include: { _count: { select: { items: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        meetingDate: dateToDateOnly(row.meeting_date)!,
        venue: row.venue,
        preparedByName: row.prepared_by_name,
        sectionCount: row._count.items,
        updatedAt: row.updated_at,
      }));
    },

    async getDocument(input: ReadContext & { projectId: string; documentId: string }) {
      requireRead(input.grants);
      const row = await db.sfMomDocument.findUnique({
        where: { id: input.documentId },
        include: {
          items: {
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
            include: {
              points: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }] },
              images: { orderBy: { slot: "asc" } },
            },
          },
        },
      });
      if (!row || row.project_id !== input.projectId) throw scopeError();
      const items = await Promise.all(row.items.map(async (item) => ({
        id: item.id,
        isTextOnly: item.is_text_only,
        listStyle: item.list_style as MomListStyle,
        points: item.points.map((point) => ({ id: point.id, text: point.text, style: point.style as MomPointStyle })),
        images: await Promise.all(item.images.map(async (image) => ({
          id: image.id,
          slot: image.slot as MomImageSlot,
          url: await signedUrl(image.storage_key),
        }))),
      })));
      return {
        id: row.id,
        projectId: row.project_id,
        topic: row.topic,
        meetingDate: dateToDateOnly(row.meeting_date)!,
        venue: row.venue,
        attendees: row.attendees,
        preparedByName: row.prepared_by_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        items,
      };
    },

    // ── Document ───────────────────────────────────────────────────────────
    async createDocument(input: CommandContext & { projectId: string; timeZone?: string }) {
      const userId = requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const today = currentDateOnly({ now: nowOf(ports), timeZone: input.timeZone });
        const document = await tx.sfMomDocument.create({
          data: {
            project_id: input.projectId,
            topic: MOM_DEFAULT_TOPIC,
            meeting_date: dateOnlyToDate(today),
            prepared_by_name: input.actor.label.slice(0, MOM_LIMITS.preparedBy),
            created_by_id: userId,
          },
        });
        await createItem(tx, document.id, 0);
        await writeAudit(ports, tx, {
          action: "studioflow.mom.created", entityType: MOM_ENTITY, entityId: document.id, actor: input.actor,
          metadata: { projectId: input.projectId, topic: document.topic, meetingDate: today },
        });
        return { documentId: document.id };
      });
    },

    async updateDocument(input: CommandContext & {
      projectId: string;
      documentId: string;
      topic: string;
      meetingDate: string;
      venue?: string | null;
      attendees?: string | null;
      preparedByName: string;
    }) {
      requireCommand(input, P.momManage);
      const topic = requiredText(input.topic, "MOM_TOPIC_REQUIRED", "Topic", MOM_LIMITS.topic);
      const preparedBy = requiredText(input.preparedByName, "MOM_PREPARED_BY_REQUIRED", "Prepared by", MOM_LIMITS.preparedBy);
      if (!isDateOnlyString(input.meetingDate)) throw invalid("MOM_DATE_INVALID", "Choose a valid meeting date.");
      const venue = optionalText(input.venue, MOM_LIMITS.venue);
      const attendees = optionalText(input.attendees, MOM_LIMITS.attendees);
      return runTransaction(async (tx) => {
        const existing = await loadDocument(tx, input.projectId, input.documentId, true);
        const next = { topic, meeting_date: input.meetingDate, venue, attendees, prepared_by_name: preparedBy };
        const before = { topic: existing.topic, meeting_date: dateToDateOnly(existing.meeting_date), venue: existing.venue, attendees: existing.attendees, prepared_by_name: existing.prepared_by_name };
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (before[key] !== next[key]) changes[key] = { from: before[key], to: next[key] };
        }
        if (Object.keys(changes).length === 0) return { documentId: existing.id };
        await tx.sfMomDocument.update({
          where: { id: existing.id },
          data: { topic, meeting_date: dateOnlyToDate(input.meetingDate), venue, attendees, prepared_by_name: preparedBy },
        });
        await writeAudit(ports, tx, {
          action: "studioflow.mom.updated", entityType: MOM_ENTITY, entityId: existing.id, actor: input.actor,
          changes, metadata: { projectId: input.projectId },
        });
        return { documentId: existing.id };
      });
    },

    /** Real delete (legacy); the audit event keeps a snapshot. */
    async deleteDocument(input: CommandContext & { projectId: string; documentId: string }) {
      requireCommand(input, P.momManage);
      const keys = await runTransaction(async (tx) => {
        const existing = await loadDocument(tx, input.projectId, input.documentId, true);
        const images = await tx.sfMomImage.findMany({ where: { item: { document_id: existing.id } }, select: { storage_key: true } });
        const sections = await tx.sfMomItem.count({ where: { document_id: existing.id } });
        await tx.sfMomDocument.delete({ where: { id: existing.id } });
        await writeAudit(ports, tx, {
          action: "studioflow.mom.deleted", entityType: MOM_ENTITY, entityId: existing.id, actor: input.actor,
          metadata: {
            projectId: input.projectId,
            snapshot: { topic: existing.topic, meetingDate: dateToDateOnly(existing.meeting_date), venue: existing.venue, preparedByName: existing.prepared_by_name, sections, images: images.length },
          },
        });
        return images.map((image) => image.storage_key);
      });
      await removeObjects(keys);
      return { documentId: input.documentId };
    },

    // ── Sections ───────────────────────────────────────────────────────────
    async addItem(input: CommandContext & { projectId: string; documentId: string }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const document = await loadDocument(tx, input.projectId, input.documentId, true);
        const ids = await itemIds(tx, document.id);
        const item = await createItem(tx, document.id, ids.length);
        await touch(tx, document.id);
        return { itemId: item.id };
      });
    },

    async updateItem(input: CommandContext & { projectId: string; itemId: string; isTextOnly: boolean; listStyle: string }) {
      requireCommand(input, P.momManage);
      const listStyle = listStyleOf(input.listStyle);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        if (item.is_text_only === input.isTextOnly && item.list_style === listStyle) return { itemId: item.id };
        await tx.sfMomItem.update({ where: { id: item.id }, data: { is_text_only: input.isTextOnly, list_style: listStyle } });
        await touch(tx, item.document_id);
        return { itemId: item.id };
      });
    },

    async deleteItem(input: CommandContext & { projectId: string; itemId: string }) {
      requireCommand(input, P.momManage);
      const keys = await runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        const images = await tx.sfMomImage.findMany({ where: { item_id: item.id }, select: { storage_key: true } });
        await tx.sfMomItem.delete({ where: { id: item.id } });
        await writeOrder(tx, "item", await itemIds(tx, item.document_id));
        await touch(tx, item.document_id);
        await writeAudit(ports, tx, {
          action: "studioflow.mom.section-deleted", entityType: MOM_ENTITY, entityId: item.document_id, actor: input.actor,
          metadata: { projectId: input.projectId, itemId: item.id, images: images.length },
        });
        return images.map((image) => image.storage_key);
      });
      await removeObjects(keys);
      return { itemId: input.itemId };
    },

    async reorderItems(input: CommandContext & { projectId: string; documentId: string; itemIds: string[] }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const document = await loadDocument(tx, input.projectId, input.documentId, true);
        if (!isPermutation(await itemIds(tx, document.id), input.itemIds)) throw invalid("MOM_REORDER_INVALID", "The section list changed. Refresh and try again.");
        await writeOrder(tx, "item", input.itemIds);
        await touch(tx, document.id);
        return { documentId: document.id };
      });
    },

    async moveItem(input: CommandContext & { projectId: string; itemId: string; direction: "up" | "down" }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        const next = moveId(await itemIds(tx, item.document_id), item.id, input.direction);
        if (!next) return { itemId: item.id };
        await writeOrder(tx, "item", next);
        await touch(tx, item.document_id);
        return { itemId: item.id };
      });
    },

    // ── Points ─────────────────────────────────────────────────────────────
    async addPoint(input: CommandContext & { projectId: string; itemId: string; text?: string }) {
      requireCommand(input, P.momManage);
      const text = pointText(input.text);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        const count = await tx.sfMomPoint.count({ where: { item_id: item.id } });
        const point = await tx.sfMomPoint.create({ data: { item_id: item.id, sort_order: count, text } });
        await touch(tx, item.document_id);
        return { pointId: point.id };
      });
    },

    async updatePoint(input: CommandContext & { projectId: string; pointId: string; text: string; style: string }) {
      requireCommand(input, P.momManage);
      const text = pointText(input.text);
      const style = pointStyleOf(input.style);
      return runTransaction(async (tx) => {
        const point = await loadPoint(tx, input.projectId, input.pointId);
        if (point.text === text && point.style === style) return { pointId: point.id };
        await tx.sfMomPoint.update({ where: { id: point.id }, data: { text, style } });
        await touch(tx, point.item.document_id);
        return { pointId: point.id };
      });
    },

    /** A section always keeps one (possibly empty) point, like legacy. */
    async deletePoint(input: CommandContext & { projectId: string; pointId: string }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const point = await loadPoint(tx, input.projectId, input.pointId);
        await tx.sfMomPoint.delete({ where: { id: point.id } });
        const remaining = await pointIds(tx, point.item_id);
        if (remaining.length === 0) await tx.sfMomPoint.create({ data: { item_id: point.item_id, sort_order: 0, text: "" } });
        else await writeOrder(tx, "point", remaining);
        await touch(tx, point.item.document_id);
        return { pointId: point.id };
      });
    },

    async reorderPoints(input: CommandContext & { projectId: string; itemId: string; pointIds: string[] }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        if (!isPermutation(await pointIds(tx, item.id), input.pointIds)) throw invalid("MOM_REORDER_INVALID", "The note list changed. Refresh and try again.");
        await writeOrder(tx, "point", input.pointIds);
        await touch(tx, item.document_id);
        return { itemId: item.id };
      });
    },

    async movePoint(input: CommandContext & { projectId: string; pointId: string; direction: "up" | "down" }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const point = await loadPoint(tx, input.projectId, input.pointId);
        const next = moveId(await pointIds(tx, point.item_id), point.id, input.direction);
        if (!next) return { pointId: point.id };
        await writeOrder(tx, "point", next);
        await touch(tx, point.item.document_id);
        return { pointId: point.id };
      });
    },

    // ── Images ─────────────────────────────────────────────────────────────
    /**
     * Put the object first, then record it. Filling slot 1 while slot 0 is
     * empty lands in slot 0 (legacy order normalization).
     */
    async setImage(input: CommandContext & { projectId: string; itemId: string; slot: number; file: MomImageUpload }) {
      requireCommand(input, P.momManage);
      if (!isImageSlot(input.slot)) throw invalid("MOM_IMAGE_LIMIT", "Each section holds at most two images.");
      const extension = MOM_IMAGE_TYPES[input.file.contentType];
      if (!extension) throw invalid("MOM_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
      const bytes = input.file.body.byteLength;
      if (bytes === 0 || bytes > MOM_LIMITS.imageBytes) throw invalid("MOM_IMAGE_SIZE", "Images must be smaller than 10 MB.");
      if (!sniffImage(input.file.body, input.file.contentType)) throw invalid("MOM_IMAGE_TYPE", "This file is not a valid image.");

      // Scope check before touching storage.
      const precheck = await db.sfMomItem.findUnique({ where: { id: input.itemId }, include: { document: { select: { project_id: true } } } });
      if (!precheck || precheck.document.project_id !== input.projectId) throw scopeError();

      const key = createPrivateObjectKey(`studioflow/mom/${input.projectId}`, extension);
      await storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body });

      let previousKey: string | null = null;
      try {
        const result = await runTransaction(async (tx) => {
          const item = await loadItem(tx, input.projectId, input.itemId);
          const images = await tx.sfMomImage.findMany({ where: { item_id: item.id }, orderBy: { slot: "asc" } });
          const existing = images.find((image) => image.slot === input.slot);
          let slot = input.slot as MomImageSlot;
          if (existing) {
            previousKey = existing.storage_key;
            await tx.sfMomImage.update({ where: { id: existing.id }, data: { storage_key: key, content_type: input.file.contentType, bytes } });
          } else {
            if (slot === 1 && !images.some((image) => image.slot === 0)) slot = 0;
            await tx.sfMomImage.create({ data: { item_id: item.id, slot, storage_key: key, content_type: input.file.contentType, bytes } });
          }
          await touch(tx, item.document_id);
          await writeAudit(ports, tx, {
            action: existing ? "studioflow.mom.image-replaced" : "studioflow.mom.image-added",
            entityType: MOM_ENTITY, entityId: item.document_id, actor: input.actor,
            metadata: { projectId: input.projectId, itemId: item.id, slot, bytes },
          });
          return { itemId: item.id, slot };
        });
        if (previousKey) await removeObjects([previousKey]);
        return result;
      } catch (error) {
        await removeObjects([key]);
        throw error;
      }
    },

    async deleteImage(input: CommandContext & { projectId: string; imageId: string }) {
      requireCommand(input, P.momManage);
      const key = await runTransaction(async (tx) => {
        const image = await tx.sfMomImage.findUnique({ where: { id: input.imageId }, include: { item: { include: { document: true } } } });
        if (!image || image.item.document.project_id !== input.projectId) throw scopeError();
        await loadWritableProject(tx, input.projectId);
        await tx.sfMomImage.delete({ where: { id: image.id } });
        if (image.slot === 0) await tx.sfMomImage.updateMany({ where: { item_id: image.item_id, slot: 1 }, data: { slot: 0 } });
        await touch(tx, image.item.document_id);
        await writeAudit(ports, tx, {
          action: "studioflow.mom.image-removed", entityType: MOM_ENTITY, entityId: image.item.document_id, actor: input.actor,
          metadata: { projectId: input.projectId, itemId: image.item_id, slot: image.slot },
        });
        return image.storage_key;
      });
      await removeObjects([key]);
      return { imageId: input.imageId };
    },

    async swapImages(input: CommandContext & { projectId: string; itemId: string }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        const images = await tx.sfMomImage.findMany({ where: { item_id: item.id }, orderBy: { slot: "asc" } });
        if (images.length !== 2) throw conflict("MOM_IMAGE_SWAP_UNAVAILABLE", "Swapping needs two images in this section.");
        await tx.sfMomImage.deleteMany({ where: { item_id: item.id } });
        for (const image of images) {
          await tx.sfMomImage.create({
            data: { item_id: item.id, slot: image.slot === 0 ? 1 : 0, storage_key: image.storage_key, content_type: image.content_type, bytes: image.bytes, created_at: image.created_at },
          });
        }
        await touch(tx, item.document_id);
        return { itemId: item.id };
      });
    },
  };
}

export type MomService = ReturnType<typeof createMomService>;
