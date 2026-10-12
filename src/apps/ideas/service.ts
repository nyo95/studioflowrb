import { createPrivateObjectKey } from "@platform/core/storage";
import type { ObjectStorage } from "@platform/core/storage";
import { randomUUID } from "node:crypto";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import type { ExternalScheduleOption, ExternalScheduleTarget } from "@/apps/studioflow/public/ideas-bridge";

import { invalid, notFound, requireIdeas, writeIdeasAudit, type IdeasContext, type IdeasDb, type IdeasPorts, type IdeasTx } from "./shared";

export const IDEA_IMAGE_BYTES = 3 * 1024 * 1024;
export const IDEA_TITLE_MAX = 160;
export const IDEA_NOTE_MAX = 2000;
export const IDEA_URL_MAX = 2000;
const SIGNED_URL_SECONDS = 15 * 60;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type IdeaImageUpload = { body: Uint8Array; contentType: string };
export type IdeaCardText = { title?: string | null; sourceUrl?: string | null; note?: string | null };
export type IdeaOptionText = ExternalScheduleOption;
export type IdeaUseTarget = ExternalScheduleTarget;

/** Trusted lifecycle hook: retry object removals whose owning card row is already gone or replaced. */
export async function retryIdeasAssetCleanup(db: IdeasDb, storage: ObjectStorage, limit = 25) {
  const pending = await db.ideaAssetCleanupFailure.findMany({
    where: { resolved_at: null },
    orderBy: [{ first_failed_at: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
  });
  let resolved = 0;
  let failed = 0;
  for (const item of pending) {
    try {
      await storage.remove(item.storage_key);
      await db.ideaAssetCleanupFailure.update({ where: { id: item.id }, data: { resolved_at: new Date(), last_attempt_at: new Date() } });
      resolved += 1;
    } catch {
      await db.ideaAssetCleanupFailure.update({ where: { id: item.id }, data: { attempts: { increment: 1 }, last_attempt_at: new Date() } });
      failed += 1;
    }
  }
  return { attempted: pending.length, resolved, failed };
}

function text(value: string | null | undefined, max: number, code: string, label: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > max) throw invalid(code, `${label} is too long.`);
  return trimmed;
}

export function ideaSourceUrl(value: string | null | undefined): string | null {
  const valueText = text(value, IDEA_URL_MAX, "IDEA_URL_INVALID", "Link");
  if (!valueText) return null;
  let parsed: URL;
  try { parsed = new URL(valueText); } catch { throw invalid("IDEA_URL_INVALID", "Use a web link starting with http:// or https://."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw invalid("IDEA_URL_INVALID", "Use a web link starting with http:// or https://.");
  return valueText;
}

function cardText(input: IdeaCardText) {
  return {
    ...(input.title !== undefined ? { title: text(input.title, IDEA_TITLE_MAX, "IDEA_TITLE_TOO_LONG", "Title") } : {}),
    ...(input.sourceUrl !== undefined ? { source_url: ideaSourceUrl(input.sourceUrl) } : {}),
    ...(input.note !== undefined ? { note: text(input.note, IDEA_NOTE_MAX, "IDEA_NOTE_TOO_LONG", "Note") } : {}),
  };
}

function sniffImage(body: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") return body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47;
  if (contentType === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === "image/webp") return body.length >= 12 && String.fromCharCode(...body.slice(0, 4)) === "RIFF" && String.fromCharCode(...body.slice(8, 12)) === "WEBP";
  return false;
}

function imageExtension(file: IdeaImageUpload): string {
  const extension = IMAGE_TYPES[file.contentType];
  if (!extension || !sniffImage(file.body, file.contentType)) throw invalid("IDEA_IMAGE_TYPE", "Use a valid PNG, JPEG, or WebP image.");
  if (file.body.byteLength === 0 || file.body.byteLength > IDEA_IMAGE_BYTES) throw invalid("IDEA_IMAGE_SIZE", "Images must be smaller than 3 MB.");
  return extension;
}

export function createIdeaService(db: IdeasDb, ports: IdeasPorts) {
  async function ownCard(tx: IdeasDb | IdeasTx, ownerId: string, cardId: string) {
    const card = await tx.sfIdeaCard.findUnique({ where: { id: cardId } });
    if (!card || card.owner_user_id !== ownerId) throw notFound();
    return card;
  }

  async function queueCleanup(tx: IdeasTx, key: string) {
    await tx.ideaAssetCleanupFailure.upsert({
      where: { storage_key: key },
      create: { storage_key: key },
      update: { resolved_at: null },
    });
  }

  async function removeQueued(key: string) {
    try {
      await ports.storage.remove(key);
      await db.ideaAssetCleanupFailure.updateMany({ where: { storage_key: key, resolved_at: null }, data: { resolved_at: new Date() } });
    } catch {
      await db.ideaAssetCleanupFailure.upsert({
        where: { storage_key: key },
        create: { storage_key: key, attempts: 1 },
        update: { attempts: { increment: 1 }, last_attempt_at: new Date(), resolved_at: null },
      }).catch(() => {});
    }
  }

  async function discardNew(key: string) {
    try { await ports.storage.remove(key); } catch {
      await db.ideaAssetCleanupFailure.upsert({ where: { storage_key: key }, create: { storage_key: key, attempts: 1 }, update: { attempts: { increment: 1 }, last_attempt_at: new Date(), resolved_at: null } }).catch(() => {});
    }
  }

  async function signedUrl(key: string): Promise<string | null> {
    try { return await ports.storage.createSignedReadUrl(key, SIGNED_URL_SECONDS); } catch { return null; }
  }

  return {
    async listIdeaCards(input: IdeasContext) {
      const userId = requireIdeas(input);
      const cards = await db.sfIdeaCard.findMany({ where: { owner_user_id: userId }, orderBy: [{ created_at: "desc" }, { id: "desc" }], include: { usages: { orderBy: { created_at: "asc" } } } });
      const usageFacts = await ports.studioFlow.resolveScheduleUsages({ ...input, optionIds: cards.flatMap((card) => card.usages.map((usage) => usage.option_id)) });
      const facts = new Map(usageFacts.map((fact) => [fact.optionId, fact]));
      const missing = cards.flatMap((card) => card.usages).filter((usage) => !facts.has(usage.option_id)).map((usage) => usage.id);
      if (missing.length) await db.sfIdeaUsage.deleteMany({ where: { id: { in: missing } } });
      return Promise.all(cards.map(async (card) => ({
        id: card.id, title: card.title, sourceUrl: card.source_url, note: card.note,
        imageUrl: await signedUrl(card.image_key), contentType: card.content_type, bytes: card.bytes,
        createdAt: card.created_at, updatedAt: card.updated_at,
        usages: card.usages.flatMap((usage) => {
          const fact = facts.get(usage.option_id);
          return fact ? [{ id: usage.id, ...fact, usedAt: usage.created_at }] : [];
        }),
      })));
    },

    async listIdeaTargets(input: IdeasContext) {
      requireIdeas(input);
      return ports.studioFlow.listWritableScheduleTargets(input);
    },

    async listIdeaTargetEntries(input: IdeasContext & { projectId: string }) {
      requireIdeas(input);
      return ports.studioFlow.listSchedulePlacementEntries(input);
    },

    async listIdeaCategoryChoices(input: IdeasContext) {
      requireIdeas(input);
      return ports.studioFlow.listScheduleCategoryChoices(input);
    },

    async createIdeaCard(input: IdeasContext & IdeaCardText & { file: IdeaImageUpload }) {
      const userId = requireIdeas(input);
      const extension = imageExtension(input.file);
      const key = createPrivateObjectKey("ideas/cards", extension);
      await ports.storage.put({ key, contentType: input.file.contentType, bytes: input.file.body.byteLength, body: input.file.body });
      try {
        return await ports.runTransaction(async (tx) => {
          const card = await tx.sfIdeaCard.create({ data: { owner_user_id: userId, ...cardText(input), image_key: key, content_type: input.file.contentType, bytes: input.file.body.byteLength }, select: { id: true } });
          await writeIdeasAudit(ports, tx, { action: "ideas.card.created", entityId: card.id, actor: input.actor, metadata: { bytes: input.file.body.byteLength } });
          return { cardId: card.id };
        });
      } catch (error) { await discardNew(key); throw error; }
    },

    async updateIdeaCard(input: IdeasContext & IdeaCardText & { cardId: string }) {
      const userId = requireIdeas(input);
      const data = cardText(input);
      return ports.runTransaction(async (tx) => {
        const card = await ownCard(tx, userId, input.cardId);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const [field, value] of Object.entries(data) as Array<[keyof typeof data, string | null]>) if (card[field] !== value) changes[field] = { from: card[field], to: value };
        if (Object.keys(changes).length === 0) return { cardId: card.id };
        await tx.sfIdeaCard.update({ where: { id: card.id }, data });
        await writeIdeasAudit(ports, tx, { action: "ideas.card.updated", entityId: card.id, actor: input.actor, changes });
        return { cardId: card.id };
      });
    },

    async replaceIdeaImage(input: IdeasContext & { cardId: string; file: IdeaImageUpload }) {
      const userId = requireIdeas(input);
      const extension = imageExtension(input.file);
      await ownCard(db, userId, input.cardId);
      const key = createPrivateObjectKey("ideas/cards", extension);
      await ports.storage.put({ key, contentType: input.file.contentType, bytes: input.file.body.byteLength, body: input.file.body });
      let oldKey: string;
      try {
        oldKey = await ports.runTransaction(async (tx) => {
          const card = await ownCard(tx, userId, input.cardId);
          await tx.sfIdeaCard.update({ where: { id: card.id }, data: { image_key: key, content_type: input.file.contentType, bytes: input.file.body.byteLength } });
          await queueCleanup(tx, card.image_key);
          await writeIdeasAudit(ports, tx, { action: "ideas.card.image-replaced", entityId: card.id, actor: input.actor, metadata: { bytes: input.file.body.byteLength } });
          return card.image_key;
        });
      } catch (error) { await discardNew(key); throw error; }
      await removeQueued(oldKey);
      return { cardId: input.cardId };
    },

    async deleteIdeaCard(input: IdeasContext & { cardId: string }) {
      const userId = requireIdeas(input);
      const result = await ports.runTransaction(async (tx) => {
        const card = await ownCard(tx, userId, input.cardId);
        const usages = await tx.sfIdeaUsage.count({ where: { card_id: card.id } });
        await tx.sfIdeaCard.delete({ where: { id: card.id } });
        await queueCleanup(tx, card.image_key);
        await writeIdeasAudit(ports, tx, { action: "ideas.card.deleted", entityId: card.id, actor: input.actor, metadata: { usages } });
        return { cardId: card.id, key: card.image_key };
      });
      await removeQueued(result.key);
      return { cardId: result.cardId };
    },

    async useIdeaInSchedule(input: IdeasContext & { operationId?: string; cardId: string; projectId: string; target: IdeaUseTarget; option: IdeaOptionText }) {
      const userId = requireIdeas(input);
      const card = await ownCard(db, userId, input.cardId);
      const placed = await ports.studioFlow.placeExternalImageInSchedule({ ...input, operationId: input.operationId ?? randomUUID(), source: { key: card.image_key, contentType: card.content_type }, metadata: { ideaCardId: card.id } });
      try {
        await ports.runTransaction(async (tx) => {
          await ownCard(tx, userId, card.id);
          await tx.sfIdeaUsage.upsert({ where: { card_id_option_id: { card_id: card.id, option_id: placed.optionId } }, create: { card_id: card.id, option_id: placed.optionId }, update: {} });
          await writeIdeasAudit(ports, tx, { action: "ideas.card.used", entityId: card.id, actor: input.actor, metadata: { projectId: placed.projectId, entryId: placed.entryId, optionId: placed.optionId, code: placed.code, label: placed.label } });
        });
      } catch {
        console.error("Ideas usage history could not be recorded after a successful Schedule placement.");
        await ports.runTransaction((tx) => writeIdeasAudit(ports, tx, {
          action: "ideas.card.usage-record-failed",
          entityId: card.id,
          actor: input.actor,
          metadata: { projectId: placed.projectId, entryId: placed.entryId, optionId: placed.optionId },
        })).catch(() => {});
      }
      return placed;
    },

    async readIdeaImageSource(input: IdeasContext & { cardId: string }) {
      const userId = requireIdeas(input);
      const card = await ownCard(db, userId, input.cardId);
      return { key: card.image_key, contentType: card.content_type };
    },

    async readNoteImageSource(input: IdeasContext & { projectId: string; phaseId: string; imageId: string }) {
      requireIdeas(input);
      const image = await ports.studioFlow.readWorkspaceImageSource(input);
      return { key: image.key, contentType: image.contentType };
    },

    async saveNoteImageToIdeas(input: IdeasContext & { projectId: string; phaseId: string; imageId: string }) {
      const userId = requireIdeas(input);
      const image = await ports.studioFlow.readWorkspaceImageSource(input);
      const key = createPrivateObjectKey("ideas/cards", IMAGE_TYPES[image.contentType] ?? "png");
      await ports.storage.copy({ fromKey: image.key, toKey: key });
      try {
        return await ports.runTransaction(async (tx) => {
          const card = await tx.sfIdeaCard.create({ data: { owner_user_id: userId, note: `From the notes of ${image.projectName}`.slice(0, IDEA_NOTE_MAX), image_key: key, content_type: image.contentType, bytes: image.bytes }, select: { id: true } });
          await writeIdeasAudit(ports, tx, { action: "ideas.card.created", entityId: card.id, actor: input.actor, metadata: { bytes: image.bytes, source: "phase-note-image", projectId: input.projectId } });
          return { cardId: card.id };
        });
      } catch (error) { await discardNew(key); throw error; }
    },

    async useNoteImageInSchedule(input: IdeasContext & { operationId?: string; projectId: string; phaseId: string; imageId: string; target: IdeaUseTarget; option: IdeaOptionText }) {
      requireIdeas(input);
      const image = await ports.studioFlow.readWorkspaceImageSource(input);
      return ports.studioFlow.placeExternalImageInSchedule({ ...input, operationId: input.operationId ?? randomUUID(), source: { key: image.key, contentType: image.contentType }, metadata: { source: "phase-note-image" } });
    },

    async removeScheduleOptionUsage(optionId: string) {
      await db.sfIdeaUsage.deleteMany({ where: { option_id: optionId } });
    },

    async retryAssetCleanup(limit?: number) {
      return retryIdeasAssetCleanup(db, ports.storage, limit);
    },

    permission: STUDIOFLOW_PERMISSIONS.ideasManage,
  };
}

export type IdeasService = ReturnType<typeof createIdeaService>;
