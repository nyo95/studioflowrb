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
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";
import { discardObjects, enqueueUnreferencedCleanup } from "../asset-cleanup";

/** One message's text (WO-SF-NOTEFEED-01); the old per-iteration notes had the same limit. */
export const PHASE_NOTE_MAX = 4000;

/** A file dropped, pasted or picked into a note message. */
export type NoteImageUpload = { body: Uint8Array; contentType: string };

/** Signed read links for note images stay valid this long. */
const NOTE_IMAGE_SIGNED_URL_SECONDS = 15 * 60;

export const NOTE_IMAGES_SELECT = {
  orderBy: [{ sort_order: "asc" as const }, { created_at: "asc" as const }, { id: "asc" as const }],
  select: { id: true, storage_key: true, content_type: true, bytes: true },
};

type NoteInput = CommandContext & { projectId: string; phaseId: string };

function noteNotFound(): AppError {
  return new AppError("NOT_FOUND", "PHASE_NOTE_NOT_FOUND", "This note no longer exists.");
}

/**
 * Writes one message inside the caller's transaction. Also used by the answer and visit commands, so what the client
 * said or what was seen on site lands in the same stream. Without `iterationId`, the phase's latest iteration labels it.
 */
export async function insertPhaseNote(tx: TxClient, input: { phaseId: string; iterationId?: string | null; body: string; clientFeedback: boolean; starred?: boolean; actor: AuditActor; at: Date }) {
  const iterationId = input.iterationId !== undefined
    ? input.iterationId
    : (await tx.sfRevision.findFirst({ where: { phase_id: input.phaseId }, orderBy: { major: "desc" }, select: { id: true } }))?.id ?? null;
  return tx.sfPhaseNote.create({
    data: { id: randomUUID(), phase_id: input.phaseId, iteration_id: iterationId, body: input.body, is_client_feedback: input.clientFeedback, is_starred: input.starred ?? false, author_id: input.actor.userId ?? null, author_name: input.actor.label, created_at: input.at },
    select: { id: true },
  });
}

