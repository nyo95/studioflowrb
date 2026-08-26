import type { Prisma } from "@/generated/prisma/client";
import type { AuditTransactionContext, AuditWriter, SerializedAuditEvent } from "./index";

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
