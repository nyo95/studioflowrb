import { createPrivateObjectKey } from "@platform/core/storage";

import {
  P,
  invalid,
  loadWritablePhase,
  notFound,
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

const OPEN_ITERATION_STATES: Array<"NOT_SENT" | "SENT" | "ANSWERED"> = ["NOT_SENT", "SENT", "ANSWERED"];

export function createDeliverableService(
  db: Db,
  ports: StudioFlowPorts,
  activeRevision: (tx: TxClient | Db, phaseId: string) => Promise<{ id: string } | null>,
) {
  const { runTransaction } = ports;
  const DELIVERABLE_SIGNED_URL_SECONDS = 3600;
  const DELIVERABLE_ALLOWED_TYPES: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/zip": "zip",
  };
  const DEFAULT_DELIVERABLE_MAX_BYTES = 500 * 1024 * 1024;

  function deliverableMaxBytes(value = process.env.STUDIOFLOW_DELIVERABLE_MAX_BYTES): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 2_147_483_647) : DEFAULT_DELIVERABLE_MAX_BYTES;
  }

  /** Locks the phase so concurrent uploads replace in a stable order. */
  async function lockPhase(tx: TxClient, phaseId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "studioflow"."sf_phase" WHERE "id" = ${phaseId} FOR UPDATE`;
  }

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
      if (!(await activeRevision(tx, phase.id))) throw invalid("ACTIVE_REVISION_REQUIRED", "Open an iteration (or a new site visit) in this phase before uploading deliverables.");
    });

    const key = createPrivateObjectKey(`studioflow/deliverables/${input.projectId}`, extension);
    try {
      const stored = await store(key);
      if (stored.bytes > deliverableMaxBytes() || stored.bytes === 0) throw invalid("DELIVERABLE_SIZE", "File exceeds the allowed size.");
      if (stored.bytes !== declaredBytes) throw invalid("DELIVERABLE_INCOMPLETE", "The upload did not arrive completely. Try again.");
      const replacedKeys = await runTransaction(async (tx) => {
        const phase = await loadWritablePhase(tx, input.projectId, input.phaseId);
        await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: phase.id, kind: "content" });
        const revision = await activeRevision(tx, phase.id);
        if (!revision) throw invalid("ACTIVE_REVISION_REQUIRED", "Open an iteration (or a new site visit) in this phase before uploading deliverables.");
        await lockPhase(tx, phase.id);
        const replaced = await tx.sfDeliverable.findUnique({ where: { phase_id: phase.id }, select: { id: true, storage_key: true, name: true } });
        const current = await tx.sfDeliverable.upsert({
          where: { phase_id: phase.id },
          create: { project_id: input.projectId, phase_id: phase.id, revision_id: revision.id, name, storage_key: key, file_size_bytes: stored.bytes, content_type: contentType, created_by_id: input.actor.userId },
          update: { revision_id: revision.id, name, storage_key: key, file_size_bytes: stored.bytes, content_type: contentType, created_by_id: input.actor.userId },
        });
        await writeAudit(ports, tx, {
          action: "studioflow.deliverable.uploaded",
          entityType: "deliverable",
          entityId: current.id,
          actor: input.actor,
          metadata: { projectId: input.projectId, phaseId: phase.id, name, bytes: stored.bytes, declaredBytes, replacedDeliverableId: replaced?.id ?? null, replacedName: replaced?.name ?? null },
        });
        return enqueueUnreferencedCleanup(tx, replaced ? [replaced.storage_key] : []);
      });
      await discardObjects(db, ports.storage, replacedKeys);
    } catch (error) {
      // The new key was never committed, or the transaction was rolled back.
      await discardObjects(db, ports.storage, [key]);
      throw error;
    }
    return { phaseId: input.phaseId };
  }

  /** Reference revision = active revision, or latest completed if no active. */
  async function referenceRevisionId(tx: TxClient | Db, phaseId: string): Promise<string | null> {
    const active = await tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: { in: OPEN_ITERATION_STATES } }, select: { id: true } });
    if (active) return active.id;
    const latest = await tx.sfRevision.findFirst({ where: { phase_id: phaseId, status: { in: ["DONE", "REVISED"] } }, orderBy: { major: "desc" }, select: { id: true } });
    return latest?.id ?? null;
  }

  function computeDeliverableStatus(deliverables: { revision_id: string | null }[], refRevisionId: string | null): "MISSING" | "CURRENT" | "OUTDATED" {
    if (deliverables.length === 0 || !refRevisionId) return "MISSING";
    return deliverables.some((d) => d.revision_id === refRevisionId) ? "CURRENT" : "OUTDATED";
  }

  const deliverables = {
    async listDeliverables(input: ReadContext & { projectId: string; phaseId: string }) {
      requireRead(input.grants);
      const rows = await db.sfDeliverable.findMany({ where: { project_id: input.projectId, phase_id: input.phaseId }, orderBy: { created_at: "desc" } });
      const refId = await referenceRevisionId(db, input.phaseId);
      const status = computeDeliverableStatus(rows, refId);
      const items = await Promise.all(rows.map(async (d) => ({
        id: d.id,
        name: d.name,
        contentType: d.content_type,
        fileSizeBytes: d.file_size_bytes,
        revisionId: d.revision_id,
        createdAt: d.created_at,
        url: await ports.storage.createSignedReadUrl(d.storage_key, DELIVERABLE_SIGNED_URL_SECONDS),
      })));
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

    async deleteDeliverable(input: CommandContext & { projectId: string; deliverableId: string }) {
      requireCommand(input, P.projectManage);
      const keys = await runTransaction(async (tx) => {
        const d = await tx.sfDeliverable.findUnique({ where: { id: input.deliverableId }, select: { id: true, project_id: true, phase_id: true, storage_key: true, name: true } });
        if (!d || d.project_id !== input.projectId) throw notFound("deliverable");
        await loadWritablePhase(tx, input.projectId, d.phase_id);
        // Deliverable removal is the explicit Studio Manager operation. Unlike upload, it is not phase-PIC content work.
        await tx.sfDeliverable.delete({ where: { id: d.id } });
        await writeAudit(ports, tx, { action: "studioflow.deliverable.deleted", entityType: "deliverable", entityId: d.id, actor: input.actor, metadata: { projectId: d.project_id, phaseId: d.phase_id, name: d.name } });
        return enqueueUnreferencedCleanup(tx, [d.storage_key]);
      });
      await discardObjects(db, ports.storage, keys);
      return { deliverableId: input.deliverableId };
    },
  };

  return { ...deliverables, referenceRevisionId, computeDeliverableStatus };
}
