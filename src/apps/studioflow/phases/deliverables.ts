import { createPrivateObjectKey } from "@platform/core/storage";

import {
  P,
  conflict,
  hasPermission,
  invalid,
  loadWritablePhase,
  loadWritableProject,
  notFound,
  nowOf,
  requireCommand,
  requirePermission,
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

const OPEN_ITERATION_STATES: Array<"NOT_SENT" | "SENT" | "ANSWERED"> = ["NOT_SENT", "SENT", "ANSWERED"];

export function createDeliverableService(
  db: Db,
  ports: StudioFlowPorts,
  activeRevision: (tx: TxClient | Db, phaseId: string) => Promise<{ id: string } | null>,
) {
  const { runTransaction } = ports;
// ── Deliverables ─────────────────────────────────────────────────────────

const DELIVERABLE_SIGNED_URL_SECONDS = 3600;
const DELIVERABLE_ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/zip": "zip",
};
const DEFAULT_DELIVERABLE_MAX_BYTES = 500 * 1024 * 1024;
const DELIVERABLE_RETENTION_DAYS = 30;
const DELIVERABLE_WARNING_DAYS = 7;
const DELIVERABLE_SWEEP_BATCH = 100;

function deliverableMaxBytes(value = process.env.STUDIOFLOW_DELIVERABLE_MAX_BYTES): number {
  const parsed = Number(value);
  // file_size_bytes is a 32-bit column, so the limit can never exceed it.
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 2_147_483_647) : DEFAULT_DELIVERABLE_MAX_BYTES;
}

function slotKey(name: string): string { return name.trim().toLowerCase(); }
function expiryFrom(date: Date): Date { return new Date(date.getTime() + DELIVERABLE_RETENTION_DAYS * 86_400_000); }

async function saveDeliverable(
  input: CommandContext & { projectId: string; phaseId: string },
  name: string,
  extension: string,
  contentType: string,
  declaredBytes: number,
  store: (key: string) => Promise<{ bytes: number }>,
) {
  // Authorize before accepting bytes so a rejected request cannot leave an object behind.
  await runTransaction(async (tx) => {
    const phase = await loadWritablePhase(tx, input.projectId, input.phaseId);
    await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: phase.id, kind: "content" });
    if (!(await activeRevision(tx, phase.id))) throw invalid("ACTIVE_REVISION_REQUIRED", "Start this phase before uploading deliverables.");
  });
  const key = createPrivateObjectKey(`studioflow/deliverables/${input.projectId}`, extension);
  let stored: { bytes: number };
  try {
    stored = await store(key);
    if (stored.bytes > deliverableMaxBytes() || stored.bytes === 0) throw invalid("DELIVERABLE_SIZE", "File exceeds the allowed size.");
    if (stored.bytes !== declaredBytes) throw invalid("DELIVERABLE_INCOMPLETE", "The upload did not arrive completely. Try again.");
    const pruned = await runTransaction(async (tx) => {
      const phase = await loadWritablePhase(tx, input.projectId, input.phaseId);
      await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: phase.id, kind: "content" });
      const revision = await activeRevision(tx, phase.id);
      if (!revision) throw invalid("ACTIVE_REVISION_REQUIRED", "Start this phase before uploading deliverables.");
      const created = await tx.sfDeliverable.create({ data: { project_id: input.projectId, phase_id: input.phaseId, revision_id: revision.id, name, slot_key: slotKey(name), storage_key: key, file_size_bytes: stored.bytes, content_type: contentType, created_by_id: input.actor.userId, expires_at: expiryFrom(nowOf(ports)) } });
      const older = await tx.sfDeliverable.findMany({ where: { phase_id: input.phaseId, slot_key: created.slot_key, is_final: false }, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: 2, select: { id: true, storage_key: true } });
      if (older.length) await tx.sfDeliverable.deleteMany({ where: { id: { in: older.map((row) => row.id) } } });
      await writeAudit(ports, tx, { action: "studioflow.deliverable.uploaded", entityType: "deliverable", entityId: created.id, actor: input.actor, metadata: { projectId: input.projectId, phaseId: input.phaseId, name, bytes: stored.bytes, declaredBytes, pruned: older.length } });
      return enqueueUnreferencedCleanup(tx, older.map((row) => row.storage_key));
    });
    await discardObjects(db, ports.storage, pruned);
  } catch (error) {
    // No row ever committed for this key; a failed removal is still recorded for retry.
    await discardObjects(db, ports.storage, [key]);
    throw error;
  }
  return { phaseId: input.phaseId };
}

/** R2.4C: Reference revision = active revision, or latest completed if no active. */
async function referenceRevisionId(tx: TxClient, phaseId: string): Promise<string | null> {
  const active = await tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: { in: OPEN_ITERATION_STATES } }, select: { id: true } });
  if (active) return active.id;
  const latest = await tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: { in: ["DONE", "REVISED"] } }, orderBy: { major: "desc" }, select: { id: true } });
  return latest?.id ?? null;
}

