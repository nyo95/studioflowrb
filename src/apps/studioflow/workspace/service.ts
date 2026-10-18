import { randomUUID } from "node:crypto";

import type { AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey } from "@platform/core/storage";

import { WORKSPACE_FILE_BYTES, WORKSPACE_FILE_NAME_MAX, WORKSPACE_FILE_TYPES, fileExtension, sniffWorkspaceFile } from "../domain/files";
import { NOTE_IMAGE_BYTES, STUDIOFLOW_IMAGE_TYPES, sniffImage } from "../domain/images";
import { iterationKinds } from "../domain/iteration-kinds";
import { iterationShortName } from "../domain/phase";
import { orderedScheduleOptions, parseTypedScheduleCode, scheduleCode } from "../domain/schedule";
import {
  P,
  assertProjectWritable,
  conflict,
  invalid,
  notFound,
  nowOf,
  optionalText,
  requireCommand,
  requireProjectAccess,
  requireRead,
  requireWorkSectionAccess,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
  type WorkSectionReadContext,
} from "../shared";
import { discardObjects, enqueueUnreferencedCleanup } from "../asset-cleanup";

/**
 * Project Workspace (WO-SF-WORKSPACE-01, owner 2026-10-12): one Workspace per project. Since WO-SF-WORKSPACE-04 it is
 * one board of standalone elements — text, one image, or one file each — held by the project's DEFAULT section, the
 * only section a project has (R9.07 removed the section commands with the frames). An element's phase and round are
 * labels — where it came from — never where it lives. Former phase notes are elements.
 */

/** One card's text; the old per-iteration notes had the same limit. */
export const PHASE_NOTE_MAX = 4000;
export const WORKSPACE_DEFAULT_SECTION_KEY = "DEFAULT";
/** The holder's stored name; never shown since the board has no frames. */
export const DEFAULT_WORKSPACE_SECTION = "Workspace";
export const WORKSPACE_CANVAS_MAX = 100_000;
export const WORKSPACE_CARD_MIN_WIDTH = 120;

export type NoteImageUpload = { body: Uint8Array; contentType: string };
export type WorkspaceFileUpload = { body: Uint8Array; name: string };
export type WorkspaceCardOrigin = "NOTE" | "CLIENT_ANSWER" | "SITE_VISIT";
export type WorkspaceElementKind = "TEXT" | "IMAGE" | "FILE";
export type WorkspaceTextStyle = "PLAIN" | "HEADING" | "STICKY";
export type WorkspaceThreadSpec = { threadId: string } | { x: number; y: number } | { anchorCardId: string; offsetX: number; offsetY: number };
export const WORKSPACE_TEXT_STYLES: readonly WorkspaceTextStyle[] = ["PLAIN", "HEADING", "STICKY"];
/** Where an image added beside an element lands: to its right, each later one a little lower. */
const BESIDE_GAP = 16;
const BESIDE_STEP = 24;
const BESIDE_WIDTH = 240;

type StoredAsset = { storage_key: string; content_type: string; bytes: number; file_name?: string | null; uploaded_by_id: string | null; uploaded_by_name: string };

const IMAGE_SIGNED_URL_SECONDS = 15 * 60;

function cardNotFound(): AppError {
  return new AppError("NOT_FOUND", "PHASE_NOTE_NOT_FOUND", "This note no longer exists.");
}

function staleCard(): AppError {
  return conflict("WORKSPACE_CARD_STALE", "Someone changed this card in the meantime. Reload to see the latest version.");
}

function notText(): AppError {
  return invalid("WORKSPACE_ELEMENT_NOT_TEXT", "Only a text element has text to change.");
}

function recordLocked(): AppError {
  return conflict("WORKSPACE_RECORD_LOCKED", "This was recorded by a phase step, so whether it is client feedback and its phase stay as recorded.");
}

/** Serialises default-section creation, canvas batches and thread lifecycles for one project. */
async function lockProject(tx: TxClient, projectId: string) {
  await tx.$queryRaw`SELECT id FROM studioflow.sf_project WHERE id = ${projectId} FOR UPDATE`;
}

/** Serialises card order changes inside one section. */
async function lockSection(tx: TxClient, sectionId: string) {
  await tx.$queryRaw`SELECT id FROM studioflow.sf_workspace_section WHERE id = ${sectionId} FOR UPDATE`;
}

/** The project's fixed loose-card destination, created lazily by the system when absent. */
async function defaultSection(tx: TxClient, ports: StudioFlowPorts, projectId: string, createdById: string, actor: AuditActor, at: Date) {
  await lockProject(tx, projectId);
  const existing = await tx.sfWorkspaceSection.findUnique({ where: { project_id_system_key: { project_id: projectId, system_key: WORKSPACE_DEFAULT_SECTION_KEY } }, select: { id: true } });
  if (existing) return existing.id;
  const first = await tx.sfWorkspaceSection.aggregate({ where: { project_id: projectId }, _min: { sort_order: true } });
  const created = await tx.sfWorkspaceSection.create({ data: { id: randomUUID(), project_id: projectId, system_key: WORKSPACE_DEFAULT_SECTION_KEY, title: DEFAULT_WORKSPACE_SECTION, sort_order: first._min.sort_order === null ? 0 : first._min.sort_order - 1, created_by_id: createdById, created_at: at } });
  await writeAudit(ports, tx, { action: "studioflow.workspace-section.created", entityType: "workspace-section", entityId: created.id, actor, metadata: { projectId, isDefault: true, bySystem: true } });
  return created.id;
}

async function nextCardOrder(tx: TxClient, sectionId: string) {
  await lockSection(tx, sectionId);
  const last = await tx.sfWorkspaceCard.aggregate({ where: { section_id: sectionId }, _max: { sort_order: true } });
  return (last._max.sort_order ?? -1) + 1;
}

/**
 * Writes one card inside the caller's transaction. Also used by the answer and visit commands, so what the client said
 * or what was seen on site lands in the project's Workspace in the same transaction; those pass `workflowRecord`, which
 * fixes the element's origin and labels. Without `iterationId`, the phase's latest round labels it.
 */
export async function insertWorkspaceCard(tx: TxClient, ports: StudioFlowPorts, input: { projectId: string; phaseId: string | null; threadId?: string; iterationId?: string | null; body: string; origin: WorkspaceCardOrigin; workflowRecord?: boolean; pinned?: boolean; actor: AuditActor; at: Date; x?: number; y?: number; w?: number; kind?: WorkspaceElementKind; textStyle?: WorkspaceTextStyle; asset?: StoredAsset }) {
  const iterationId = input.iterationId !== undefined
    ? input.iterationId
    : input.phaseId ? (await tx.sfRevision.findFirst({ where: { phase_id: input.phaseId }, orderBy: { major: "desc" }, select: { id: true } }))?.id ?? null : null;
  const sectionId = await defaultSection(tx, ports, input.projectId, input.actor.userId ?? "system", input.actor, input.at);
  const sortOrder = await nextCardOrder(tx, sectionId);
  return tx.sfWorkspaceCard.create({
    data: {
      id: randomUUID(), project_id: input.projectId, section_id: sectionId, sort_order: sortOrder, phase_id: input.phaseId, iteration_id: iterationId,
      body: input.body, origin: input.origin, workflow_record: input.workflowRecord ?? false, is_pinned: input.pinned ?? false, author_id: input.actor.userId ?? null, author_name: input.actor.label, created_at: input.at,
      canvas_x: input.x, canvas_y: input.y, canvas_w: input.w,
      thread_id: input.threadId,
      kind: input.kind ?? "TEXT", text_style: input.textStyle ?? "PLAIN", ...(input.asset ?? {}),
    },
    select: { id: true },
  });
}

