import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";
import { hasPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import type { PeopleDirectory } from "@platform/core/rbac/people";

import { STUDIOFLOW_PERMISSIONS } from "./permissions";

export type TxClient = Prisma.TransactionClient;
export type Db = PrismaClient;

export type StudioFlowPorts = {
  runTransaction: <T>(work: (tx: TxClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  people: PeopleDirectory;
  now?: () => Date;
};

export type CommandContext = { grants: PermissionGrants; actor: AuditActor };
export type ReadContext = { grants: PermissionGrants };

export const P = STUDIOFLOW_PERMISSIONS;
export { hasPermission, requirePermission };

export function nowOf(ports: StudioFlowPorts): Date {
  return ports.now ? ports.now() : new Date();
}

export function requireRead(grants: PermissionGrants): void {
  requirePermission(grants, P.access);
  requirePermission(grants, P.projectRead);
}

export function requireCommand(ctx: CommandContext, permission: string): string {
  requirePermission(ctx.grants, P.access);
  requirePermission(ctx.grants, permission);
  if (ctx.actor.kind !== "USER" || !ctx.actor.userId) {
    throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
  }
  return ctx.actor.userId;
}

export function notFound(entity: string): AppError {
  return new AppError("NOT_FOUND", `${entity.toUpperCase().replace(/\s+/g, "_")}_NOT_FOUND`, `This ${entity} no longer exists.`);
}

export function invalid(code: string, message: string): AppError {
  return new AppError("VALIDATION", code, message);
}

export function conflict(code: string, message: string): AppError {
  return new AppError("CONFLICT", code, message);
}

export function mapWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) throw mapPrismaKnownError(error);
  throw error;
}

export async function writeAudit(
  ports: StudioFlowPorts,
  tx: TxClient,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    actor: AuditActor;
    changes?: Record<string, { from: unknown; to: unknown }>;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ports.auditWriter.write(prepareAuditEvent({ appId: "studioflow", ...input }), tx);
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

/** Archived projects are read-only everywhere (contract §4.4). */
export async function loadWritableProject(tx: TxClient, projectId: string) {
  const project = await tx.sfProject.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("project");
  if (project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
  return project;
}
