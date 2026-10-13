import { randomUUID } from "node:crypto";

import type { AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey } from "@platform/core/storage";

import { NOTE_IMAGE_BYTES, NOTE_IMAGE_LIMIT, STUDIOFLOW_IMAGE_TYPES, sniffImage } from "../domain/images";
import { iterationKinds } from "../domain/iteration-kinds";
import { iterationShortName } from "../domain/phase";
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
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";
import { discardObjects, enqueueUnreferencedCleanup } from "../asset-cleanup";

/**
 * Project Workspace (WO-SF-WORKSPACE-01, owner 2026-10-12): one Workspace per project, ordered sections holding ordered
 * cards. A card's phase and round are labels — where it came from — never where it lives. Former phase notes are cards.
 */

/** One card's text; the old per-iteration notes had the same limit. */
export const PHASE_NOTE_MAX = 4000;
export const WORKSPACE_SECTION_TITLE_MAX = 80;
export const WORKSPACE_DEFAULT_SECTION_KEY = "DEFAULT";
/** Initial display name only; the fixed system identity survives a later rename or reorder. */
export const DEFAULT_WORKSPACE_SECTION = "Workspace";
export const WORKSPACE_CANVAS_MAX = 100_000;
export const WORKSPACE_CARD_MIN_WIDTH = 180;
export const WORKSPACE_SECTION_MIN_WIDTH = 260;
export const WORKSPACE_SECTION_MIN_HEIGHT = 120;

export type NoteImageUpload = { body: Uint8Array; contentType: string };
export type WorkspaceCardOrigin = "NOTE" | "CLIENT_ANSWER" | "SITE_VISIT";

const IMAGE_SIGNED_URL_SECONDS = 15 * 60;

export const NOTE_IMAGES_SELECT = {
  orderBy: [{ sort_order: "asc" as const }, { created_at: "asc" as const }, { id: "asc" as const }],
  select: { id: true, storage_key: true, content_type: true, bytes: true },
};

function cardNotFound(): AppError {
  return new AppError("NOT_FOUND", "PHASE_NOTE_NOT_FOUND", "This note no longer exists.");
}

function staleCard(): AppError {
  return conflict("WORKSPACE_CARD_STALE", "Someone changed this card in the meantime. Reload to see the latest version.");
}

function staleSection(): AppError {
  return conflict("WORKSPACE_SECTION_STALE", "Someone changed this section in the meantime. Reload to see the latest version.");
}

function orderIds(ids: readonly string[], expected: readonly string[]): void {
  if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some((id) => !expected.includes(id))) {
    throw invalid("WORKSPACE_ORDER_INVALID", "The reordered items must match the current list.");
  }
}

/** Serialises section creation and section order changes for one project. */
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
 * or what was seen on site lands in the project's Workspace in the same transaction. Without `iterationId`, the
 * phase's latest round labels it. Without `sectionId`, it goes to the project's fixed default section.
 */
export async function insertWorkspaceCard(tx: TxClient, ports: StudioFlowPorts, input: { projectId: string; phaseId: string | null; iterationId?: string | null; sectionId?: string; body: string; origin: WorkspaceCardOrigin; pinned?: boolean; actor: AuditActor; at: Date; x?: number; y?: number; w?: number }) {
  const iterationId = input.iterationId !== undefined
    ? input.iterationId
    : input.phaseId ? (await tx.sfRevision.findFirst({ where: { phase_id: input.phaseId }, orderBy: { major: "desc" }, select: { id: true } }))?.id ?? null : null;
  const sectionId = input.sectionId ?? await defaultSection(tx, ports, input.projectId, input.actor.userId ?? "system", input.actor, input.at);
  const sortOrder = await nextCardOrder(tx, sectionId);
  return tx.sfWorkspaceCard.create({
    data: {
      id: randomUUID(), project_id: input.projectId, section_id: sectionId, sort_order: sortOrder, phase_id: input.phaseId, iteration_id: iterationId,
      body: input.body, origin: input.origin, is_pinned: input.pinned ?? false, author_id: input.actor.userId ?? null, author_name: input.actor.label, created_at: input.at,
      canvas_x: input.x, canvas_y: input.y, canvas_w: input.w,
    },
    select: { id: true },
  });
}

type CardRow = { id: string; project_id: string; section_id: string; phase_id: string | null; iteration_id: string | null; body: string; is_pinned: boolean; origin: WorkspaceCardOrigin; version: number; _count: { images: number } };
type ProjectInput = CommandContext & { projectId: string };
type CardGeometry = { x: number; y: number; w: number };
type SectionGeometry = CardGeometry & { h: number };

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