export function createPhaseNoteService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  /** Same gate as the iteration commands: phase work, the project's people, and an open, active project. Approved phases stay writable. */
  async function writablePhase(tx: TxClient, input: NoteInput) {
    requireCommand(input, P.phaseWork);
    const phase = await tx.sfPhase.findUnique({ where: { id: input.phaseId }, include: { project: true } });
    if (!phase || phase.project_id !== input.projectId) throw notFound("phase");
    assertProjectWritable(phase.project);
    if (phase.project.status !== "ACTIVE") throw conflict("PROJECT_NOT_ACTIVE", "The project must be active before changing its notes.");
    await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: phase.id, kind: "transition" });
    return phase;
  }

  async function noteOf(tx: TxClient, input: NoteInput & { noteId: string }) {
    const phase = await writablePhase(tx, input);
    const note = await tx.sfPhaseNote.findFirst({ where: { id: input.noteId, phase_id: phase.id }, include: { _count: { select: { images: true } } } });
    if (!note) throw noteNotFound();
    return { phase, note };
  }

  async function audit(tx: TxClient, actor: AuditActor, action: string, phase: { id: string; project_id: string; name_snapshot: string }, noteId: string, metadata: Record<string, unknown> = {}) {
    await writeAudit(ports, tx, { action: `studioflow.phase-note.${action}`, entityType: "phase-note", entityId: noteId, actor, metadata: { projectId: phase.project_id, phaseId: phase.id, phaseName: phase.name_snapshot, ...metadata } });
  }

  type ImageRow = { id: string; storage_key: string; content_type: string; bytes: number };
  /** Public view of a note's images: short-lived signed links, never the storage key. */
  async function signImages(rows: readonly ImageRow[]) {
    return Promise.all(rows.map(async (row) => {
      let url: string | null = null;
      try {
        url = await ports.storage.createSignedReadUrl(row.storage_key, NOTE_IMAGE_SIGNED_URL_SECONDS);
      } catch {
        // A storage hiccup hides one thumbnail; it must not fail the whole page.
      }
      return { id: row.id, url, contentType: row.content_type, bytes: row.bytes };
    }));
  }

  return {
    /**
     * Posts a message. `withImages` lets a message start empty when its images follow one by one
     * (`addPhaseNoteImage`); otherwise it needs text.
     */
    async postPhaseNote(input: NoteInput & { body: string | null; clientFeedback?: boolean; withImages?: boolean }) {
      const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
      if (!body && !input.withImages) throw invalid("PHASE_NOTE_EMPTY", "Write something or add an image.");
      return runTransaction(async (tx) => {
        const phase = await writablePhase(tx, input);
        const note = await insertPhaseNote(tx, { phaseId: phase.id, body, clientFeedback: input.clientFeedback ?? false, actor: input.actor, at: nowOf(ports) });
        await audit(tx, input.actor, "posted", phase, note.id);
        return { noteId: note.id };
      });
    },
    async editPhaseNote(input: NoteInput & { noteId: string; body: string | null }) {
      const body = optionalText(input.body, PHASE_NOTE_MAX) ?? "";
      return runTransaction(async (tx) => {
        const { phase, note } = await noteOf(tx, input);
        if (note.body === body) return { noteId: note.id };
        if (!body && note._count.images === 0) throw invalid("PHASE_NOTE_EMPTY", "A note needs text or an image. Delete it instead.");
        await tx.sfPhaseNote.update({ where: { id: note.id }, data: { body, edited_at: nowOf(ports) } });
        await audit(tx, input.actor, "edited", phase, note.id);
        return { noteId: note.id };
      });
    },
    /** Star (pin) a message, or mark it as what the client said. */
    async setPhaseNoteFlags(input: NoteInput & { noteId: string; starred?: boolean; clientFeedback?: boolean }) {
      return runTransaction(async (tx) => {
        const { phase, note } = await noteOf(tx, input);
        const data: { is_starred?: boolean; is_client_feedback?: boolean } = {};
        if (input.starred !== undefined && input.starred !== note.is_starred) data.is_starred = input.starred;
        if (input.clientFeedback !== undefined && input.clientFeedback !== note.is_client_feedback) data.is_client_feedback = input.clientFeedback;
        if (Object.keys(data).length === 0) return { noteId: note.id };
        await tx.sfPhaseNote.update({ where: { id: note.id }, data });
        await audit(tx, input.actor, "flags-changed", phase, note.id, data);
        return { noteId: note.id };
      });
    },
    /** Deletes a message and its images; the stored objects are released after commit unless something else still points at them. */
    async deletePhaseNote(input: NoteInput & { noteId: string }) {
      const result = await runTransaction(async (tx) => {
        const { phase, note } = await noteOf(tx, input);
        const keys = (await tx.sfPhaseNoteImage.findMany({ where: { note_id: note.id }, select: { storage_key: true } })).map((image) => image.storage_key);
        await tx.sfPhaseNote.delete({ where: { id: note.id } });
        await audit(tx, input.actor, "deleted", phase, note.id, { images: keys.length });
        return { noteId: note.id, keys: await enqueueUnreferencedCleanup(tx, keys) };
      });
      await discardObjects(db, ports.storage, result.keys);
      return { noteId: result.noteId };
    },
    /** Appends one image to a message. The object is written before the row and discarded if the transaction fails. */
    async addPhaseNoteImage(input: NoteInput & { noteId: string; file: NoteImageUpload }) {
      requireCommand(input, P.phaseWork);
      const extension = STUDIOFLOW_IMAGE_TYPES[input.file.contentType];
      if (!extension) throw invalid("NOTE_IMAGE_TYPE", "Use a PNG, JPEG, or WebP image.");
      const bytes = input.file.body.byteLength;
      if (bytes === 0 || bytes > NOTE_IMAGE_BYTES) throw invalid("NOTE_IMAGE_SIZE", "Each image must be smaller than 3 MB.");
      if (!sniffImage(input.file.body, input.file.contentType)) throw invalid("NOTE_IMAGE_TYPE", "This file is not a valid image.");
      // Scope, access and limit are checked before touching storage, then again inside the write transaction.
      await runTransaction(async (tx) => {
        const { note } = await noteOf(tx, input);
        if (note._count.images >= NOTE_IMAGE_LIMIT) throw invalid("NOTE_IMAGE_LIMIT", `A note holds at most ${NOTE_IMAGE_LIMIT} images.`);
      });
      const key = createPrivateObjectKey(`studioflow/notes/${input.projectId}`, extension);
      await ports.storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body });
      try {
        return await runTransaction(async (tx) => {
          const { phase, note } = await noteOf(tx, input);
          // Serialise concurrent adds to one message so the limit and the order cannot race.
          await tx.$queryRaw`SELECT id FROM studioflow.sf_phase_note WHERE id = ${note.id} FOR UPDATE`;
          const last = await tx.sfPhaseNoteImage.aggregate({ where: { note_id: note.id }, _count: { _all: true }, _max: { sort_order: true } });
          if (last._count._all >= NOTE_IMAGE_LIMIT) throw invalid("NOTE_IMAGE_LIMIT", `A note holds at most ${NOTE_IMAGE_LIMIT} images.`);
          const image = await tx.sfPhaseNoteImage.create({
            data: { note_id: note.id, storage_key: key, content_type: input.file.contentType, bytes, sort_order: (last._max.sort_order ?? 0) + 1, uploaded_by_id: input.actor.userId!, uploaded_by_name: input.actor.label },
            select: { id: true },
          });
          await audit(tx, input.actor, "image-added", phase, note.id, { imageId: image.id, bytes });
          return { noteId: note.id, imageId: image.id };
        });
      } catch (error) {
        await discardObjects(db, ports.storage, [key]);
        throw error;
      }
    },
    /** Removes one image; a message left with no text and no image is removed with it. */
    async removePhaseNoteImage(input: NoteInput & { imageId: string }) {
      const result = await runTransaction(async (tx) => {
        const phase = await writablePhase(tx, input);
        const image = await tx.sfPhaseNoteImage.findFirst({ where: { id: input.imageId, note: { phase_id: phase.id } }, select: { id: true, note_id: true, storage_key: true, note: { select: { body: true } } } });
        if (!image) throw new AppError("NOT_FOUND", "NOTE_IMAGE_NOT_FOUND", "This image no longer exists.");
        await tx.sfPhaseNoteImage.delete({ where: { id: image.id } });
        const emptied = !image.note.body && (await tx.sfPhaseNoteImage.count({ where: { note_id: image.note_id } })) === 0;
        if (emptied) await tx.sfPhaseNote.delete({ where: { id: image.note_id } });
        await audit(tx, input.actor, emptied ? "deleted" : "image-removed", phase, image.note_id, { imageId: image.id });
        return { noteId: image.note_id, imageId: image.id, noteRemoved: emptied, keys: await enqueueUnreferencedCleanup(tx, [image.storage_key]) };
      });
      await discardObjects(db, ports.storage, result.keys);
      return { noteId: result.noteId, imageId: result.imageId, noteRemoved: result.noteRemoved };
    },

    /** A phase's messages, oldest first (the newest sit next to the composer), each with its iteration label. */
    async readPhaseNotes(phaseId: string, prefix: string, kinds: readonly string[]) {
      const rows = await db.sfPhaseNote.findMany({
        where: { phase_id: phaseId },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        include: { images: NOTE_IMAGES_SELECT, iteration: { select: { id: true, major: true, name: true } } },
      });
      return Promise.all(rows.map(async (row) => ({
        id: row.id,
        body: row.body,
        starred: row.is_starred,
        clientFeedback: row.is_client_feedback,
        authorId: row.author_id,
        authorName: row.author_name,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        iterationId: row.iteration_id,
        iterationLabel: row.iteration ? iterationShortName(row.iteration.name, prefix, row.iteration, kinds.includes(row.iteration.name)) : null,
        images: await signImages(row.images),
      })));
    },

    /** Every phase's starred messages, for the project card's pinned-notes dialog. Text only; images open on the phase page. */
    async listStarredPhaseNotes(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const phases = await db.sfPhase.findMany({
        where: { project_id: input.projectId },
        orderBy: { order_index: "asc" },
        select: {
          id: true, name_snapshot: true, prefix_snapshot: true,
          definition: { select: { default_iteration_kinds: true } },
          notes: { where: { is_starred: true }, orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { id: true, body: true, created_at: true, author_name: true, _count: { select: { images: true } }, iteration: { select: { major: true, name: true } } } },
        },
      });
      return phases.map((phase) => {
        const kinds = iterationKinds(phase.definition.default_iteration_kinds);
        return {
          phaseId: phase.id,
          phaseName: phase.name_snapshot,
          notes: phase.notes.map((note) => ({
            id: note.id, body: note.body, createdAt: note.created_at, authorName: note.author_name, imageCount: note._count.images,
            iterationLabel: note.iteration ? iterationShortName(note.iteration.name, phase.prefix_snapshot, note.iteration, kinds.includes(note.iteration.name)) : null,
          })),
        };
      });
    },
  };
}
