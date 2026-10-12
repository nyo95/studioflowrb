import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { hasPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import type { ObjectStorage } from "@platform/core/storage";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import type { StudioFlowPresentationBridge } from "@/apps/studioflow/public/presentation-bridge";

export type PresentationDb = PrismaClient;
export type PresentationTx = Prisma.TransactionClient;
export type PresentationReadContext = { grants: PermissionGrants; actorId: string };
export type PresentationCommandContext = { grants: PermissionGrants; actor: AuditActor };
export type PresentationPorts = {
  runTransaction: <T>(work: (tx: PresentationTx) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  storage: ObjectStorage;
  studioFlow: StudioFlowPresentationBridge;
};

export function requirePresentationRead(input: PresentationReadContext): void {
  requirePermission(input.grants, STUDIOFLOW_PERMISSIONS.access);
  requirePermission(input.grants, STUDIOFLOW_PERMISSIONS.projectRead);
}

export function requirePresentationCommand(input: PresentationCommandContext): string {
  requirePermission(input.grants, STUDIOFLOW_PERMISSIONS.access);
  requirePermission(input.grants, STUDIOFLOW_PERMISSIONS.presentationManage);
  if (input.actor.kind !== "USER" || !input.actor.userId) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  return input.actor.userId;
}

export { hasPermission };

export function invalid(code: string, message: string) {
  return new AppError("VALIDATION", code, message);
}

export function notFound(entity: string) {
  return new AppError("NOT_FOUND", `${entity.toUpperCase().replace(/\s+/g, "_")}_NOT_FOUND`, `This ${entity} no longer exists.`);
}

export function requiredText(value: string | null | undefined, code: string, label: string, max = 500): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) throw invalid(code, `${label} is required.`);
  if (text.length > max) throw invalid(code, `${label} is too long.`);
  return text;
}

export function optionalText(value: string | null | undefined, max = 2000): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw invalid("TEXT_TOO_LONG", "A text field is too long.");
  return text;
}

export async function writePresentationAudit(
  ports: PresentationPorts,
  tx: PresentationTx,
  input: { action: string; entityType: string; entityId: string; actor: AuditActor; changes?: Record<string, { from: unknown; to: unknown }>; metadata?: Record<string, unknown> },
) {
  await ports.auditWriter.write(prepareAuditEvent({ appId: "presentation", ...input }), tx);
}