function sectionGeometry(input: Partial<SectionGeometry>): SectionGeometry | undefined {
  if (input.x === undefined && input.y === undefined && input.w === undefined && input.h === undefined) return undefined;
  if (input.x === undefined || input.y === undefined || input.w === undefined || input.h === undefined) throw invalid("WORKSPACE_CANVAS_INVALID", "Frame position and size must be provided together.");
  return {
    x: canvasInteger(input.x, 0, "Frame x"),
    y: canvasInteger(input.y, 0, "Frame y"),
    w: canvasInteger(input.w, WORKSPACE_SECTION_MIN_WIDTH, "Frame width"),
    h: canvasInteger(input.h, WORKSPACE_SECTION_MIN_HEIGHT, "Frame height"),
  };
}

export function createWorkspaceService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  /** Project-level Workspace writes (sections, unlabelled cards): phase work, the project's document people, an open, active project. */
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
      select: { id: true, project_id: true, section_id: true, phase_id: true, iteration_id: true, body: true, is_pinned: true, origin: true, version: true, _count: { select: { images: true } } },
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

  async function loadSection(tx: TxClient, projectId: string, sectionId: string) {
    const section = await tx.sfWorkspaceSection.findFirst({ where: { id: sectionId, project_id: projectId } });
    if (!section) throw notFound("workspace section");
    return section;
  }

  async function audit(tx: TxClient, actor: AuditActor, entity: "workspace-card" | "workspace-section", action: string, entityId: string, metadata: Record<string, unknown>) {
    await writeAudit(ports, tx, { action: `studioflow.${entity}.${action}`, entityType: entity, entityId, actor, metadata });
  }

  type ImageRow = { id: string; storage_key: string; content_type: string; bytes: number };
  /** Public view of a card's images: short-lived signed links, never the storage key. */
  async function signImages(rows: readonly ImageRow[]) {
    return Promise.all(rows.map(async (row) => {
      let url: string | null = null;
      try {
        url = await ports.storage.createSignedReadUrl(row.storage_key, IMAGE_SIGNED_URL_SECONDS);
      } catch {
        // A storage hiccup hides one thumbnail; it must not fail the whole page.
      }
      return { id: row.id, url, contentType: row.content_type, bytes: row.bytes };
    }));
  }

  /** A label must belong to the card's project; a round label implies its own phase. */
  async function validatePhaseLabel(tx: TxClient, projectId: string, phaseId: string | null) {
    if (!phaseId) return;
    const phase = await tx.sfPhase.findUnique({ where: { id: phaseId }, select: { project_id: true } });
    if (!phase || phase.project_id !== projectId) throw invalid("WORKSPACE_PHASE_INVALID", "Choose a phase of this project.");
  }

  // ── Sections ──────────────────────────────────────────────────────────

  const sections = {
    async createWorkspaceSection(input: ProjectInput & { title: string; x?: number; y?: number; w?: number; h?: number }) {
      const title = requiredText(input.title, "WORKSPACE_SECTION_TITLE_REQUIRED", "Section title", WORKSPACE_SECTION_TITLE_MAX);
      const canvas = sectionGeometry(input);
      return runTransaction(async (tx) => {
        const { actorId } = await writableProject(tx, input);
        await lockProject(tx, input.projectId);
        const last = await tx.sfWorkspaceSection.aggregate({ where: { project_id: input.projectId }, _max: { sort_order: true } });
        const section = await tx.sfWorkspaceSection.create({ data: { id: randomUUID(), project_id: input.projectId, title, sort_order: (last._max.sort_order ?? -1) + 1, created_by_id: actorId, created_at: nowOf(ports), canvas_x: canvas?.x, canvas_y: canvas?.y, canvas_w: canvas?.w, canvas_h: canvas?.h } });
        await audit(tx, input.actor, "workspace-section", "created", section.id, { projectId: input.projectId, isDefault: false });
        return { sectionId: section.id };
      });
    },
    async renameWorkspaceSection(input: ProjectInput & { sectionId: string; title: string; version: number }) {
      const title = requiredText(input.title, "WORKSPACE_SECTION_TITLE_REQUIRED", "Section title", WORKSPACE_SECTION_TITLE_MAX);
      return runTransaction(async (tx) => {
        await writableProject(tx, input);
        const section = await loadSection(tx, input.projectId, input.sectionId);
        if (section.version !== input.version) throw staleSection();
        if (section.title === title) return { sectionId: section.id, version: section.version };
        const updated = await tx.sfWorkspaceSection.updateMany({ where: { id: section.id, version: input.version }, data: { title, version: { increment: 1 } } });
        if (updated.count === 0) throw staleSection();
        await audit(tx, input.actor, "workspace-section", "renamed", section.id, { projectId: input.projectId, isDefault: section.system_key === WORKSPACE_DEFAULT_SECTION_KEY });
        return { sectionId: section.id, version: section.version + 1 };
      });
    },
    async reorderWorkspaceSections(input: ProjectInput & { orderedIds: string[] }) {
      return runTransaction(async (tx) => {
        await writableProject(tx, input);
        await lockProject(tx, input.projectId);
        const rows = await tx.sfWorkspaceSection.findMany({ where: { project_id: input.projectId }, select: { id: true } });
        orderIds(input.orderedIds, rows.map((row) => row.id));
        for (const [sortOrder, id] of input.orderedIds.entries()) await tx.sfWorkspaceSection.update({ where: { id }, data: { sort_order: sortOrder, version: { increment: 1 } } });
        await audit(tx, input.actor, "workspace-section", "reordered", input.projectId, { projectId: input.projectId, count: input.orderedIds.length });
        return { projectId: input.projectId };
      });
    },
    /** Only an empty section can go (owner, 2026-10-12), so no card is ever lost by deleting its section. */
    async deleteWorkspaceSection(input: ProjectInput & { sectionId: string; version: number }) {
      return runTransaction(async (tx) => {
        await writableProject(tx, input);
        await lockProject(tx, input.projectId);
        const section = await loadSection(tx, input.projectId, input.sectionId);
        if (section.version !== input.version) throw staleSection();
        if (section.system_key === WORKSPACE_DEFAULT_SECTION_KEY) throw conflict("WORKSPACE_SECTION_DEFAULT", "The default section can be renamed or moved, not deleted.");
        await lockSection(tx, section.id);
        if (await tx.sfWorkspaceCard.count({ where: { section_id: section.id } }) > 0) throw conflict("WORKSPACE_SECTION_NOT_EMPTY", "Move or delete this section's cards first.");
        await tx.sfWorkspaceSection.delete({ where: { id: section.id } });
        await audit(tx, input.actor, "workspace-section", "deleted", section.id, { projectId: input.projectId, isDefault: false });
        return { sectionId: section.id };
      });
    },
  };

  // ── Cards ─────────────────────────────────────────────────────────────

  async function createCard(input: ProjectInput & { sectionId?: string; phaseId?: string | null; body: string | null; origin?: "NOTE" | "CLIENT_ANSWER"; withImages?: boolean; x?: number; y?: number; w?: number }) {
    const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
    if (!body && !input.withImages) throw invalid("PHASE_NOTE_EMPTY", "Write something or add an image.");
    const canvas = cardGeometry(input);
    return runTransaction(async (tx) => {
      const phaseId = input.phaseId ?? null;
      await validatePhaseLabel(tx, input.projectId, phaseId);
      await writableScope(tx, input, phaseId);
      if (input.sectionId) await loadSection(tx, input.projectId, input.sectionId);
      const card = await insertWorkspaceCard(tx, ports, { projectId: input.projectId, phaseId, sectionId: input.sectionId, body, origin: input.origin ?? "NOTE", actor: input.actor, at: nowOf(ports), ...canvas });
      await audit(tx, input.actor, "workspace-card", "created", card.id, { projectId: input.projectId, phaseId });
      return { cardId: card.id };
    });
  }

  async function updateCardText(input: ProjectInput & { cardId: string; body: string | null; version?: number }, phaseId?: string) {
    const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
    return runTransaction(async (tx) => {
      const card = await writableCard(tx, input, phaseId);
      if (card.body === body) return { cardId: card.id, version: card.version };
      if (!body && card._count.images === 0) throw invalid("PHASE_NOTE_EMPTY", "A note needs text or an image. Delete it instead.");
      const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { body, edited_at: nowOf(ports), version: { increment: 1 } } });
      if (updated.count === 0) throw staleCard();
      await audit(tx, input.actor, "workspace-card", "edited", card.id, { projectId: input.projectId, phaseId: card.phase_id });
      return { cardId: card.id, version: card.version + 1 };
    });
  }

  /** Pin a card, or mark it as what the client said. A site-visit card keeps its origin unless switched to a client answer. */
  async function setCardFlags(input: ProjectInput & { cardId: string; pinned?: boolean; clientAnswer?: boolean; version?: number }, phaseId?: string) {
    return runTransaction(async (tx) => {
      const card = await writableCard(tx, input, phaseId);
      const data: { is_pinned?: boolean; origin?: WorkspaceCardOrigin } = {};
      if (input.pinned !== undefined && input.pinned !== card.is_pinned) data.is_pinned = input.pinned;
      if (input.clientAnswer === true && card.origin !== "CLIENT_ANSWER") data.origin = "CLIENT_ANSWER";
      if (input.clientAnswer === false && card.origin === "CLIENT_ANSWER") data.origin = "NOTE";
      if (Object.keys(data).length === 0) return { cardId: card.id, version: card.version };
      const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { ...data, version: { increment: 1 } } });
      if (updated.count === 0) throw staleCard();
      await audit(tx, input.actor, "workspace-card", "flags-changed", card.id, { projectId: input.projectId, ...data });
      return { cardId: card.id, version: card.version + 1 };
    });
  }

  async function deleteCard(input: ProjectInput & { cardId: string; version?: number }, phaseId?: string) {
    const result = await runTransaction(async (tx) => {
      const card = await writableCard(tx, input, phaseId);
      const keys = (await tx.sfWorkspaceCardImage.findMany({ where: { card_id: card.id }, select: { storage_key: true } })).map((image) => image.storage_key);
      const deleted = await tx.sfWorkspaceCard.deleteMany({ where: { id: card.id, version: card.version } });
      if (deleted.count === 0) throw staleCard();
      await audit(tx, input.actor, "workspace-card", "deleted", card.id, { projectId: input.projectId, phaseId: card.phase_id, images: keys.length });
      return { cardId: card.id, keys: await enqueueUnreferencedCleanup(tx, keys) };
    });
    await discardObjects(db, ports.storage, result.keys);
    return { cardId: result.cardId };
  }

  /** Appends one image. The object is written before the row and discarded if the transaction fails. */
  async function addCardImage(input: ProjectInput & { cardId: string; file: NoteImageUpload }, phaseId?: string) {
    requireCommand(input, P.phaseWork);
    const extension = STUDIOFLOW_IMAGE_TYPES[input.file.contentType];
    if (!extension) throw invalid("NOTE_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
    const bytes = input.file.body.byteLength;
    if (bytes === 0 || bytes > NOTE_IMAGE_BYTES) throw invalid("NOTE_IMAGE_SIZE", "Each image must be smaller than 3 MB.");
    if (!sniffImage(input.file.body, input.file.contentType)) throw invalid("NOTE_IMAGE_TYPE", "This file is not a valid image.");
    // Scope, access and limit are checked before touching storage, then again inside the write transaction.
    await runTransaction(async (tx) => {
      const card = await writableCard(tx, input, phaseId);
      if (card._count.images >= NOTE_IMAGE_LIMIT) throw invalid("NOTE_IMAGE_LIMIT", `A note holds at most ${NOTE_IMAGE_LIMIT} images.`);
    });
    const key = createPrivateObjectKey(`studioflow/notes/${input.projectId}`, extension);
    await ports.storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body });
    try {
      return await runTransaction(async (tx) => {
        const card = await writableCard(tx, input, phaseId);
        // Serialise concurrent adds to one card so the limit and the order cannot race.
        await tx.$queryRaw`SELECT id FROM studioflow.sf_workspace_card WHERE id = ${card.id} FOR UPDATE`;
        const last = await tx.sfWorkspaceCardImage.aggregate({ where: { card_id: card.id }, _count: { _all: true }, _max: { sort_order: true } });
        if (last._count._all >= NOTE_IMAGE_LIMIT) throw invalid("NOTE_IMAGE_LIMIT", `A note holds at most ${NOTE_IMAGE_LIMIT} images.`);
        const image = await tx.sfWorkspaceCardImage.create({
          data: { card_id: card.id, storage_key: key, content_type: input.file.contentType, bytes, sort_order: (last._max.sort_order ?? 0) + 1, uploaded_by_id: input.actor.userId!, uploaded_by_name: input.actor.label },
          select: { id: true },
        });
        await tx.sfWorkspaceCard.update({ where: { id: card.id }, data: { version: { increment: 1 } } });
        await audit(tx, input.actor, "workspace-card", "image-added", card.id, { projectId: input.projectId, imageId: image.id, bytes });
        return { cardId: card.id, imageId: image.id };
      });
    } catch (error) {
      await discardObjects(db, ports.storage, [key]);
      throw error;
    }
  }

  /** Removes one image; a card left with no text and no image is removed with it. */
  async function removeCardImage(input: ProjectInput & { imageId: string }, phaseId?: string) {
    const result = await runTransaction(async (tx) => {
      const image = await tx.sfWorkspaceCardImage.findFirst({
        where: { id: input.imageId, card: { project_id: input.projectId, ...(phaseId ? { phase_id: phaseId } : {}) } },
        select: { id: true, card_id: true, storage_key: true, card: { select: { body: true, phase_id: true } } },
      });
      if (!image) throw new AppError("NOT_FOUND", "NOTE_IMAGE_NOT_FOUND", "This image no longer exists.");
      await writableScope(tx, input, image.card.phase_id);
      await tx.sfWorkspaceCardImage.delete({ where: { id: image.id } });
      const emptied = !image.card.body && (await tx.sfWorkspaceCardImage.count({ where: { card_id: image.card_id } })) === 0;
      if (emptied) await tx.sfWorkspaceCard.delete({ where: { id: image.card_id } });
      else await tx.sfWorkspaceCard.update({ where: { id: image.card_id }, data: { version: { increment: 1 } } });
      await audit(tx, input.actor, "workspace-card", emptied ? "deleted" : "image-removed", image.card_id, { projectId: input.projectId, imageId: image.id });
      return { cardId: image.card_id, imageId: image.id, cardRemoved: emptied, keys: await enqueueUnreferencedCleanup(tx, [image.storage_key]) };
    });
    await discardObjects(db, ports.storage, result.keys);
    return { cardId: result.cardId, imageId: result.imageId, cardRemoved: result.cardRemoved };
  }

  const cards = {
    createWorkspaceCard: (input: ProjectInput & { sectionId?: string; phaseId?: string | null; body: string | null; clientAnswer?: boolean; withImages?: boolean; x?: number; y?: number; w?: number }) =>
      createCard({ ...input, origin: input.clientAnswer ? "CLIENT_ANSWER" : "NOTE" }),
    updateWorkspaceCardText: (input: ProjectInput & { cardId: string; body: string | null; version: number }) => updateCardText(input),
    setWorkspaceCardFlags: (input: ProjectInput & { cardId: string; pinned?: boolean; clientAnswer?: boolean; version: number }) => setCardFlags(input),
    deleteWorkspaceCard: (input: ProjectInput & { cardId: string; version: number }) => deleteCard(input),
    addWorkspaceCardImage: (input: ProjectInput & { cardId: string; file: NoteImageUpload }) => addCardImage(input),
    removeWorkspaceCardImage: (input: ProjectInput & { imageId: string }) => removeCardImage(input),

    /** Sets or clears a card's phase label. Clearing it, or moving to another phase, also clears the round label. */
    async setWorkspaceCardPhase(input: ProjectInput & { cardId: string; phaseId: string | null; version: number }) {
      return runTransaction(async (tx) => {
        const card = await writableCard(tx, input);
        if (card.phase_id === input.phaseId) return { cardId: card.id, version: card.version };
        await validatePhaseLabel(tx, input.projectId, input.phaseId);
        // Labelling needs the write right for both the old and the new label.
        await writableScope(tx, input, input.phaseId);
        const updated = await tx.sfWorkspaceCard.updateMany({ where: { id: card.id, version: card.version }, data: { phase_id: input.phaseId, iteration_id: null, version: { increment: 1 } } });
        if (updated.count === 0) throw staleCard();
        await audit(tx, input.actor, "workspace-card", "phase-label-changed", card.id, { projectId: input.projectId, fromPhaseId: card.phase_id, toPhaseId: input.phaseId });
        return { cardId: card.id, version: card.version + 1 };
      });
    },

    /** Moves a card to a section (possibly its own) at a position; the rest close up around it. */
    async moveWorkspaceCard(input: ProjectInput & { cardId: string; sectionId: string; position: number; version: number }) {
      if (!Number.isInteger(input.position) || input.position < 0) throw invalid("WORKSPACE_POSITION_INVALID", "Choose a valid position.");
      return runTransaction(async (tx) => {
        const card = await writableCard(tx, input);
        const target = await loadSection(tx, input.projectId, input.sectionId);
        const sectionIds = [...new Set([card.section_id, target.id])].sort();
        for (const id of sectionIds) await lockSection(tx, id);
        const current = await tx.sfWorkspaceCard.findFirst({ where: { id: card.id }, select: { version: true } });
        if (!current || current.version !== card.version) throw staleCard();
        const targetIds = (await tx.sfWorkspaceCard.findMany({ where: { section_id: target.id, NOT: { id: card.id } }, orderBy: [{ sort_order: "asc" }, { id: "asc" }], select: { id: true } })).map((row) => row.id);
        targetIds.splice(Math.min(input.position, targetIds.length), 0, card.id);
        for (const [sortOrder, id] of targetIds.entries()) {
          await tx.sfWorkspaceCard.update({ where: { id }, data: id === card.id ? { section_id: target.id, sort_order: sortOrder, canvas_x: null, canvas_y: null, version: { increment: 1 } } : { sort_order: sortOrder } });
        }
        if (card.section_id !== target.id) {
          const sourceIds = (await tx.sfWorkspaceCard.findMany({ where: { section_id: card.section_id }, orderBy: [{ sort_order: "asc" }, { id: "asc" }], select: { id: true } })).map((row) => row.id);
          for (const [sortOrder, id] of sourceIds.entries()) await tx.sfWorkspaceCard.update({ where: { id }, data: { sort_order: sortOrder } });
        }
        await audit(tx, input.actor, "workspace-card", "moved", card.id, { projectId: input.projectId, fromSectionId: card.section_id, toSectionId: target.id, position: targetIds.indexOf(card.id) });
        return { cardId: card.id, version: card.version + 1 };
      });
    },

    async reorderWorkspaceCards(input: ProjectInput & { sectionId: string; orderedIds: string[] }) {
      return runTransaction(async (tx) => {
        await writableProject(tx, input);
        const section = await loadSection(tx, input.projectId, input.sectionId);
        await lockSection(tx, section.id);
        const rows = await tx.sfWorkspaceCard.findMany({ where: { section_id: section.id }, select: { id: true } });
        orderIds(input.orderedIds, rows.map((row) => row.id));
        for (const [sortOrder, id] of input.orderedIds.entries()) await tx.sfWorkspaceCard.update({ where: { id }, data: { sort_order: sortOrder } });
        await audit(tx, input.actor, "workspace-section", "cards-reordered", section.id, { projectId: input.projectId, count: input.orderedIds.length, isDefault: section.system_key === WORKSPACE_DEFAULT_SECTION_KEY });
        return { sectionId: section.id };
      });
    },

    /** Persists one canvas gesture batch. Geometry is last-write-wins and deliberately never changes content versions. */
    async placeWorkspaceItems(input: ProjectInput & { sections?: Array<{ id: string } & SectionGeometry>; cards?: Array<{ id: string; sectionId?: string } & CardGeometry> }) {
      const sectionInputs = input.sections ?? [];
      const cardInputs = input.cards ?? [];
      if (sectionInputs.length > 200 || cardInputs.length > 500) throw invalid("WORKSPACE_CANVAS_LIMIT", "Place at most 200 frames and 500 cards at once.");
      for (const item of sectionInputs) sectionGeometry(item);
      for (const item of cardInputs) cardGeometry(item);
      // Repeated ids are intentional for buffered pointer updates: the last value in the batch wins.
      const sectionsById = new Map(sectionInputs.map((item) => [item.id, item]));
      const cardsById = new Map(cardInputs.map((item) => [item.id, item]));

      return runTransaction(async (tx) => {
        requireCommand(input, P.phaseWork);
        // Serialise canvas batches for one project before reading membership, so a concurrent cross-frame move audits
        // the real source and reorders both the real source and destination while still remaining last-write-wins.
        await lockProject(tx, input.projectId);
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true, archived_at: true, status: true } });
        if (!project) throw notFound("project");
        assertProjectWritable(project);
        if (project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing its notes.");
        if (sectionsById.size > 0) await writableProject(tx, input);

        const sectionRows = await tx.sfWorkspaceSection.findMany({ where: { id: { in: [...sectionsById.keys()] }, project_id: input.projectId }, select: { id: true } });
        if (sectionRows.length !== sectionsById.size) throw notFound("workspace section");
        const cardRows = await tx.sfWorkspaceCard.findMany({
          where: { id: { in: [...cardsById.keys()] }, project_id: input.projectId },
          select: { id: true, section_id: true, phase_id: true },
        });
        if (cardRows.length !== cardsById.size) throw cardNotFound();
        for (const card of cardRows) await writableScope(tx, input, card.phase_id);

        const targetIds = [...new Set([...cardsById.values()].flatMap((item) => item.sectionId ? [item.sectionId] : []))];
        const targets = await tx.sfWorkspaceSection.findMany({ where: { id: { in: targetIds }, project_id: input.projectId }, select: { id: true } });
        if (targets.length !== targetIds.length) throw notFound("workspace section");

        const touchedSectionIds = new Set(sectionRows.map((section) => section.id));
        for (const card of cardRows) {
          touchedSectionIds.add(card.section_id);
          const targetId = cardsById.get(card.id)?.sectionId;
          if (targetId) touchedSectionIds.add(targetId);
        }
        for (const sectionId of [...touchedSectionIds].sort()) await lockSection(tx, sectionId);

        for (const item of sectionsById.values()) {
          await tx.sfWorkspaceSection.update({ where: { id: item.id }, data: { canvas_x: item.x, canvas_y: item.y, canvas_w: item.w, canvas_h: item.h } });
        }
        for (const card of cardRows) {
          const item = cardsById.get(card.id)!;
          const targetId = item.sectionId ?? card.section_id;
          await tx.sfWorkspaceCard.update({ where: { id: card.id }, data: { section_id: targetId, canvas_x: item.x, canvas_y: item.y, canvas_w: item.w } });
          if (targetId !== card.section_id) {
            await audit(tx, input.actor, "workspace-card", "moved", card.id, { projectId: input.projectId, fromSectionId: card.section_id, toSectionId: targetId });
          }
        }

        for (const sectionId of touchedSectionIds) {
          const rows = await tx.sfWorkspaceCard.findMany({
            where: { section_id: sectionId },
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            select: { id: true, canvas_x: true, canvas_y: true, created_at: true, sort_order: true },
          });
          rows.sort((a, b) => {
            const aPlaced = a.canvas_x !== null && a.canvas_y !== null;
            const bPlaced = b.canvas_x !== null && b.canvas_y !== null;
            if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
            if (!aPlaced || !bPlaced) return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
            return a.canvas_y! - b.canvas_y! || a.canvas_x! - b.canvas_x! || a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id);
          });
          for (const [sortOrder, row] of rows.entries()) await tx.sfWorkspaceCard.update({ where: { id: row.id }, data: { sort_order: sortOrder } });
        }

        if (sectionsById.size > 0) {
          const rows = await tx.sfWorkspaceSection.findMany({ where: { project_id: input.projectId }, orderBy: [{ sort_order: "asc" }, { id: "asc" }], select: { id: true, canvas_x: true, canvas_y: true, sort_order: true } });
          rows.sort((a, b) => {
            const aPlaced = a.canvas_x !== null;
            const bPlaced = b.canvas_x !== null;
            if (aPlaced !== bPlaced) return aPlaced ? -1 : 1;
            if (!aPlaced || !bPlaced) return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
            return a.canvas_x! - b.canvas_x! || a.canvas_y! - b.canvas_y! || a.sort_order - b.sort_order || a.id.localeCompare(b.id);
          });
          for (const [sortOrder, row] of rows.entries()) await tx.sfWorkspaceSection.update({ where: { id: row.id }, data: { sort_order: sortOrder } });
        }
        return { ok: true as const };
      });
    },
  };

  // ── Reads ─────────────────────────────────────────────────────────────

  type CardReadRow = {
    id: string; body: string; is_pinned: boolean; origin: WorkspaceCardOrigin; author_id: string | null; author_name: string | null; created_at: Date; edited_at: Date | null; version: number;
    section_id: string; sort_order: number; phase_id: string | null; iteration_id: string | null; canvas_x: number | null; canvas_y: number | null; canvas_w: number | null;
    images: ImageRow[];
    iteration: { id: string; major: number; name: string } | null;
    phase: { id: string; name_snapshot: string; prefix_snapshot: string; definition: { default_iteration_kinds: unknown } } | null;
  };
  const CARD_INCLUDE = {
    images: NOTE_IMAGES_SELECT,
    iteration: { select: { id: true, major: true, name: true } },
    phase: { select: { id: true, name_snapshot: true, prefix_snapshot: true, definition: { select: { default_iteration_kinds: true } } } },
  } as const;

  function roundLabel(row: Pick<CardReadRow, "iteration" | "phase">) {
    if (!row.iteration || !row.phase) return null;
    const kinds = iterationKinds(row.phase.definition.default_iteration_kinds);
    return iterationShortName(row.iteration.name, row.phase.prefix_snapshot, row.iteration, kinds.includes(row.iteration.name));
  }

  async function cardView(row: CardReadRow) {
    return {
      id: row.id,
      sectionId: row.section_id,
      sortOrder: row.sort_order,
      version: row.version,
      body: row.body,
      pinned: row.is_pinned,
      origin: row.origin,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      phaseId: row.phase_id,
      phaseName: row.phase?.name_snapshot ?? null,
      iterationId: row.iteration_id,
      iterationLabel: roundLabel(row),
      canvas: row.canvas_x === null || row.canvas_y === null || row.canvas_w === null ? null : { x: row.canvas_x, y: row.canvas_y, w: row.canvas_w },
      images: await signImages(row.images),
    };
  }

  const reads = {
    /** The project's Workspace: sections in order, each with its cards in order; optionally only cards labelled with one phase. */
    async readWorkspace(input: ReadContext & { projectId: string; phaseId?: string | null }) {
      requireRead(input.grants);
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true } });
      if (!project) throw notFound("project");
      const [sectionRows, cardRows] = await Promise.all([
        db.sfWorkspaceSection.findMany({ where: { project_id: input.projectId }, orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }] }),
        db.sfWorkspaceCard.findMany({
          where: { project_id: input.projectId, ...(input.phaseId ? { phase_id: input.phaseId } : {}) },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          include: CARD_INCLUDE,
        }),
      ]);
      const views = await Promise.all(cardRows.map((row) => cardView(row as CardReadRow)));
      return sectionRows.map((section) => ({
        id: section.id, title: section.title, sortOrder: section.sort_order, version: section.version, isDefault: section.system_key === WORKSPACE_DEFAULT_SECTION_KEY,
        canvas: section.canvas_x === null || section.canvas_y === null || section.canvas_w === null || section.canvas_h === null ? null : { x: section.canvas_x, y: section.canvas_y, w: section.canvas_w, h: section.canvas_h },
        cards: views.filter((card) => card.sectionId === section.id),
      }));
    },

    /** The project's phases as label choices. */
    async listWorkspacePhaseLabels(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      return (await db.sfPhase.findMany({ where: { project_id: input.projectId }, orderBy: { order_index: "asc" }, select: { id: true, name_snapshot: true } }))
        .map((phase) => ({ id: phase.id, name: phase.name_snapshot }));
    },
  };

  // ── The phase notes feed (today's notes screen keeps working on cards labelled with the phase) ─────────────

  type NoteInput = CommandContext & { projectId: string; phaseId: string };
  const phaseNotes = {
    /**
     * Posts a message labelled with the phase (and its latest round) into the project's default section. `withImages` lets
     * a message start empty when its images follow one by one (`addPhaseNoteImage`); otherwise it needs text.
     */
    async postPhaseNote(input: NoteInput & { body: string | null; clientFeedback?: boolean; withImages?: boolean }) {
      const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
      if (!body && !input.withImages) throw invalid("PHASE_NOTE_EMPTY", "Write something or add an image.");
      return runTransaction(async (tx) => {
        const phase = await writablePhase(tx, input);
        const card = await insertWorkspaceCard(tx, ports, { projectId: phase.project_id, phaseId: phase.id, body, origin: input.clientFeedback ? "CLIENT_ANSWER" : "NOTE", actor: input.actor, at: nowOf(ports) });
        await audit(tx, input.actor, "workspace-card", "created", card.id, { projectId: phase.project_id, phaseId: phase.id });
        return { noteId: card.id };
      });
    },
    async editPhaseNote(input: NoteInput & { noteId: string; body: string | null; version?: number }) {
      return { noteId: (await updateCardText({ ...input, cardId: input.noteId }, input.phaseId)).cardId };
    },
    /** Star (pin) a message, or mark it as what the client said. */
    async setPhaseNoteFlags(input: NoteInput & { noteId: string; starred?: boolean; clientFeedback?: boolean; version?: number }) {
      return { noteId: (await setCardFlags({ ...input, cardId: input.noteId, pinned: input.starred, clientAnswer: input.clientFeedback }, input.phaseId)).cardId };
    },
    async deletePhaseNote(input: NoteInput & { noteId: string; version?: number }) {
      return { noteId: (await deleteCard({ ...input, cardId: input.noteId }, input.phaseId)).cardId };
    },
    async addPhaseNoteImage(input: NoteInput & { noteId: string; file: NoteImageUpload }) {
      const result = await addCardImage({ ...input, cardId: input.noteId }, input.phaseId);
      return { noteId: result.cardId, imageId: result.imageId };
    },
    async removePhaseNoteImage(input: NoteInput & { imageId: string }) {
      const result = await removeCardImage(input, input.phaseId);
      return { noteId: result.cardId, imageId: result.imageId, noteRemoved: result.cardRemoved };
    },

    /** Every phase's pinned cards, for the project card's pinned-notes dialog. Text only; images open on the phase page. */
    async listStarredPhaseNotes(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const phases = await db.sfPhase.findMany({
        where: { project_id: input.projectId },
        orderBy: { order_index: "asc" },
        select: {
          id: true, name_snapshot: true, prefix_snapshot: true,
          definition: { select: { default_iteration_kinds: true } },
          workspace_cards: { where: { is_pinned: true }, orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { id: true, body: true, created_at: true, author_name: true, _count: { select: { images: true } }, iteration: { select: { major: true, name: true } } } },
        },
      });
      return phases.map((phase) => {
        const kinds = iterationKinds(phase.definition.default_iteration_kinds);
        return {
          phaseId: phase.id,
          phaseName: phase.name_snapshot,
          notes: phase.workspace_cards.map((card) => ({
            id: card.id, body: card.body, createdAt: card.created_at, authorName: card.author_name, imageCount: card._count.images,
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
      include: { images: NOTE_IMAGES_SELECT, iteration: { select: { id: true, major: true, name: true } } },
    });
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      version: row.version,
      body: row.body,
      starred: row.is_pinned,
      clientFeedback: row.origin === "CLIENT_ANSWER",
      origin: row.origin,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      iterationId: row.iteration_id,
      iterationLabel: row.iteration ? iterationShortName(row.iteration.name, prefix, row.iteration, kinds.includes(row.iteration.name)) : null,
      images: await signImages(row.images),
    })));
  }

  return { workspace: { ...sections, ...cards, ...reads }, phaseNotes, readPhaseNotes };
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>["workspace"];