type CardRow = {
  thread_id: string | null;
  id: string; project_id: string; section_id: string; phase_id: string | null; iteration_id: string | null; body: string; is_pinned: boolean; origin: WorkspaceCardOrigin; workflow_record: boolean; version: number;
  kind: WorkspaceElementKind; storage_key: string | null; canvas_x: number | null; canvas_y: number | null; canvas_w: number | null;
};
const CARD_ROW_SELECT = { id: true, project_id: true, section_id: true, phase_id: true, iteration_id: true, body: true, is_pinned: true, origin: true, workflow_record: true, version: true, kind: true, storage_key: true, canvas_x: true, canvas_y: true, canvas_w: true, thread_id: true } as const;
type ProjectInput = CommandContext & { projectId: string };
type CardGeometry = { x: number; y: number; w: number };

function canvasInteger(value: number, minimum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > WORKSPACE_CANVAS_MAX) {
    throw invalid("WORKSPACE_CANVAS_INVALID", `${label} must be a whole number from ${minimum} to ${WORKSPACE_CANVAS_MAX}.`);
  }
  return value;
}

function cardGeometry(input: Partial<CardGeometry>): CardGeometry | undefined {
  if (input.x === undefined && input.y === undefined && input.w === undefined) return undefined;
  if (input.x === undefined || input.y === undefined || input.w === undefined) throw invalid("WORKSPACE_CANVAS_INVALID", "Card position and width must be provided together.");
  return {
    x: canvasInteger(input.x, 0, "Card x"),
    y: canvasInteger(input.y, 0, "Card y"),
    w: canvasInteger(input.w, WORKSPACE_CARD_MIN_WIDTH, "Card width"),
  };
}

