import { createPrivateObjectKey } from "@platform/core/storage";

import { discardObjects, enqueueUnreferencedCleanup } from "../asset-cleanup";
import { NOTE_IMAGE_BYTES, STUDIOFLOW_IMAGE_TYPES, sniffImage } from "../domain/images";
import { scheduleCode } from "../domain/schedule";
import type { createScheduleService } from "../schedule/service";
import type { SnapshotInput } from "../schedule/sync";
import { hasPermission, invalid, notFound, P, projectAccessFromFacts, requireCommand, writeAudit, type CommandContext, type Db, type StudioFlowPorts, type TxClient } from "../shared";

/** Same limits as schedule option photos, which a card's image is copied into. */
export const IDEA_IMAGE_BYTES = NOTE_IMAGE_BYTES;
export const IDEA_TITLE_MAX = 160;
export const IDEA_NOTE_MAX = 2000;
export const IDEA_URL_MAX = 2000;
const IDEA_SIGNED_URL_SECONDS = 15 * 60;
const CARD_ENTITY = "idea-card";

export type IdeaImageUpload = { body: Uint8Array; contentType: string };

/** Text a card is given or changed with; `undefined` leaves a field as it is, `null` or blank clears it. */
export type IdeaCardText = { title?: string | null; sourceUrl?: string | null; note?: string | null };

/** What goes into the schedule option when a card is used: the same fields an option takes, minus any Master Data brand id. */
export type IdeaOptionText = {
  productName: string;
  brandName?: string | null;
  color?: string | null;
  pattern?: string | null;
  finishing?: string | null;
  dimension?: string | null;
  notes?: string | null;
};

export type IdeaUseTarget =
  | { kind: "new-item"; section: string; category: string; qty?: string | null; unit?: string | null; location?: string | null }
  | { kind: "option"; entryId: string };

type ScheduleWriter = ReturnType<typeof createScheduleService>["writer"];

function text(value: string | null | undefined, max: number, code: string, label: string): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > max) throw invalid(code, `${label} is too long.`);
  return trimmed;
}