/** R2.4D: Deliverable status computed in service, not UI. */
function computeDeliverableStatus(deliverables: { revision_id: string | null }[], refRevisionId: string | null): "MISSING" | "CURRENT" | "OUTDATED" {
  if (deliverables.length === 0 || !refRevisionId) return "MISSING";
  const hasCurrent = deliverables.some((d) => d.revision_id === refRevisionId);
  return hasCurrent ? "CURRENT" : "OUTDATED";
}

const deliverables = {
  async listDeliverables(input: ReadContext & { projectId: string; phaseId: string }) {
    requireRead(input.grants);
    const rows = await db.sfDeliverable.findMany({
      where: { project_id: input.projectId, phase_id: input.phaseId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    const refId = await referenceRevisionId(db, input.phaseId);
    const status = computeDeliverableStatus(rows, refId);
    const slotVersions = new Map<string, number>();
    const now = nowOf(ports);
    const items = await Promise.all(
      rows.map(async (d) => {
        const versionNumber = (slotVersions.get(d.slot_key) ?? 0) + 1;
        slotVersions.set(d.slot_key, versionNumber);
        return {
        id: d.id,
        name: d.name,
        contentType: d.content_type,
        fileSizeBytes: d.file_size_bytes,
        revisionId: d.revision_id,
        createdAt: d.created_at,
        isFinal: d.is_final,
        expiresAt: d.expires_at,
        daysLeft: d.expires_at ? Math.max(0, Math.ceil((d.expires_at.getTime() - now.getTime()) / 86_400_000)) : null,
        versionNumber,
        url: await ports.storage.createSignedReadUrl(d.storage_key, DELIVERABLE_SIGNED_URL_SECONDS),
      }; }),
    );
    return { items, status, referenceRevisionId: refId };
  },

  async uploadDeliverable(input: CommandContext & { projectId: string; phaseId: string; name: string; file: { body: Uint8Array; contentType: string } }) {
    requireCommand(input, P.phaseWork);
    const name = requiredText(input.name, "DELIVERABLE_NAME_REQUIRED", "File name", 200);
    const ext = DELIVERABLE_ALLOWED_TYPES[input.file.contentType];
    if (!ext) throw invalid("DELIVERABLE_TYPE", "Unsupported file type.");
    const bytes = input.file.body.byteLength;
    if (bytes === 0 || bytes > deliverableMaxBytes()) throw invalid("DELIVERABLE_SIZE", "File exceeds the allowed size.");

    return saveDeliverable(input, name, ext, input.file.contentType, bytes, async (key) => ports.storage.put({ key, contentType: input.file.contentType, bytes, body: input.file.body }));
  },

  async uploadDeliverableStream(input: CommandContext & { projectId: string; phaseId: string; name: string; contentType: string; stream: ReadableStream<Uint8Array>; declaredBytes: number }) {
    requireCommand(input, P.phaseWork);
    const name = requiredText(input.name, "DELIVERABLE_NAME_REQUIRED", "File name", 200);
    const ext = DELIVERABLE_ALLOWED_TYPES[input.contentType];
    if (!ext) throw invalid("DELIVERABLE_TYPE", "Unsupported file type.");
    const maxBytes = deliverableMaxBytes();
    if (!Number.isSafeInteger(input.declaredBytes) || input.declaredBytes <= 0 || input.declaredBytes > maxBytes) throw invalid("DELIVERABLE_SIZE", "File exceeds the allowed size.");
    return saveDeliverable(input, name, ext, input.contentType, input.declaredBytes, async (key) => ports.storage.putStream({ key, contentType: input.contentType, stream: input.stream, maxBytes }));
  },

  async setDeliverableFinal(input: CommandContext & { projectId: string; deliverableId: string; isFinal: boolean }) {
    requireCommand(input, P.access);
    return runTransaction(async (tx) => {
      const d = await tx.sfDeliverable.findUnique({ where: { id: input.deliverableId } });
      if (!d || d.project_id !== input.projectId) throw notFound("deliverable");
      await loadWritableProject(tx, input.projectId);
      if (hasPermission(input.grants, P.projectManage)) {
        // Project managers may finalise any phase in the project.
      } else {
        requirePermission(input.grants, P.phaseWork);
        await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: d.phase_id, kind: "content" });
      }
      const at = nowOf(ports);
      if (input.isFinal) {
        const previousFinals = await tx.sfDeliverable.findMany({ where: { phase_id: d.phase_id, slot_key: d.slot_key, is_final: true, id: { not: d.id } }, select: { id: true, name: true } });
        await tx.sfDeliverable.updateMany({ where: { id: { in: previousFinals.map((row) => row.id) } }, data: { is_final: false, finalized_at: null, finalized_by_id: null, expires_at: expiryFrom(at), expiry_warned_at: null } });
        for (const previous of previousFinals) await writeAudit(ports, tx, { action: "studioflow.deliverable.final-cleared", entityType: "deliverable", entityId: previous.id, actor: input.actor, metadata: { projectId: d.project_id, phaseId: d.phase_id, name: previous.name, reason: "new-final" } });
        await tx.sfDeliverable.update({ where: { id: d.id }, data: { is_final: true, finalized_at: at, finalized_by_id: input.actor.userId, expires_at: null, expiry_warned_at: null } });
      } else {
        await tx.sfDeliverable.update({ where: { id: d.id }, data: { is_final: false, finalized_at: null, finalized_by_id: null, expires_at: expiryFrom(at), expiry_warned_at: null } });
      }
      await writeAudit(ports, tx, { action: `studioflow.deliverable.${input.isFinal ? "finalized" : "final-cleared"}`, entityType: "deliverable", entityId: d.id, actor: input.actor, metadata: { projectId: d.project_id, phaseId: d.phase_id, name: d.name } });
      return { deliverableId: d.id, isFinal: input.isFinal };
    });
  },

  async extendDeliverableExpiry(input: CommandContext & { projectId: string; deliverableId: string }) {
    requireCommand(input, P.phaseWork);
    return runTransaction(async (tx) => {
      const d = await tx.sfDeliverable.findUnique({ where: { id: input.deliverableId } });
      if (!d || d.project_id !== input.projectId) throw notFound("deliverable");
      if (d.is_final) throw conflict("DELIVERABLE_FINAL", "A final file does not expire.");
      await loadWritableProject(tx, input.projectId);
      await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: d.phase_id, kind: "content" });
      const expiresAt = expiryFrom(nowOf(ports));
      await tx.sfDeliverable.update({ where: { id: d.id }, data: { expires_at: expiresAt, expiry_warned_at: null } });
      await writeAudit(ports, tx, { action: "studioflow.deliverable.expiry-extended", entityType: "deliverable", entityId: d.id, actor: input.actor, metadata: { projectId: d.project_id, phaseId: d.phase_id, expiresAt: expiresAt.toISOString() } });
      return { deliverableId: d.id, expiresAt };
    });
  },

  async sweepDeliverableExpiry() {
    const now = nowOf(ports);
    const expired = await runTransaction(async (tx) => {
      const rows = await tx.sfDeliverable.findMany({ where: { is_final: false, expires_at: { lt: now } }, orderBy: [{ expires_at: "asc" }, { id: "asc" }], take: DELIVERABLE_SWEEP_BATCH, include: { phase: { select: { name_snapshot: true } }, project: { select: { name: true } } } });
      for (const d of rows) {
        await tx.sfDeliverable.delete({ where: { id: d.id } });
        await writeAudit(ports, tx, { action: "studioflow.deliverable.expiry-deleted", entityType: "deliverable", entityId: d.id, actor: { kind: "SYSTEM", label: "deliverable-expiry-sweep" }, metadata: { projectId: d.project_id, phaseId: d.phase_id, name: d.name } });
      }
      return { count: rows.length, keys: await enqueueUnreferencedCleanup(tx, rows.map((d) => d.storage_key)) };
    });
    await discardObjects(db, ports.storage, expired.keys);
    const warningUntil = new Date(now.getTime() + DELIVERABLE_WARNING_DAYS * 86_400_000);
    const warnings = await runTransaction(async (tx) => {
      const rows = await tx.sfDeliverable.findMany({ where: { is_final: false, expires_at: { gte: now, lte: warningUntil }, expiry_warned_at: null, created_by_id: { not: null } }, orderBy: [{ expires_at: "asc" }, { id: "asc" }], take: DELIVERABLE_SWEEP_BATCH, include: { phase: { select: { name_snapshot: true } }, project: { select: { name: true } } } });
      for (const d of rows) {
        if (ports.notificationWriter && d.created_by_id && d.expires_at) await ports.notificationWriter.notify({ recipientUserIds: [d.created_by_id], appId: "studioflow", kind: "studioflow.deliverable.expiring", title: `File expires soon: ${d.name}`, body: `${d.name} in ${d.phase.name_snapshot} for ${d.project.name} expires on ${d.expires_at.toISOString().slice(0, 10)}.`, href: `/studioflow/projects/${d.project_id}`, entity: { type: "deliverable", id: d.id } }, tx);
        await tx.sfDeliverable.update({ where: { id: d.id }, data: { expiry_warned_at: now } });
      }
      return rows.length;
    });
    return { deleted: expired.count, warned: warnings };
  },

  async deleteDeliverable(input: CommandContext & { projectId: string; deliverableId: string }) {

    requireCommand(input, P.projectManage);
    const keys = await runTransaction(async (tx) => {
      const d = await tx.sfDeliverable.findUnique({ where: { id: input.deliverableId }, select: { id: true, project_id: true, phase_id: true, storage_key: true } });
      if (!d || d.project_id !== input.projectId) throw notFound("deliverable");
      await loadWritableProject(tx, input.projectId);
      await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: d.phase_id, kind: "content" });
      await tx.sfDeliverable.delete({ where: { id: d.id } });
      return enqueueUnreferencedCleanup(tx, [d.storage_key]);
    });
    await discardObjects(db, ports.storage, keys);
    return { deliverableId: input.deliverableId };
  },
};

  return { ...deliverables, referenceRevisionId, computeDeliverableStatus };
}