export function createWorkspaceService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  /** Project-level Workspace writes (unlabelled cards): phase work, the project's document people, an open, active project. */
  async function writableProject(tx: TxClient, input: ProjectInput) {
    const actorId = requireCommand(input, P.phaseWork);
    const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true, archived_at: true, status: true } });
    if (!project) throw notFound("project");
    assertProjectWritable(project);
    if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing its notes.");
    await requireProjectAccess(tx, { grants: input.grants, actorId, projectId: input.projectId, kind: "document" });
    return { actorId };
  }

  /** Writes on a card labelled with a phase follow the phase's own rule, exactly as phase notes did. */
  async function writablePhase(tx: TxClient, input: ProjectInput & { phaseId: string }) {
    requireCommand(input, P.phaseWork);
    const phase = await tx.sfPhase.findUnique({ where: { id: input.phaseId }, include: { project: true } });
    if (!phase || phase.project_id !== input.projectId) throw notFound("phase");
    assertProjectWritable(phase.project);
    if (phase.project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing its notes.");
    await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: phase.id, kind: "transition" });
    return phase;
  }

  /** The gate for one card: its phase label's rule, or the project rule when it has none. */
  async function writableScope(tx: TxClient, input: ProjectInput, phaseId: string | null) {
    if (phaseId) await writablePhase(tx, { ...input, phaseId });
    else await writableProject(tx, input);
  }

  async function loadCard(tx: TxClient, input: ProjectInput & { cardId: string }, phaseId?: string): Promise<CardRow> {
    const card = await tx.sfWorkspaceCard.findFirst({
      where: { id: input.cardId, project_id: input.projectId, ...(phaseId ? { phase_id: phaseId } : {}) },
      select: CARD_ROW_SELECT,
    });
    if (!card) throw cardNotFound();
    return card;
  }

  /** Loads a card and checks the caller may write it and, when given, still holds the version they read. */
  async function writableCard(tx: TxClient, input: ProjectInput & { cardId: string; version?: number }, phaseId?: string) {
    const card = await loadCard(tx, input, phaseId);
    await writableScope(tx, input, card.phase_id);
    if (input.version !== undefined && input.version !== card.version) throw staleCard();
    return card;
  }

  async function audit(tx: TxClient, actor: AuditActor, entity: "workspace-card" | "workspace-section" | "workspace-thread", action: string, entityId: string, metadata: Record<string, unknown>) {
    await writeAudit(ports, tx, { action: `studioflow.${entity}.${action}`, entityType: entity, entityId, actor, metadata });
  }

  type AssetRow = { id: string; kind: WorkspaceElementKind; storage_key: string | null; content_type: string | null; bytes: number | null; file_name: string | null };
  /** A short-lived signed link, never the storage key. A storage hiccup hides one object; it must not fail the page. */
  async function signedUrl(key: string) {
    try {
      return await ports.storage.createSignedReadUrl(key, IMAGE_SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  }
  /** An image element reads as a one-image list (so every image view keeps one shape); text and files have none. */
  async function elementImages(row: AssetRow) {
    if (row.kind !== "IMAGE" || !row.storage_key) return [];
    return [{ id: row.id, url: await signedUrl(row.storage_key), contentType: row.content_type ?? "", bytes: row.bytes ?? 0 }];
  }
  async function elementFile(row: AssetRow) {
    if (row.kind !== "FILE" || !row.storage_key) return null;
    return { url: await signedUrl(row.storage_key), name: row.file_name ?? "File", contentType: row.content_type ?? "", bytes: row.bytes ?? 0 };
  }

  /** A label must belong to the card's project; a round label implies its own phase. */
  async function validatePhaseLabel(tx: TxClient, projectId: string, phaseId: string | null) {
    if (!phaseId) return;
    const phase = await tx.sfPhase.findUnique({ where: { id: phaseId }, select: { project_id: true } });
    if (!phase || phase.project_id !== projectId) throw invalid("WORKSPACE_PHASE_INVALID", "Choose a phase of this project.");
  }

  // ── Elements ──────────────────────────────────────────────────────────

  function textStyleOf(value: string | undefined): WorkspaceTextStyle | undefined {
    if (value === undefined) return undefined;
    if (!WORKSPACE_TEXT_STYLES.includes(value as WorkspaceTextStyle)) throw invalid("WORKSPACE_TEXT_STYLE_INVALID", "Choose plain, heading or sticky.");
    return value as WorkspaceTextStyle;
  }

  /** A text element; it always has text (an image or a file is its own element). */
  type NoteTagInput = string;

  function normaliseTags(tags: readonly NoteTagInput[] | undefined) {
    const unique = new Map<string, string>();
    for (const raw of tags ?? []) {
      const match = /^#?([A-Za-z0-9_-]{1,32})$/.exec(raw.trim());
      if (!match) throw invalid("NOTE_TAG_INVALID", "A topic tag uses 1–32 letters, numbers, hyphens or underscores.");
      const name = match[1];
      const key = name.toLocaleLowerCase("id-ID");
      if (key === "feedback") throw invalid("NOTE_TAG_RESERVED", "#feedback is reserved for client feedback.");
      unique.set(key, name);
    }
    if (unique.size > 5) throw invalid("NOTE_TAG_LIMIT", "Choose at most 5 topic tags.");
    return [...unique].map(([key, name]) => ({ key, name }));
  }

  async function syncTags(tx: TxClient, cardId: string, projectId: string, tags: readonly NoteTagInput[] | undefined) {
    const values = normaliseTags(tags);
    const tagIds: string[] = [];
    for (const tag of values) {
      const row = await tx.sfNoteTag.upsert({ where: { project_id_key: { project_id: projectId, key: tag.key } }, create: { id: randomUUID(), project_id: projectId, name: tag.name, key: tag.key }, update: {}, select: { id: true } });
      tagIds.push(row.id);
    }
    await tx.sfNoteTagLink.deleteMany({ where: { card_id: cardId } });
    if (tagIds.length) await tx.sfNoteTagLink.createMany({ data: tagIds.map((tag_id) => ({ card_id: cardId, tag_id })) });
    await tx.sfNoteTag.deleteMany({ where: { project_id: projectId, links: { none: {} } } });
  }

  async function syncItemLinks(tx: TxClient, cardId: string, projectId: string, entryIds: readonly string[] | undefined) {
    if (entryIds === undefined) return;
    const ids = [...new Set(entryIds)];
    if (ids.length > 10) throw invalid("NOTE_ITEM_LIMIT", "Choose at most 10 schedule items.");
    const entries = ids.length ? await tx.sfScheduleEntry.findMany({ where: { id: { in: ids }, project_id: projectId }, select: { id: true, prefix: true, increment: true } }) : [];
    if (entries.length !== ids.length) throw invalid("NOTE_ITEM_INVALID", "Choose schedule items from this project.");
    await tx.sfNoteItemLink.deleteMany({ where: { card_id: cardId } });
    if (entries.length) await tx.sfNoteItemLink.createMany({ data: entries.map((entry) => ({ card_id: cardId, entry_id: entry.id, code_snapshot: scheduleCode(entry.prefix, entry.increment) })) });
  }

  async function validateReply(tx: TxClient, projectId: string, replyToId: string | undefined, threadId?: string | null) {
    if (!replyToId) return null;
    if (threadId === null) throw invalid("NOTE_REPLY_INVALID", "Reply to a message in this thread.");
    const target = await tx.sfWorkspaceCard.findFirst({ where: { id: replyToId, project_id: projectId, ...(threadId ? { thread_id: threadId } : {}) }, select: { id: true } });
    if (!target) throw invalid("NOTE_REPLY_INVALID", "Reply to a note in this project.");
    return target.id;
  }

  /** Project lock serialises posting, marker movement and explicit deletes, including the first/last message. */
  async function threadForPost(tx: TxClient, input: ProjectInput & { thread: WorkspaceThreadSpec }, create: boolean): Promise<string | null> {
    const spec = input.thread;
    if ("threadId" in spec) {
      const thread = await tx.sfWorkspaceThread.findFirst({ where: { id: spec.threadId, project_id: input.projectId }, select: { id: true } });
      if (!thread) throw notFound("workspace thread");
      return thread.id;
    }
    let anchorCardId: string | null = null;
    let offsetX: number | null = null;
    let offsetY: number | null = null;
    let x: number;
    let y: number;
    if ("anchorCardId" in spec) {
      const anchor = await loadCard(tx, { ...input, cardId: spec.anchorCardId });
      if (anchor.thread_id) throw invalid("WORKSPACE_THREAD_MESSAGE", "A thread message cannot anchor another thread.");
      for (const value of [spec.offsetX, spec.offsetY]) if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) throw invalid("WORKSPACE_CANVAS_INVALID", "Thread offsets must be whole numbers.");
      anchorCardId = anchor.id; offsetX = spec.offsetX; offsetY = spec.offsetY;
      x = (anchor.canvas_x ?? 0) + offsetX; y = (anchor.canvas_y ?? 0) + offsetY;
    } else { x = spec.x; y = spec.y; }
    canvasInteger(x, 0, "Thread x"); canvasInteger(y, 0, "Thread y");
    if (!create) return null;
    const row = await tx.sfWorkspaceThread.create({ data: { project_id: input.projectId, x, y, anchor_card_id: anchorCardId, offset_x: offsetX, offset_y: offsetY, created_by_id: input.actor.userId, created_at: nowOf(ports) } });
    await audit(tx, input.actor, "workspace-thread", "created", row.id, { projectId: input.projectId, anchorCardId, x, y });
    return row.id;
  }

  async function createCard(input: ProjectInput & { phaseId?: string | null; thread?: WorkspaceThreadSpec; body: string | null; origin?: "NOTE" | "CLIENT_ANSWER"; textStyle?: string; x?: number; y?: number; w?: number; replyToId?: string; tags?: readonly NoteTagInput[]; itemEntryIds?: readonly string[] }) {
    if (input.thread && !input.phaseId) throw invalid("WORKSPACE_THREAD_PHASE_REQUIRED", "Choose a phase for this message.");
    const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
    if (!body) throw invalid("PHASE_NOTE_EMPTY", "Write something.");
    const canvas = cardGeometry(input);
    const textStyle = textStyleOf(input.textStyle);
    return runTransaction(async (tx) => {
      if (input.thread) await lockProject(tx, input.projectId);
      const phaseId = input.phaseId ?? null;
      await validatePhaseLabel(tx, input.projectId, phaseId);
      await writableScope(tx, input, phaseId);
      const threadId = input.thread ? await threadForPost(tx, { ...input, thread: input.thread }, true) : undefined;
      const replyToId = await validateReply(tx, input.projectId, input.replyToId, threadId);
      const card = await insertWorkspaceCard(tx, ports, { projectId: input.projectId, phaseId, threadId: threadId ?? undefined, body, origin: input.origin ?? "NOTE", textStyle, actor: input.actor, at: nowOf(ports), ...(input.thread ? {} : canvas) });
      if (replyToId) await tx.sfWorkspaceCard.update({ where: { id: card.id }, data: { reply_to_id: replyToId } });
      await syncTags(tx, card.id, input.projectId, input.tags);
      await syncItemLinks(tx, card.id, input.projectId, input.itemEntryIds);
      await audit(tx, input.actor, "workspace-card", "created", card.id, { projectId: input.projectId, phaseId });
      return { cardId: card.id, ...(threadId ? { threadId } : {}) };
    });
  }

  async function updateCardText(input: ProjectInput & { cardId: string; body: string | null; version?: number; tags?: readonly NoteTagInput[]; itemEntryIds?: readonly string[] }, phaseId?: string) {
    const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
    return runTransaction(async (tx) => {
      const card = await writableCard(tx, input, phaseId);
      if (card.kind !== "TEXT") throw notText();
      if (card.body === body && input.tags === undefined && input.itemEntryIds === undefined) return { cardId: card.id, version: card.version };
      if (!body) throw invalid("PHASE_NOTE_EMPTY", "A note needs text. Delete it instead.");
      const changed = card.body !== body || input.tags !== undefined || input.itemEntryIds !== undefined;
      const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: changed ? { ...(card.body === body ? {} : { body, edited_at: nowOf(ports) }), version: { increment: 1 } } : {} });
      if (updated.count === 0) throw staleCard();
      if (input.tags !== undefined) await syncTags(tx, card.id, input.projectId, input.tags);
      await syncItemLinks(tx, card.id, input.projectId, input.itemEntryIds);
      await audit(tx, input.actor, "workspace-card", "edited", card.id, { projectId: input.projectId, phaseId: card.phase_id });
      return { cardId: card.id, version: changed ? card.version + 1 : card.version };
    });
  }

  async function setTextStyle(input: ProjectInput & { cardId: string; textStyle: string; version?: number }) {
    const textStyle = textStyleOf(input.textStyle)!;
    return runTransaction(async (tx) => {
      const card = await writableCard(tx, input);
      if (card.kind !== "TEXT") throw notText();
      const current = await tx.sfWorkspaceCard.findUniqueOrThrow({ where: { id: card.id }, select: { text_style: true } });
      if (current.text_style === textStyle) return { cardId: card.id, version: card.version };
      const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { text_style: textStyle, version: { increment: 1 } } });
      if (updated.count === 0) throw staleCard();
      await audit(tx, input.actor, "workspace-card", "style-changed", card.id, { projectId: input.projectId, textStyle });
      return { cardId: card.id, version: card.version + 1 };
    });
  }

  /**
   * Pin a card, or mark it as what the client said. A site-visit card keeps its origin unless switched to a client
   * answer; what a phase step recorded keeps its origin.
   */
  async function setCardFlags(input: ProjectInput & { cardId: string; pinned?: boolean; clientAnswer?: boolean; version?: number }, phaseId?: string) {
    return runTransaction(async (tx) => {
      const card = await writableCard(tx, input, phaseId);
      const data: { is_pinned?: boolean; origin?: WorkspaceCardOrigin } = {};
      if (input.pinned !== undefined && input.pinned !== card.is_pinned) data.is_pinned = input.pinned;
      if (input.clientAnswer === true && card.origin !== "CLIENT_ANSWER") data.origin = "CLIENT_ANSWER";
      if (input.clientAnswer === false && card.origin === "CLIENT_ANSWER") data.origin = "NOTE";
      if (data.origin && card.workflow_record) throw recordLocked();
      if (Object.keys(data).length === 0) return { cardId: card.id, version: card.version };
      const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count === 0) throw staleCard();
      await audit(tx, input.actor, "workspace-card", "flags-changed", card.id, { projectId: input.projectId, ...data });
      return { cardId: card.id, version: card.version + 1 };
    });
  }

  async function deleteCard(input: ProjectInput & { cardId: string; version?: number }, phaseId?: string) {
    const result = await runTransaction(async (tx) => {
      await lockProject(tx, input.projectId);
      const card = await writableCard(tx, input, phaseId);
      const keys = card.storage_key ? [card.storage_key] : [];
      // Keep message labels stable from permission checks through the explicit cascade.
      await tx.$queryRaw`SELECT c.id FROM studioflow.sf_workspace_card c
        JOIN studioflow.sf_workspace_thread t ON t.id = c.thread_id
        WHERE t.anchor_card_id = ${card.id} ORDER BY c.id FOR UPDATE OF c`;
      const anchored = await tx.sfWorkspaceThread.findMany({ where: { anchor_card_id: card.id, project_id: input.projectId }, include: { messages: { select: CARD_ROW_SELECT } } });
      const labels = new Set(anchored.flatMap((thread) => thread.messages.map((message) => message.phase_id)));
      for (const label of labels) {
        try { await writableScope(tx, input, label); }
        catch (error) {
          if (error instanceof AppError) throw conflict("WORKSPACE_THREAD_LOCKED", "You cannot delete this element because some attached messages are outside your write access.");
          throw error;
        }
      }
      for (const thread of anchored) {
        for (const message of thread.messages) {
          if (message.storage_key) keys.push(message.storage_key);
          await tx.sfWorkspaceCard.delete({ where: { id: message.id } });
          await audit(tx, input.actor, "workspace-card", "deleted", message.id, { projectId: input.projectId, phaseId: message.phase_id, kind: message.kind, threadId: thread.id });
        }
        await tx.sfWorkspaceThread.delete({ where: { id: thread.id } });
        await audit(tx, input.actor, "workspace-thread", "deleted", thread.id, { projectId: input.projectId, messageCount: thread.messages.length, anchorCardId: card.id });
      }
      const deleted = await tx.sfWorkspaceCard.deleteMany({ where: { id: card.id, version: card.version } });
      if (deleted.count === 0) throw staleCard();
      await audit(tx, input.actor, "workspace-card", "deleted", card.id, { projectId: input.projectId, phaseId: card.phase_id, kind: card.kind });
      if (card.thread_id && await tx.sfWorkspaceCard.count({ where: { thread_id: card.thread_id } }) === 0) {
        await tx.sfWorkspaceThread.delete({ where: { id: card.thread_id } });
        await audit(tx, input.actor, "workspace-thread", "deleted", card.thread_id, { projectId: input.projectId, messageCount: 1 });
      }
      return { cardId: card.id, keys: await enqueueUnreferencedCleanup(tx, keys) };
    });
    await discardObjects(db, ports.storage, result.keys);
    return { cardId: result.cardId };
  }

  function checkedImage(file: NoteImageUpload) {
    const extension = STUDIOFLOW_IMAGE_TYPES[file.contentType];
    if (!extension) throw invalid("NOTE_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
    const bytes = file.body.byteLength;
    if (bytes === 0 || bytes > NOTE_IMAGE_BYTES) throw invalid("NOTE_IMAGE_SIZE", "Each image must be smaller than 3 MB.");
    if (!sniffImage(file.body, file.contentType)) throw invalid("NOTE_IMAGE_TYPE", "This file is not a valid image.");
    return { extension, bytes };
  }

  function checkedFile(file: WorkspaceFileUpload) {
    const name = requiredText(file.name, "WORKSPACE_FILE_NAME_REQUIRED", "File name", WORKSPACE_FILE_NAME_MAX);
    const extension = fileExtension(name);
    const rule = extension ? WORKSPACE_FILE_TYPES[extension] : undefined;
    if (!extension || !rule) throw invalid("WORKSPACE_FILE_TYPE", "Use a PDF, DWG, DXF, SKP, Excel, Word, PowerPoint, ZIP, TXT or CSV file.");
    const bytes = file.body.byteLength;
    if (bytes === 0 || bytes > WORKSPACE_FILE_BYTES) throw invalid("WORKSPACE_FILE_SIZE", "Each file must be smaller than 25 MB.");
    if (!sniffWorkspaceFile(file.body, extension)) throw invalid("WORKSPACE_FILE_TYPE", "This file does not match its type.");
    return { name, extension, bytes, contentType: rule.contentType };
  }

  /** Writes the object first, then the rows; the object is discarded when the transaction fails. */
  async function storeThen<T>(key: string, upload: { contentType: string; bytes: number; body: Uint8Array }, write: () => Promise<T>): Promise<T> {
    await ports.storage.put({ key, contentType: upload.contentType, bytes: upload.bytes, body: upload.body });
    try {
      return await write();
    } catch (error) {
      await discardObjects(db, ports.storage, [key]);
      throw error;
    }
  }

  type NewElementInput = ProjectInput & { phaseId?: string | null; clientAnswer?: boolean; x?: number; y?: number; w?: number; replyToId?: string; tags?: readonly NoteTagInput[] };
  /** The labels and place a new image element gets. */
  type ElementLabels = { phaseId: string | null; iterationId?: string | null; origin: WorkspaceCardOrigin; workflowRecord?: boolean; place?: CardGeometry };

  /**
   * An image added beside an element (pasted while writing it) takes that element's labels and lands to its right,
   * each later one a little lower, so it reads as part of that text.
   */
  async function besideLabels(tx: TxClient, input: ProjectInput & { besideId: string }): Promise<ElementLabels> {
    // Serialise adds beside one element so each lands one step lower than the last.
    await tx.$queryRaw`SELECT id FROM studioflow.sf_workspace_card WHERE id = ${input.besideId} FOR UPDATE`;
    const anchor = await loadCard(tx, { ...input, cardId: input.besideId });
    let place: CardGeometry | undefined;
    if (anchor.canvas_x !== null && anchor.canvas_y !== null) {
      const x = Math.min(WORKSPACE_CANVAS_MAX, anchor.canvas_x + (anchor.canvas_w ?? 256) + BESIDE_GAP);
      const beside = await tx.sfWorkspaceCard.count({ where: { project_id: anchor.project_id, canvas_x: x, canvas_y: { gte: anchor.canvas_y, lt: anchor.canvas_y + BESIDE_STEP * 100 } } });
      place = { x, y: Math.min(WORKSPACE_CANVAS_MAX, anchor.canvas_y + beside * BESIDE_STEP), w: BESIDE_WIDTH };
    }
    return { phaseId: anchor.phase_id, iterationId: anchor.iteration_id, origin: anchor.origin, workflowRecord: anchor.workflow_record, place };
  }

  /**
   * One image element, in one step: the image is its content. `labels` resolves its labels and place inside the write
   * transaction (beside another element, or a phase step's record); otherwise the caller's phase label and place.
   */
  async function createImage(input: NewElementInput & { file: NoteImageUpload; thread?: WorkspaceThreadSpec }, labels?: (tx: TxClient) => Promise<ElementLabels>) {
    if (input.thread && !input.phaseId) throw invalid("WORKSPACE_THREAD_PHASE_REQUIRED", "Choose a phase for this message.");
    requireCommand(input, P.phaseWork);
    const { extension, bytes } = checkedImage(input.file);
    const canvas = cardGeometry(input);
    const resolve = labels ?? (async (tx: TxClient): Promise<ElementLabels> => {
      await validatePhaseLabel(tx, input.projectId, input.phaseId ?? null);
      return { phaseId: input.phaseId ?? null, origin: input.clientAnswer ? "CLIENT_ANSWER" : "NOTE", place: canvas };
    });
    // Scope and access are checked before touching storage, then again inside the write transaction.
    await runTransaction(async (tx) => {
      if (input.thread) await lockProject(tx, input.projectId);
      await writableScope(tx, input, (await resolve(tx)).phaseId);
      if (input.thread) {
        const threadId = await threadForPost(tx, { ...input, thread: input.thread }, false);
        await validateReply(tx, input.projectId, input.replyToId, threadId);
      }
    });
    const key = createPrivateObjectKey(`studioflow/notes/${input.projectId}`, extension);
    return storeThen(key, { contentType: input.file.contentType, bytes, body: input.file.body }, () => runTransaction(async (tx) => {
      if (input.thread) await lockProject(tx, input.projectId);
      const resolved = await resolve(tx);
      await writableScope(tx, input, resolved.phaseId);
      const threadId = input.thread ? await threadForPost(tx, { ...input, thread: input.thread }, true) : undefined;
      const element = await insertWorkspaceCard(tx, ports, {
        projectId: input.projectId, phaseId: resolved.phaseId, threadId: threadId ?? undefined, iterationId: resolved.iterationId, body: "", origin: resolved.origin, workflowRecord: resolved.workflowRecord,
        actor: input.actor, at: nowOf(ports), ...(input.thread ? {} : resolved.place),
        kind: "IMAGE", asset: { storage_key: key, content_type: input.file.contentType, bytes, uploaded_by_id: input.actor.userId ?? null, uploaded_by_name: input.actor.label },
      });
      const replyToId = await validateReply(tx, input.projectId, input.replyToId, threadId);
      if (replyToId) await tx.sfWorkspaceCard.update({ where: { id: element.id }, data: { reply_to_id: replyToId } });
      await syncTags(tx, element.id, input.projectId, input.tags);
      await audit(tx, input.actor, "workspace-card", "created", element.id, { projectId: input.projectId, phaseId: resolved.phaseId, kind: "IMAGE", bytes });
      return { cardId: element.id, ...(threadId ? { threadId } : {}) };
    }));
  }

  /** One file element (PDF, drawings, office files, archives, text), in one step. */
  async function createFile(input: NewElementInput & { file: WorkspaceFileUpload }) {
    requireCommand(input, P.phaseWork);
    const file = checkedFile(input.file);
    const canvas = cardGeometry(input);
    const phaseId = input.phaseId ?? null;
    await runTransaction(async (tx) => { await validatePhaseLabel(tx, input.projectId, phaseId); await writableScope(tx, input, phaseId); });
    const key = createPrivateObjectKey(`studioflow/workspace-files/${input.projectId}`, file.extension);
    return storeThen(key, { contentType: file.contentType, bytes: file.bytes, body: input.file.body }, () => runTransaction(async (tx) => {
      await writableScope(tx, input, phaseId);
      const element = await insertWorkspaceCard(tx, ports, {
        projectId: input.projectId, phaseId, body: "", origin: input.clientAnswer ? "CLIENT_ANSWER" : "NOTE", actor: input.actor, at: nowOf(ports), ...canvas,
        kind: "FILE", asset: { storage_key: key, content_type: file.contentType, bytes: file.bytes, file_name: file.name, uploaded_by_id: input.actor.userId ?? null, uploaded_by_name: input.actor.label },
      });
      const replyToId = await validateReply(tx, input.projectId, input.replyToId);
      if (replyToId) await tx.sfWorkspaceCard.update({ where: { id: element.id }, data: { reply_to_id: replyToId } });
      await syncTags(tx, element.id, input.projectId, input.tags);
      await audit(tx, input.actor, "workspace-card", "created", element.id, { projectId: input.projectId, phaseId, kind: "FILE", bytes: file.bytes });
      return { cardId: element.id };
    }));
  }

  type ThreadPostInput = ProjectInput & { thread: WorkspaceThreadSpec; phaseId: string; clientFeedback?: boolean; replyToId?: string; tags?: readonly NoteTagInput[] };
  const threads = {
    async postThreadMessage(input: ThreadPostInput & { body: string | null; itemEntryIds?: readonly string[] }) {
      const result = await createCard({ ...input, origin: input.clientFeedback ? "CLIENT_ANSWER" : "NOTE" });
      return { threadId: result.threadId!, noteId: result.cardId };
    },
    async postThreadImage(input: ThreadPostInput & { file: NoteImageUpload }) {
      const result = await createImage({ ...input, clientAnswer: input.clientFeedback });
      return { threadId: result.threadId!, imageId: result.cardId };
    },
    async moveThread(input: ProjectInput & { threadId: string; version: number; x: number; y: number }) {
      const x = canvasInteger(input.x, 0, "Thread x");
      const y = canvasInteger(input.y, 0, "Thread y");
      return runTransaction(async (tx) => {
        await lockProject(tx, input.projectId);
        await writableProject(tx, input);
        const thread = await tx.sfWorkspaceThread.findFirst({ where: { id: input.threadId, project_id: input.projectId } });
        if (!thread) throw notFound("workspace thread");
        if (thread.anchor_card_id) throw conflict("WORKSPACE_THREAD_ANCHORED", "An attached marker moves with its element.");
        if (thread.version !== input.version) throw conflict("WORKSPACE_THREAD_STALE", "This thread moved in the meantime. Reload its latest position.");
        const moved = await tx.sfWorkspaceThread.updateMany({ where: { id: thread.id, version: input.version }, data: { x, y, version: { increment: 1 } } });
        if (!moved.count) throw conflict("WORKSPACE_THREAD_STALE", "This thread moved in the meantime. Reload its latest position.");
        await audit(tx, input.actor, "workspace-thread", "moved", thread.id, { projectId: input.projectId, x, y });
        return { threadId: thread.id, version: thread.version + 1 };
      });
    },
  };

  const cards = {
    createWorkspaceCard: (input: ProjectInput & { phaseId?: string | null; body: string | null; clientAnswer?: boolean; textStyle?: string; x?: number; y?: number; w?: number; replyToId?: string; tags?: readonly NoteTagInput[]; itemEntryIds?: readonly string[] }) =>
      createCard({ ...input, origin: input.clientAnswer ? "CLIENT_ANSWER" : "NOTE" }),
    updateWorkspaceCardText: (input: ProjectInput & { cardId: string; body: string | null; version: number; tags?: readonly NoteTagInput[]; itemEntryIds?: readonly string[] }) => updateCardText(input),
    async setNoteTags(input: ProjectInput & { cardId: string; tags: readonly NoteTagInput[]; version: number }) {
      return runTransaction(async (tx) => {
        const card = await writableCard(tx, input);
        await syncTags(tx, card.id, input.projectId, input.tags);
        const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { version: { increment: 1 } } });
        if (!updated.count) throw staleCard();
        await audit(tx, input.actor, "workspace-card", "tags-changed", card.id, { projectId: input.projectId });
        return { cardId: card.id, version: card.version + 1 };
      });
    },
    setWorkspaceCardFlags: (input: ProjectInput & { cardId: string; pinned?: boolean; clientAnswer?: boolean; version: number }) => setCardFlags(input),
    deleteWorkspaceCard: (input: ProjectInput & { cardId: string; version: number }) => deleteCard(input),
    setWorkspaceTextStyle: (input: ProjectInput & { cardId: string; textStyle: string; version: number }) => setTextStyle(input),
    /** An image element; with `besideId` it lands beside that element with its labels (pasted while writing it). */
    createWorkspaceImage: (input: NewElementInput & { file: NoteImageUpload; besideId?: string }) =>
      createImage(input, input.besideId ? (tx) => besideLabels(tx, { ...input, besideId: input.besideId! }) : undefined),
    createWorkspaceFile: (input: NewElementInput & { file: WorkspaceFileUpload }) => createFile(input),

    /** Sets or clears a card's phase label. Clearing it, or moving to another phase, also clears the round label. */
    async setWorkspaceCardPhase(input: ProjectInput & { cardId: string; phaseId: string | null; version: number }) {
      return runTransaction(async (tx) => {
        const card = await writableCard(tx, input);
        if (card.phase_id === input.phaseId) return { cardId: card.id, version: card.version };
        if (card.workflow_record) throw recordLocked();
        await validatePhaseLabel(tx, input.projectId, input.phaseId);
        // Labelling needs the write right for both the old and the new label.
        await writableScope(tx, input, input.phaseId);
        const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { phase_id: input.phaseId, iteration_id: null, version: { increment: 1 } } });
        if (updated.count === 0) throw staleCard();
        await audit(tx, input.actor, "workspace-card", "phase-label-changed", card.id, { projectId: input.projectId, fromPhaseId: card.phase_id, toPhaseId: input.phaseId });
        return { cardId: card.id, version: card.version + 1 };
      });
    },

    /** Persists one canvas gesture batch. Geometry is last-write-wins and deliberately never changes content versions. */
    async placeWorkspaceItems(input: ProjectInput & { cards: Array<{ id: string } & CardGeometry> }) {
      if (input.cards.length > 500) throw invalid("WORKSPACE_CANVAS_LIMIT", "Place at most 500 elements at once.");
      for (const item of input.cards) cardGeometry(item);
      // Repeated ids are intentional for buffered pointer updates: the last value in the batch wins.
      const cardsById = new Map(input.cards.map((item) => [item.id, item]));

      return runTransaction(async (tx) => {
        requireCommand(input, P.phaseWork);
        // Serialise canvas batches for one project, so the stored order below follows the last batch.
        await lockProject(tx, input.projectId);
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true, archived_at: true, status: true } });
        if (!project) throw notFound("project");
        assertProjectWritable(project);
        if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing its notes.");

        const cardRows = await tx.sfWorkspaceCard.findMany({ where: { id: { in: [...cardsById.keys()] }, project_id: input.projectId }, select: { id: true, phase_id: true, thread_id: true } });
        if (cardRows.length !== cardsById.size) throw cardNotFound();
        if (cardRows.some((card) => card.thread_id)) throw invalid("WORKSPACE_THREAD_MESSAGE", "Thread messages cannot be placed on the board.");
        for (const card of cardRows) await writableScope(tx, input, card.phase_id);
        for (const card of cardRows) {
          const item = cardsById.get(card.id)!;
          await tx.sfWorkspaceCard.update({ where: { id: card.id }, data: { canvas_x: item.x, canvas_y: item.y, canvas_w: item.w } });
        }

        // The stored order follows the board top to bottom, for the phone's reading order.
        const rows = await tx.sfWorkspaceCard.findMany({ where: { project_id: input.projectId, thread_id: null }, select: { id: true, canvas_x: true, canvas_y: true, created_at: true, sort_order: true } });
        rows.sort((a, b) => {
          const aPlaced = a.canvas_x !== null && a.canvas_y !== null;
          const bPlaced = b.canvas_x !== null && b.canvas_y !== null;
          if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
          if (!aPlaced || !bPlaced) return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
          return a.canvas_y! - b.canvas_y! || a.canvas_x! - b.canvas_x! || a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id);
        });
        for (const [sortOrder, row] of rows.entries()) if (row.sort_order !== sortOrder) await tx.sfWorkspaceCard.update({ where: { id: row.id }, data: { sort_order: sortOrder } });
        return { ok: true as const };
      });
    },
  };

  // ── Reads ─────────────────────────────────────────────────────────────

  type CardReadRow = {
    thread_id: string | null;
    anchored_threads?: Array<{ _count: { messages: number } }>;
    id: string; body: string; is_pinned: boolean; origin: WorkspaceCardOrigin; workflow_record: boolean; author_id: string | null; author_name: string | null; created_at: Date; edited_at: Date | null; version: number;
    sort_order: number; phase_id: string | null; iteration_id: string | null; canvas_x: number | null; canvas_y: number | null; canvas_w: number | null;
    kind: WorkspaceElementKind; text_style: WorkspaceTextStyle; storage_key: string | null; content_type: string | null; bytes: number | null; file_name: string | null;
    iteration: { id: string; major: number; name: string } | null;
    phase: { id: string; name_snapshot: string; prefix_snapshot: string; iteration_kinds_snapshot: unknown } | null;
    reply_to?: { id: string; kind: WorkspaceElementKind; body: string; file_name: string | null; author_name: string | null; origin: WorkspaceCardOrigin } | null;
    note_tag_links?: Array<{ tag: { name: string } }>;
    note_item_links?: Array<{ code_snapshot: string; entry: { id: string; prefix: string; increment: number; section: string; location: string | null; active_index: number; options: Array<{ label: string; created_at: Date; is_final: boolean; product_name: string; image_key: string | null }> } }>;
  };
  const CARD_INCLUDE = {
    anchored_threads: { select: { _count: { select: { messages: true } } } },
    iteration: { select: { id: true, major: true, name: true } },
    phase: { select: { id: true, name_snapshot: true, prefix_snapshot: true, iteration_kinds_snapshot: true } },
    reply_to: { select: { id: true, kind: true, body: true, file_name: true, author_name: true, origin: true } },
    note_tag_links: { include: { tag: { select: { name: true } } } },
    note_item_links: { include: { entry: { select: { id: true, prefix: true, increment: true, section: true, location: true, active_index: true, options: { select: { label: true, created_at: true, is_final: true, product_name: true, image_key: true } } } } } },
  } as const;

  function roundLabel(row: Pick<CardReadRow, "iteration" | "phase">) {
    if (!row.iteration || !row.phase) return null;
    const kinds = iterationKinds(row.phase.iteration_kinds_snapshot);
    return iterationShortName(row.iteration.name, row.phase.prefix_snapshot, row.iteration, kinds.includes(row.iteration.name));
  }

  async function cardView(row: CardReadRow) {
    return {
      id: row.id,
      threadId: row.thread_id,
      anchoredThreadMessages: (row.anchored_threads ?? []).reduce((sum, thread) => sum + thread._count.messages, 0),
      sortOrder: row.sort_order,
      version: row.version,
      body: row.body,
      pinned: row.is_pinned,
      origin: row.origin,
      /** Recorded by a phase step: its origin and phase/round labels cannot change. */
      workflowRecord: row.workflow_record,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      phaseId: row.phase_id,
      phaseName: row.phase?.name_snapshot ?? null,
      iterationId: row.iteration_id,
      iterationLabel: roundLabel(row),
      canvas: row.canvas_x === null || row.canvas_y === null || row.canvas_w === null ? null : { x: row.canvas_x, y: row.canvas_y, w: row.canvas_w },
      kind: row.kind,
      textStyle: row.text_style,
      images: await elementImages(row),
      file: await elementFile(row),
      replyTo: row.reply_to ? { id: row.reply_to.id, kind: row.reply_to.kind, excerpt: row.reply_to.kind === "FILE" ? row.reply_to.file_name ?? "" : row.reply_to.kind === "IMAGE" ? "" : row.reply_to.body.slice(0, 120), authorName: row.reply_to.author_name, clientFeedback: row.reply_to.origin === "CLIENT_ANSWER" } : null,
      tags: row.note_tag_links?.map((link) => link.tag.name) ?? [],
      items: await Promise.all((row.note_item_links ?? []).map(async (link) => {
        const options = orderedScheduleOptions(link.entry.options);
        const shown = options.find((option) => option.is_final) ?? options[link.entry.active_index];
        return { entryId: link.entry.id, code: scheduleCode(link.entry.prefix, link.entry.increment) || link.code_snapshot, section: link.entry.section, name: shown?.product_name ?? null, location: link.entry.location, codeSnapshot: link.code_snapshot, thumbnailUrl: shown?.image_key ? await signedUrl(shown.image_key) : null };
      })),
    };
  }

  const reads = {
    /** The project's board: every element in stored order (top to bottom); optionally only those labelled with one phase. */
    async readWorkspace(input: WorkSectionReadContext & { projectId: string; phaseId?: string | null }) {
      requireRead(input.grants);
      await requireWorkSectionAccess(db, input);
      const rows = await db.sfWorkspaceCard.findMany({
        where: { project_id: input.projectId, thread_id: null, ...(input.phaseId ? { phase_id: input.phaseId } : {}) },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        include: CARD_INCLUDE,
      });
      return Promise.all(rows.map((row) => cardView(row as CardReadRow)));
    },

    /** The project's phases as label choices. */
    async listWorkspacePhaseLabels(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      return (await db.sfPhase.findMany({ where: { project_id: input.projectId }, orderBy: { order_index: "asc" }, select: { id: true, name_snapshot: true } }))
        .map((phase) => ({ id: phase.id, name: phase.name_snapshot }));
    },

    async listWorkspaceThreads(input: WorkSectionReadContext & { projectId: string }) {
      requireRead(input.grants);
      await requireWorkSectionAccess(db, input);
      const rows = await db.sfWorkspaceThread.findMany({ where: { project_id: input.projectId }, orderBy: [{ created_at: "asc" }, { id: "asc" }], include: { messages: { select: { origin: true, created_at: true }, orderBy: [{ created_at: "desc" }, { id: "desc" }] } } });
      return rows.map((row) => ({ id: row.id, version: row.version, x: row.x, y: row.y, anchorCardId: row.anchor_card_id, offsetX: row.offset_x, offsetY: row.offset_y, messageCount: row.messages.length, clientFeedback: row.messages.some((message) => message.origin === "CLIENT_ANSWER"), lastMessageAt: row.messages[0]?.created_at ?? null }));
    },

    async listProjectNotes(input: WorkSectionReadContext & { projectId: string; threadId?: string; inThreads?: true; phaseId?: string; clientFeedback?: boolean; starred?: boolean; tag?: string; entryId?: string; cursor?: string; limit?: number }) {
      requireRead(input.grants);
      await requireWorkSectionAccess(db, input);
      const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
      const cursor = input.cursor ? (() => { try { return JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as { createdAt: string; id: string }; } catch { throw invalid("NOTE_CURSOR_INVALID", "The notes cursor is invalid."); } })() : null;
      const rows = await db.sfWorkspaceCard.findMany({
        where: { project_id: input.projectId, ...(input.threadId ? { thread_id: input.threadId } : input.inThreads ? { thread_id: { not: null } } : {}), ...(input.phaseId ? { phase_id: input.phaseId } : {}), ...(input.clientFeedback === undefined ? {} : { origin: input.clientFeedback ? "CLIENT_ANSWER" : { not: "CLIENT_ANSWER" } }), ...(input.starred === undefined ? {} : { is_pinned: input.starred }), ...(input.tag ? { note_tag_links: { some: { tag: { key: input.tag.replace(/^#/, "").toLocaleLowerCase("id-ID") } } } } : {}), ...(input.entryId ? { note_item_links: { some: { entry_id: input.entryId } } } : {}), ...(cursor ? { OR: [{ created_at: { lt: new Date(cursor.createdAt) } }, { created_at: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ created_at: "desc" }, { id: "desc" }], take: limit + 1, include: CARD_INCLUDE,
      });
      const page = rows.slice(0, limit);
      const next = rows.length > limit && page.length ? Buffer.from(JSON.stringify({ createdAt: page[page.length - 1].created_at.toISOString(), id: page[page.length - 1].id })).toString("base64url") : null;
      return { notes: await Promise.all(page.map((row) => cardView(row as CardReadRow))), cursor: next };
    },

    async searchNoteItems(input: ReadContext & { projectId: string; query: string }) {
      requireRead(input.grants);
      const raw = input.query.trim().replace(/^@/, "").trim();
      const normalized = raw.replace(/[\s-]/g, "").toUpperCase();
      const partial = /^([A-Z]+)(\d*)$/.exec(normalized);
      const digits = partial?.[2].replace(/^0+/, "") ?? "";
      const exact = parseTypedScheduleCode(normalized);
      const rows = await db.sfScheduleEntry.findMany({ where: { project_id: input.projectId }, orderBy: [{ section: "asc" }, { sort_order: "asc" }, { id: "asc" }], include: { options: { select: { label: true, created_at: true, is_final: true, product_name: true, image_key: true } } } });
      const matched = rows.filter((entry) => !raw
        || (partial && entry.prefix.toUpperCase().startsWith(partial[1]) && String(entry.increment).startsWith(digits))
        || entry.options.some((option) => option.product_name.toLowerCase().includes(raw.toLowerCase())));
      const isExact = (entry: typeof rows[number]) => exact && entry.prefix.toUpperCase() === exact.prefix && entry.increment === exact.increment ? 1 : 0;
      matched.sort((a, b) => isExact(b) - isExact(a)); // Stable: ties keep Schedule order.
      return Promise.all(matched.slice(0, 10).map(async (entry) => {
        const options = orderedScheduleOptions(entry.options);
        const shown = options.find((option) => option.is_final) ?? options[entry.active_index];
        return { entryId: entry.id, code: scheduleCode(entry.prefix, entry.increment), section: entry.section, name: shown?.product_name ?? null, location: entry.location, thumbnailUrl: shown?.image_key ? await signedUrl(shown.image_key) : null };
      }));
    },

    async listNoteTags(input: WorkSectionReadContext & { projectId: string; query?: string }) {
      requireRead(input.grants);
      await requireWorkSectionAccess(db, input);
      const tags = await db.sfNoteTag.findMany({ where: { project_id: input.projectId, ...(input.query ? { key: { contains: input.query.replace(/^#/, "").toLocaleLowerCase("id-ID"), mode: "insensitive" } } : {}) }, include: { _count: { select: { links: true } } } });
      return tags.sort((a, b) => b._count.links - a._count.links || a.name.localeCompare(b.name)).slice(0, 20).map((tag) => ({ name: tag.name, count: tag._count.links }));
    },

    async listNotesForItem(input: WorkSectionReadContext & { projectId: string; entryId: string }) {
      return (await reads.listProjectNotes({ ...input, entryId: input.entryId, limit: 100 })).notes;
    },
  };

  // ── The phase notes feed (today's notes screen keeps working on cards labelled with the phase) ─────────────

  type NoteInput = CommandContext & { projectId: string; phaseId: string };

  /**
   * What the client-answer dialog adds after the answer was recorded (more text, screenshots) belongs to that answer:
   * labelled with the answered iteration and kept as the step's record.
   */
  async function answerLabels(tx: TxClient, input: NoteInput & { answeredIterationId: string }): Promise<ElementLabels> {
    const iteration = await tx.sfRevision.findFirst({ where: { id: input.answeredIterationId, phase_id: input.phaseId }, select: { id: true, answered_at: true } });
    if (!iteration) throw notFound("iteration");
    if (!iteration.answered_at) throw conflict("ITERATION_NOT_ANSWERED", "Record the client's answer first.");
    return { phaseId: input.phaseId, iterationId: iteration.id, origin: "CLIENT_ANSWER", workflowRecord: true };
  }

  const phaseNotes = {
    /**
     * Posts a message labelled with the phase (and its latest round). With `answeredIterationId` it is part of that
     * iteration's recorded client answer instead.
     */
    async postPhaseNote(input: NoteInput & { body: string | null; clientFeedback?: boolean; answeredIterationId?: string; replyToId?: string; tags?: readonly NoteTagInput[]; itemEntryIds?: readonly string[] }) {
      const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
      if (!body) throw invalid("PHASE_NOTE_EMPTY", "Write something.");
      return runTransaction(async (tx) => {
        const phase = await writablePhase(tx, input);
        const answer = input.answeredIterationId ? await answerLabels(tx, { ...input, answeredIterationId: input.answeredIterationId }) : null;
        const card = await insertWorkspaceCard(tx, ports, {
          projectId: phase.project_id, phaseId: phase.id, ...(answer ? { iterationId: answer.iterationId, workflowRecord: true } : {}),
          body, origin: answer || input.clientFeedback ? "CLIENT_ANSWER" : "NOTE", actor: input.actor, at: nowOf(ports),
        });
        const replyToId = await validateReply(tx, phase.project_id, input.replyToId);
        if (replyToId) await tx.sfWorkspaceCard.update({ where: { id: card.id }, data: { reply_to_id: replyToId } });
        await syncTags(tx, card.id, phase.project_id, input.tags);
        await syncItemLinks(tx, card.id, phase.project_id, input.itemEntryIds);
        await audit(tx, input.actor, "workspace-card", "created", card.id, { projectId: phase.project_id, phaseId: phase.id });
        return { noteId: card.id };
      });
    },
    /** One image posted to a phase's notes as its own element; with `answeredIterationId`, part of that recorded answer. */
    async postPhaseImage(input: NoteInput & { file: NoteImageUpload; clientFeedback?: boolean; answeredIterationId?: string; replyToId?: string; tags?: readonly NoteTagInput[] }) {
      const answeredIterationId = input.answeredIterationId;
      const result = await createImage(
        { ...input, clientAnswer: input.clientFeedback },
        async (tx) => answeredIterationId ? answerLabels(tx, { ...input, answeredIterationId }) : { phaseId: input.phaseId, origin: input.clientFeedback ? "CLIENT_ANSWER" : "NOTE" },
      );
      return { imageId: result.cardId };
    },
    async setPhaseNoteTags(input: NoteInput & { noteId: string; tags: readonly NoteTagInput[]; version: number }) {
      return { noteId: (await cards.setNoteTags({ ...input, cardId: input.noteId, tags: input.tags, version: input.version })).cardId };
    },

    /** Every phase's pinned cards, for the project card's pinned-notes dialog. Text only; images open on the phase page. */
    async listStarredPhaseNotes(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const phases = await db.sfPhase.findMany({
        where: { project_id: input.projectId },
        orderBy: { order_index: "asc" },
        select: {
          id: true, name_snapshot: true, prefix_snapshot: true,
          iteration_kinds_snapshot: true,
          workspace_cards: { where: { is_pinned: true }, orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { id: true, body: true, kind: true, file_name: true, created_at: true, author_name: true, iteration: { select: { major: true, name: true } } } },
        },
      });
      return phases.map((phase) => {
        const kinds = iterationKinds(phase.iteration_kinds_snapshot);
        return {
          phaseId: phase.id,
          phaseName: phase.name_snapshot,
          notes: phase.workspace_cards.map((card) => ({
            id: card.id, body: card.kind === "FILE" ? card.file_name ?? "" : card.body, createdAt: card.created_at, authorName: card.author_name, imageCount: card.kind === "IMAGE" ? 1 : 0,
            iterationLabel: card.iteration ? iterationShortName(card.iteration.name, phase.prefix_snapshot, card.iteration, kinds.includes(card.iteration.name)) : null,
          })),
        };
      });
    },
  };

  /** A phase's cards, oldest first (the newest sit next to the composer), each with its round label. */
  async function readPhaseNotes(phaseId: string, prefix: string, kinds: readonly string[]) {
    const rows = await db.sfWorkspaceCard.findMany({
      where: { phase_id: phaseId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      include: { iteration: { select: { id: true, major: true, name: true } } },
    });
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      version: row.version,
      body: row.body,
      starred: row.is_pinned,
      clientFeedback: row.origin === "CLIENT_ANSWER",
      origin: row.origin,
      workflowRecord: row.workflow_record,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      iterationId: row.iteration_id,
      iterationLabel: row.iteration ? iterationShortName(row.iteration.name, prefix, row.iteration, kinds.includes(row.iteration.name)) : null,
      kind: row.kind,
      images: await elementImages(row),
      file: await elementFile(row),
    })));
  }

  return { workspace: { ...cards, ...threads, ...reads }, phaseNotes, readPhaseNotes };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>["workspace"];