/** A source link is kept as text only (never fetched) and must be a web address, so the UI can link it safely. */
export function ideaSourceUrl(value: string | null | undefined): string | null {
  const url = text(value, IDEA_URL_MAX, "IDEA_URL_INVALID", "Link");
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid("IDEA_URL_INVALID", "Use a web link starting with http:// or https://.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw invalid("IDEA_URL_INVALID", "Use a web link starting with http:// or https://.");
  return url;
}

function cardText(input: IdeaCardText) {
  return {
    ...(input.title !== undefined ? { title: text(input.title, IDEA_TITLE_MAX, "IDEA_TITLE_TOO_LONG", "Title") } : {}),
    ...(input.sourceUrl !== undefined ? { source_url: ideaSourceUrl(input.sourceUrl) } : {}),
    ...(input.note !== undefined ? { note: text(input.note, IDEA_NOTE_MAX, "IDEA_NOTE_TOO_LONG", "Note") } : {}),
  };
}

function imageExtension(file: IdeaImageUpload): string {
  const extension = STUDIOFLOW_IMAGE_TYPES[file.contentType];
  if (!extension) throw invalid("IDEA_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
  const bytes = file.body.byteLength;
  if (bytes === 0 || bytes > IDEA_IMAGE_BYTES) throw invalid("IDEA_IMAGE_SIZE", "Images must be smaller than 3 MB.");
  if (!sniffImage(file.body, file.contentType)) throw invalid("IDEA_IMAGE_TYPE", "This file is not a valid image.");
  return extension;
}

/**
 * Personal Ideas board (WO-SF-IDEAS-01, owner 2026-10-08). A card belongs to its user, not to a project: only
 * its owner sees or changes it, with no manager override, and another user's card reads as not found. Using a
 * card in a schedule copies its image into a new project object and creates the row through the schedule's own
 * writer, so the schedule stays the only authority for codes and options; the card keeps a usage row.
 */
export function createIdeaService(db: Db, ports: StudioFlowPorts, schedule: ScheduleWriter) {
  const { runTransaction, storage } = ports;

  async function ownCard(tx: Db | TxClient, ownerId: string, cardId: string) {
    const card = await tx.sfIdeaCard.findUnique({ where: { id: cardId } });
    if (!card || card.owner_user_id !== ownerId) throw notFound("idea card");
    return card;
  }

  async function signedUrl(key: string): Promise<string | null> {
    try {
      return await storage.createSignedReadUrl(key, IDEA_SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  }

  return {
    /** My cards, newest first, each with where it has been used (current project name, code and option label). */
    async listIdeaCards(input: CommandContext) {
      const userId = requireCommand(input, P.access);
      const cards = await db.sfIdeaCard.findMany({
        where: { owner_user_id: userId },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        include: { usages: { orderBy: { created_at: "asc" }, include: { option: { select: { id: true, label: true, entry: { select: { id: true, prefix: true, increment: true, project: { select: { id: true, name: true } } } } } } } } },
      });
      return Promise.all(cards.map(async (card) => ({
        id: card.id,
        title: card.title,
        sourceUrl: card.source_url,
        note: card.note,
        imageUrl: await signedUrl(card.image_key),
        contentType: card.content_type,
        bytes: card.bytes,
        createdAt: card.created_at,
        updatedAt: card.updated_at,
        usages: card.usages.map((usage) => ({
          id: usage.id,
          projectId: usage.option.entry.project.id,
          projectName: usage.option.entry.project.name,
          entryId: usage.option.entry.id,
          code: scheduleCode(usage.option.entry.prefix, usage.option.entry.increment),
          optionId: usage.option.id,
          label: usage.option.label,
          usedAt: usage.created_at,
        })),
      })));
    },

    /**
     * The projects a card can be used in: those whose schedule this user may change today (assigned designer or
     * drafter, or a manager override; not archived, not completed). The same rule is enforced again on use.
     */
    async listIdeaTargets(input: CommandContext) {
      const userId = requireCommand(input, P.access);
      if (!hasPermission(input.grants, P.scheduleManage)) return [];
      const override = hasPermission(input.grants, P.projectOverride);
      const projects = await db.sfProject.findMany({
        where: { archived_at: null, status: { not: "COMPLETED" }, ...(override ? {} : { OR: [{ pic_designer_id: userId }, { pic_drafter_id: userId }] }) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true, pic_designer_id: true, pic_drafter_id: true },
      });
      return projects
        .filter((project) => projectAccessFromFacts({ ...project, phases: [] }, { grants: input.grants, actorId: userId }).canEditDocuments)
        .map((project) => ({ id: project.id, name: project.name }));
    },

    /** A card needs only its image; the text may stay empty forever. The object is written first and discarded if the row fails. */
    async createIdeaCard(input: CommandContext & IdeaCardText & { file: IdeaImageUpload }) {
      const userId = requireCommand(input, P.access);
      const extension = imageExtension(input.file);
      const data = cardText(input);
      const key = createPrivateObjectKey("studioflow/ideas", extension);
      await storage.put({ key, contentType: input.file.contentType, bytes: input.file.body.byteLength, body: input.file.body });
      try {
        return await runTransaction(async (tx) => {
          const card = await tx.sfIdeaCard.create({ data: { owner_user_id: userId, ...data, image_key: key, content_type: input.file.contentType, bytes: input.file.body.byteLength }, select: { id: true } });
          await writeAudit(ports, tx, { action: "studioflow.idea.created", entityType: CARD_ENTITY, entityId: card.id, actor: input.actor, metadata: { bytes: input.file.body.byteLength } });
          return { cardId: card.id };
        });
      } catch (error) {
        await discardObjects(db, storage, [key]);
        throw error;
      }
    },

    async updateIdeaCard(input: CommandContext & IdeaCardText & { cardId: string }) {
      const userId = requireCommand(input, P.access);
      const data = cardText(input);
      return runTransaction(async (tx) => {
        const card = await ownCard(tx, userId, input.cardId);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const [field, value] of Object.entries(data) as Array<[keyof typeof data, string | null]>) {
          if (card[field] !== value) changes[field] = { from: card[field], to: value };
        }
        if (Object.keys(changes).length === 0) return { cardId: card.id };
        await tx.sfIdeaCard.update({ where: { id: card.id }, data });
        await writeAudit(ports, tx, { action: "studioflow.idea.updated", entityType: CARD_ENTITY, entityId: card.id, actor: input.actor, changes });
        return { cardId: card.id };
      });
    },

    /** The replaced object is released after commit; images already copied into schedules are separate objects. */
    async replaceIdeaImage(input: CommandContext & { cardId: string; file: IdeaImageUpload }) {
      const userId = requireCommand(input, P.access);
      const extension = imageExtension(input.file);
      await ownCard(db, userId, input.cardId);
      const key = createPrivateObjectKey("studioflow/ideas", extension);
      await storage.put({ key, contentType: input.file.contentType, bytes: input.file.body.byteLength, body: input.file.body });
      let released: string[];
      try {
        released = await runTransaction(async (tx) => {
          const card = await ownCard(tx, userId, input.cardId);
          await tx.sfIdeaCard.update({ where: { id: card.id }, data: { image_key: key, content_type: input.file.contentType, bytes: input.file.body.byteLength } });
          await writeAudit(ports, tx, { action: "studioflow.idea.image-replaced", entityType: CARD_ENTITY, entityId: card.id, actor: input.actor, metadata: { bytes: input.file.body.byteLength } });
          return enqueueUnreferencedCleanup(tx, [card.image_key]);
        });
      } catch (error) {
        await discardObjects(db, storage, [key]);
        throw error;
      }
      await discardObjects(db, storage, released);
      return { cardId: input.cardId };
    },

    /** Deleting a card never touches a schedule: its usages go with it, the options and their own images stay. */
    async deleteIdeaCard(input: CommandContext & { cardId: string }) {
      const userId = requireCommand(input, P.access);
      const result = await runTransaction(async (tx) => {
        const card = await ownCard(tx, userId, input.cardId);
        const usages = await tx.sfIdeaUsage.count({ where: { card_id: card.id } });
        await tx.sfIdeaCard.delete({ where: { id: card.id } });
        await writeAudit(ports, tx, { action: "studioflow.idea.deleted", entityType: CARD_ENTITY, entityId: card.id, actor: input.actor, metadata: { usages } });
        return { cardId: card.id, keys: await enqueueUnreferencedCleanup(tx, [card.image_key]) };
      });
      await discardObjects(db, storage, result.keys);
      return { cardId: result.cardId };
    },

    /**
     * "Use in schedule": a new schedule item (it gets its code only now) or an extra option on an existing item,
     * never final. The image is copied into a new object under the project; the row is created by the schedule's
     * own writer; the usage row is written in the same transaction. All or nothing.
     */
    async useIdeaInSchedule(input: CommandContext & { cardId: string; projectId: string; target: IdeaUseTarget; option: IdeaOptionText }) {
      const userId = await schedule.requireAccess(input);
      const card = await ownCard(db, userId, input.cardId);
      const extension = STUDIOFLOW_IMAGE_TYPES[card.content_type] ?? "png";
      const key = createPrivateObjectKey(`studioflow/schedule/${input.projectId}`, extension);
      await storage.copy({ fromKey: card.image_key, toKey: key });
      try {
        return await runTransaction(async (tx) => {
          await ownCard(tx, userId, card.id);
          const snapshot: SnapshotInput = { ...input.option, brandId: null, imageKey: key };
          const metadata = { ideaCardId: card.id };
          const created = input.target.kind === "new-item"
            ? await schedule.createEntry(tx, { actor: input.actor, projectId: input.projectId, section: input.target.section, category: input.target.category, qty: input.target.qty, unit: input.target.unit, location: input.target.location, snapshot, metadata })
            : await schedule.createOption(tx, { actor: input.actor, projectId: input.projectId, entryId: input.target.entryId, snapshot, metadata });
          // A new item always carries the snapshot, so its first option exists.
          const optionId = created.optionId!;
          await tx.sfIdeaUsage.create({ data: { card_id: card.id, option_id: optionId } });
          await writeAudit(ports, tx, { action: "studioflow.idea.used", entityType: CARD_ENTITY, entityId: card.id, actor: input.actor, metadata: { projectId: input.projectId, entryId: created.entryId, optionId, code: created.code, label: created.label } });
          return { projectId: input.projectId, entryId: created.entryId, optionId, code: created.code, label: created.label! };
        });
      } catch (error) {
        await discardObjects(db, storage, [key]);
        throw error;
      }
    },
  };
}
