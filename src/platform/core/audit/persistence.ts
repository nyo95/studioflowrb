import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AuditAppId, AuditTransactionContext, AuditWriter, SerializedAuditEvent } from "./index";

/** Domain-neutral adapter for the single append-only platform AuditEvent store. */
export function createAuditEventWriter(): AuditWriter {
  return {
    async write(event: SerializedAuditEvent, tx: AuditTransactionContext): Promise<void> {
      await tx.auditEvent.create({ data: {
        app_id: event.appId, action: event.action, entity_type: event.entityType, entity_id: event.entityId,
        actor_kind: event.actor.kind, actor_user_id: event.actor.userId ?? null, actor_label: event.actor.label,
        occurred_at: new Date(event.occurredAt), request_id: event.requestId ?? null,
        changes: event.changes === undefined ? undefined : event.changes as Prisma.InputJsonValue,
        metadata: event.metadata === undefined ? undefined : event.metadata as Prisma.InputJsonValue,
      } });
    },
  };
}

/**
 * Read side of the AuditEvent store. The platform owns the table, so an app that
 * needs its own history reads it through these functions instead of naming the
 * platform schema or model itself. Both are scoped to one `appId`; neither knows
 * what an app's entity types or metadata keys mean.
 */
export type AuditReadClient = Pick<PrismaClient, "auditEvent" | "$queryRaw">;

/** One clause of an OR filter. Only the fields that are set are compared, and all set fields must match. */
export type AuditEventMatch = {
  entityType?: string;
  entityId?: string;
  /** Equality on one string value inside the event's JSON `metadata`. */
  metadata?: { path: readonly string[]; equals: string };
};

export type AuditEventRead = {
  id: string;
  action: string;
  entityType: string;
  actorLabel: string;
  occurredAt: Date;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
};

/** Newest events of one app that satisfy ANY of the given matches. An empty `anyOf` matches nothing. */
export async function listAuditEvents(
  db: AuditReadClient,
  input: { appId: AuditAppId; anyOf: readonly AuditEventMatch[]; limit: number },
): Promise<AuditEventRead[]> {
  if (input.anyOf.length === 0) return [];
  const rows = await db.auditEvent.findMany({
    where: {
      app_id: input.appId,
      OR: input.anyOf.map((match) => ({
        ...(match.entityType !== undefined ? { entity_type: match.entityType } : {}),
        ...(match.entityId !== undefined ? { entity_id: match.entityId } : {}),
        ...(match.metadata ? { metadata: { path: [...match.metadata.path], equals: match.metadata.equals } } : {}),
      })),
    },
    orderBy: { occurred_at: "desc" },
    take: input.limit,
    select: { id: true, action: true, entity_type: true, actor_label: true, occurred_at: true, changes: true, metadata: true },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    actorLabel: row.actor_label,
    occurredAt: row.occurred_at,
    changes: (row.changes ?? null) as AuditEventRead["changes"],
    metadata: (row.metadata ?? null) as AuditEventRead["metadata"],
  }));
}

/** Actor label of the most recent event per entity, for one app and entity type. Entities with no event are absent. */
export async function latestAuditActorLabels(
  db: AuditReadClient,
  input: { appId: AuditAppId; entityType: string; entityIds: readonly string[] },
): Promise<Map<string, string>> {
  if (input.entityIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ entity_id: string; actor_label: string }[]>(
    Prisma.sql`SELECT DISTINCT ON (entity_id) entity_id, actor_label FROM "platform"."AuditEvent" WHERE app_id = ${input.appId} AND entity_type = ${input.entityType} AND entity_id IN (${Prisma.join(input.entityIds)}) ORDER BY entity_id, occurred_at DESC`,
  );
  return new Map(rows.map((row) => [row.entity_id, row.actor_label]));
}
