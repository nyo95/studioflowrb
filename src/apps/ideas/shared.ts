import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import type { ObjectStorage } from "@platform/core/storage";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import type { StudioFlowIdeasBridge } from "@/apps/studioflow/public/ideas-bridge";

export type IdeasDb = PrismaClient;
export type IdeasTx = Prisma.TransactionClient;
export type IdeasContext = { grants: PermissionGrants; actor: AuditActor };
export type IdeasPorts = {
  runTransaction: <T>(work: (tx: IdeasTx) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  storage: ObjectStorage;
  studioFlow: StudioFlowIdeasBridge;
  addStoredImageToMoodboard(input: IdeasContext & { projectId: string; source: { key: string; contentType: string } }): Promise<{ boardId: string; slideId: string; created: boolean }>;
};

export function requireIdeas(input: IdeasContext): string {
  requirePermission(input.grants, STUDIOFLOW_PERMISSIONS.access);
  requirePermission(input.grants, STUDIOFLOW_PERMISSIONS.ideasManage);
  if (input.actor.kind !== "USER" || !input.actor.userId) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  return input.actor.userId;
}

export function invalid(code: string, message: string): AppError {
  return new AppError("VALIDATION", code, message);
}

export function notFound(): AppError {
  return new AppError("NOT_FOUND", "IDEA_CARD_NOT_FOUND", "This idea card no longer exists.");
}

export async function writeIdeasAudit(ports: IdeasPorts, tx: IdeasTx, input: { action: string; entityId: string; actor: AuditActor; changes?: Record<string, { from: unknown; to: unknown }>; metadata?: Record<string, unknown> }) {
  await ports.auditWriter.write(prepareAuditEvent({ appId: "ideas", entityType: "idea-card", ...input }), tx);
}
