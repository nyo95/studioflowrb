import type { Prisma } from "@/generated/prisma/client";
import { createPrivateObjectKey } from "@platform/core/storage";
import { currentDateOnly, isDateOnlyString } from "@platform/utilities/date";

import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import { sniffImage } from "../domain/images";
import {
  MOM_IMAGE_TYPES,
  MOM_LIMITS,
  isImageSlot,
  buildMomSnapshot,
  isPermutation,
  momSnapshotImageKeys,
  momSnapshotsEqual,
  moveId,
  parseMomSnapshot,
  type MomImageSlot,
  type MomSnapshot,
} from "../domain/mom";
import { REVISION_RETENTION, nextRevisionNumber, versionLabel, revisionsToPrune } from "../domain/revisions";
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

function itemContentOf(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\r\n/g, "\n");
  if (text.length > MOM_LIMITS.itemContent) throw invalid("MOM_CONTENT_TOO_LONG", "This section's notes are too long.");
  return text;
}

const DOCUMENT_TREE = {
  items: {
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    include: {
      images: { orderBy: { slot: "asc" } },
    },
  },
} satisfies Prisma.SfMomDocumentInclude;

type DocumentTree = {
  topic: string;
  meeting_date: Date;
  venue: string | null;
  attendees: string | null;
  prepared_by_name: string;
  items: Array<{
    is_text_only: boolean;
    content: string;
    images: Array<{ slot: number; storage_key: string; content_type: string; bytes: number }>;
  }>;
};

function snapshotOf(row: DocumentTree): MomSnapshot {
  return buildMomSnapshot({
    topic: row.topic,
    meetingDate: dateToDateOnly(row.meeting_date)!,
    venue: row.venue,
    attendees: row.attendees,
    preparedByName: row.prepared_by_name,
    items: row.items.map((item) => ({
      isTextOnly: item.is_text_only,
      content: item.content,
      images: item.images.map((image) => ({ slot: image.slot, storageKey: image.storage_key, contentType: image.content_type, bytes: image.bytes })),
    })),
  });
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

  async function touch(tx: TxClient, documentId: string) {
    await tx.sfMomDocument.update({ where: { id: documentId }, data: { updated_at: nowOf(ports) } });
  }

  async function writeOrder(tx: TxClient, table: "item", ids: readonly string[]) {
    for (const [index, id] of ids.entries()) {
      await tx.sfMomItem.update({ where: { id }, data: { sort_order: index } });
    }
  }

  async function itemIds(tx: TxClient, documentId: string) {
    return (await tx.sfMomItem.findMany({ where: { document_id: documentId }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }], select: { id: true } })).map((row) => row.id);
  }

  async function createItem(tx: TxClient, documentId: string, sortOrder: number) {
    return tx.sfMomItem.create({ data: { document_id: documentId, sort_order: sortOrder } });
  }

  /** Storage cleanup runs after commit; a failure leaves an orphan object, never a broken row. */
  async function removeObjects(keys: readonly string[]) {
    await Promise.all(keys.map((key) => storage.remove(key).catch(() => undefined)));
  }

  async function readSnapshot(tx: TxClient, documentId: string): Promise<MomSnapshot> {
    const row = await tx.sfMomDocument.findUniqueOrThrow({ where: { id: documentId }, include: DOCUMENT_TREE });
    return snapshotOf(row);
  }

  /** Objects still needed by the working copy or any kept revision must survive a delete. */
  async function unreferenced(tx: TxClient, documentId: string, candidates: readonly string[]): Promise<string[]> {
    if (candidates.length === 0) return [];
    const [working, revisions] = await Promise.all([
      tx.sfMomImage.findMany({ where: { item: { document_id: documentId } }, select: { storage_key: true } }),
      tx.sfMomRevision.findMany({ where: { document_id: documentId }, select: { snapshot: true } }),
    ]);
    const live = new Set(working.map((image) => image.storage_key));
    for (const revision of revisions) {
      const snapshot = parseMomSnapshot(revision.snapshot);
      if (snapshot) for (const key of momSnapshotImageKeys(snapshot)) live.add(key);
    }
    return [...new Set(candidates)].filter((key) => !live.has(key));
  }

  /**
   * Freeze the working copy as the next revision and drop the oldest beyond the
   * retention limit. Returns null when nothing changed since the latest one.
   */
  async function freezeRevision(tx: TxClient, documentId: string, actor: { userId: string; label: string }, note: string | null) {
    const snapshot = await readSnapshot(tx, documentId);
    const kept = await tx.sfMomRevision.findMany({ where: { document_id: documentId }, orderBy: { number: "desc" } });
    const latest = kept[0] ? parseMomSnapshot(kept[0].snapshot) : null;
    if (latest && momSnapshotsEqual(latest, snapshot)) return null;
    const number = nextRevisionNumber(kept.map((revision) => revision.number));
    await tx.sfMomRevision.create({
      data: {
        document_id: documentId,
        number,
        note,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        created_by_id: actor.userId,
        created_by_name: actor.label.slice(0, MOM_LIMITS.preparedBy),
      },
    });
    const dropNumbers = revisionsToPrune([...kept.map((revision) => revision.number), number]);
    const dropped = kept.filter((revision) => dropNumbers.includes(revision.number));
    if (dropped.length > 0) await tx.sfMomRevision.deleteMany({ where: { id: { in: dropped.map((revision) => revision.id) } } });
    const droppedKeys = dropped.flatMap((revision) => {
      const parsed = parseMomSnapshot(revision.snapshot);
      return parsed ? momSnapshotImageKeys(parsed) : [];
    });
    return { number, droppedKeys };
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
        include: { _count: { select: { items: true } }, revisions: { orderBy: { number: "desc" }, take: 1, select: { number: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        meetingDate: dateToDateOnly(row.meeting_date)!,
        venue: row.venue,
        preparedByName: row.prepared_by_name,
        sectionCount: row._count.items,
        latestRevision: row.revisions[0]?.number ?? null,
        updatedAt: row.updated_at,
      }));
    },

    async getDocument(input: ReadContext & { projectId: string; documentId: string }) {
      requireRead(input.grants);
      const row = await db.sfMomDocument.findUnique({
        where: { id: input.documentId },
        include: {
          ...DOCUMENT_TREE,
          revisions: { orderBy: { number: "desc" }, select: { id: true, number: true, note: true, created_by_name: true, created_at: true } },
        },
      });
      if (!row || row.project_id !== input.projectId) throw scopeError();
      const latest = row.revisions[0]
        ? await db.sfMomRevision.findFirst({ where: { document_id: row.id }, orderBy: { number: "desc" }, select: { snapshot: true } })
        : null;
      const latestSnapshot = latest ? parseMomSnapshot(latest.snapshot) : null;
      const hasUnsavedChanges = !latestSnapshot || !momSnapshotsEqual(latestSnapshot, snapshotOf(row));
      const items = await Promise.all(row.items.map(async (item) => ({
        id: item.id,
        isTextOnly: item.is_text_only,
        content: item.content,
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
        revisions: row.revisions.map((revision) => ({
          id: revision.id,
          number: revision.number,
          note: revision.note,
          createdByName: revision.created_by_name,
          createdAt: revision.created_at,
        })),
        hasUnsavedChanges,
        revisionRetention: REVISION_RETENTION,
      };
    },

    // ── Document ───────────────────────────────────────────────────────────
    async createDocument(input: CommandContext & { projectId: string; topic: string; timeZone?: string }) {
      const userId = requireCommand(input, P.momManage);
      const topic = requiredText(input.topic, "MOM_TOPIC_REQUIRED", "Title", MOM_LIMITS.topic);
      return runTransaction(async (tx) => {
        await loadWritableProject(tx, input.projectId);
        const today = currentDateOnly({ now: nowOf(ports), timeZone: input.timeZone });
        const document = await tx.sfMomDocument.create({
          data: {
            project_id: input.projectId,
            topic,
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
        const revisions = await tx.sfMomRevision.findMany({ where: { document_id: existing.id }, select: { snapshot: true } });
        const revisionKeys = revisions.flatMap((revision) => {
          const parsed = parseMomSnapshot(revision.snapshot);
          return parsed ? momSnapshotImageKeys(parsed) : [];
        });
        const sections = await tx.sfMomItem.count({ where: { document_id: existing.id } });
        await tx.sfMomDocument.delete({ where: { id: existing.id } });
        await writeAudit(ports, tx, {
          action: "studioflow.mom.deleted", entityType: MOM_ENTITY, entityId: existing.id, actor: input.actor,
          metadata: {
            projectId: input.projectId,
            snapshot: { topic: existing.topic, meetingDate: dateToDateOnly(existing.meeting_date), venue: existing.venue, preparedByName: existing.prepared_by_name, sections, images: images.length, revisions: revisions.length },
          },
        });
        return [...new Set([...images.map((image) => image.storage_key), ...revisionKeys])];
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

    async updateItem(input: CommandContext & { projectId: string; itemId: string; isTextOnly: boolean }) {
      requireCommand(input, P.momManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        if (item.is_text_only === input.isTextOnly) return { itemId: item.id };
        await tx.sfMomItem.update({ where: { id: item.id }, data: { is_text_only: input.isTextOnly } });
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
        return unreferenced(tx, item.document_id, images.map((image) => image.storage_key));
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

    async updateItemContent(input: CommandContext & { projectId: string; itemId: string; content: string }) {
      requireCommand(input, P.momManage);
      const content = itemContentOf(input.content);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        if (item.content === content) return { itemId: item.id };
        await tx.sfMomItem.update({ where: { id: item.id }, data: { content } });
        await touch(tx, item.document_id);
        return { itemId: item.id };
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
      if (bytes === 0 || bytes > MOM_LIMITS.imageBytes) throw invalid("MOM_IMAGE_SIZE", "Photos must be smaller than 3 MB after cropping.");
      if (!sniffImage(input.file.body, input.file.contentType)) throw invalid("MOM_IMAGE_TYPE", "This file is not a valid image.");

      // Scope check before touching storage.
      const precheck = await db.sfMomItem.findUnique({ where: { id: input.itemId }, include: { document: { select: { project_id: true } } } });
      if (!precheck || precheck.document.project_id !== input.projectId) throw scopeError();

      const key = createPrivateObjectKey(`studioflow/mom/${input.projectId}`, extension);
      await storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body });

      let orphaned: string[] = [];
      try {
        const result = await runTransaction(async (tx) => {
          const item = await loadItem(tx, input.projectId, input.itemId);
          const images = await tx.sfMomImage.findMany({ where: { item_id: item.id }, orderBy: { slot: "asc" } });
          const existing = images.find((image) => image.slot === input.slot);
          let slot = input.slot as MomImageSlot;
          if (existing) {
            await tx.sfMomImage.update({ where: { id: existing.id }, data: { storage_key: key, content_type: input.file.contentType, bytes } });
            orphaned = await unreferenced(tx, item.document_id, [existing.storage_key]);
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
        await removeObjects(orphaned);
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
        return unreferenced(tx, image.item.document_id, [image.storage_key]);
      });
      await removeObjects(key);
      return { imageId: input.imageId };
    },

    // ── Revisions ──────────────────────────────────────────────────────────
    /** Freeze the working copy as the next version; the oldest beyond the limit is overwritten. */
    async saveRevision(input: CommandContext & { projectId: string; documentId: string; note?: string | null }) {
      const userId = requireCommand(input, P.momManage);
      const note = optionalText(input.note, MOM_LIMITS.revisionNote);
      const { number, dropped } = await runTransaction(async (tx) => {
        const document = await loadDocument(tx, input.projectId, input.documentId, true);
        const frozen = await freezeRevision(tx, document.id, { userId, label: input.actor.label }, note);
        if (!frozen) throw conflict("MOM_REVISION_NO_CHANGES", "Nothing has changed since the latest revision.");
        await writeAudit(ports, tx, {
          action: "studioflow.mom.revision-saved", entityType: MOM_ENTITY, entityId: document.id, actor: input.actor,
          metadata: { projectId: input.projectId, revision: versionLabel(frozen.number), note },
        });
        return { number: frozen.number, dropped: await unreferenced(tx, document.id, frozen.droppedKeys) };
      });
      await removeObjects(dropped);
      return { number };
    },

    /**
     * Replace the working copy with a kept revision. The state being replaced is
     * frozen as a new revision first, so a restore never loses work.
     */
    async restoreRevision(input: CommandContext & { projectId: string; documentId: string; revisionId: string }) {
      const userId = requireCommand(input, P.momManage);
      const { number, orphaned } = await runTransaction(async (tx) => {
        const document = await loadDocument(tx, input.projectId, input.documentId, true);
        const target = await tx.sfMomRevision.findUnique({ where: { id: input.revisionId } });
        if (!target || target.document_id !== document.id) throw scopeError();
        const snapshot = parseMomSnapshot(target.snapshot);
        if (!snapshot) throw conflict("MOM_REVISION_UNREADABLE", "This revision can no longer be read.");
        const current = await readSnapshot(tx, document.id);
        if (momSnapshotsEqual(current, snapshot)) throw conflict("MOM_REVISION_ALREADY_CURRENT", "The MOM already matches " + versionLabel(target.number) + ".");

        const before = await tx.sfMomImage.findMany({ where: { item: { document_id: document.id } }, select: { storage_key: true } });
        const frozen = await freezeRevision(tx, document.id, { userId, label: input.actor.label }, "Before restoring " + versionLabel(target.number));

        await tx.sfMomItem.deleteMany({ where: { document_id: document.id } });
        await tx.sfMomDocument.update({
          where: { id: document.id },
          data: {
            topic: snapshot.topic,
            meeting_date: dateOnlyToDate(snapshot.meetingDate),
            venue: snapshot.venue,
            attendees: snapshot.attendees,
            prepared_by_name: snapshot.preparedByName,
          },
        });
        for (const [index, item] of snapshot.items.entries()) {
          await tx.sfMomItem.create({
            data: {
              document_id: document.id,
              sort_order: index,
              is_text_only: item.isTextOnly,
              content: item.content,
              images: { create: item.images.map((image) => ({ slot: image.slot, storage_key: image.storageKey, content_type: image.contentType, bytes: image.bytes })) },
            },
          });
        }
        await writeAudit(ports, tx, {
          action: "studioflow.mom.revision-restored", entityType: MOM_ENTITY, entityId: document.id, actor: input.actor,
          metadata: { projectId: input.projectId, restored: versionLabel(target.number), backup: frozen ? versionLabel(frozen.number) : null },
        });
        const candidates = [...before.map((image) => image.storage_key), ...(frozen?.droppedKeys ?? [])];
        return { number: target.number, orphaned: await unreferenced(tx, document.id, candidates) };
      });
      await removeObjects(orphaned);
      return { number };
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
