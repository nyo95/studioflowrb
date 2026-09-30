import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";
import { hasPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import type { PeopleDirectory } from "@platform/core/rbac/people";
import type { ObjectStorage } from "@platform/core/storage";
import type { NotificationWriter } from "@platform/core/notifications";
import type { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { STUDIOFLOW_PERMISSIONS } from "./permissions";

export type TxClient = Prisma.TransactionClient;
export type Db = PrismaClient;

/** Facts about a new physical-sample request, given to the notifier inside the request's own transaction. */
export type SampleRequestedEvent = {
  requestId: string;
  projectId: string;
  projectName: string;
  productName: string;
  requestedFrom: string;
  requestedById: string;
  requestedByName: string;
};

export type StudioFlowPorts = {
  runTransaction: <T>(work: (tx: TxClient) => Promise<T>) => Promise<T>;
  auditWriter: AuditWriter;
  people: PeopleDirectory;
  /** Private object storage (MOM images). */
  storage: ObjectStorage;
  /** Public Master Data reads used only for typed snapshots, never FK ownership. */
  masterData: ReturnType<typeof createMasterDataPublicRead>;
  /** Tells the people who work sample requests. Optional so the service runs, and is tested, without notifications. */
  sampleRequestNotifier?: { requested(tx: TxClient, event: SampleRequestedEvent): Promise<void> };
  /** Optional because isolated service tests do not need the inbox adapter. */
  notificationWriter?: NotificationWriter;
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

export type ProjectAccess = {
  override: boolean;
  isDesigner: boolean;
  isDrafter: boolean;
  canEditProject: boolean;
  canEditDocuments: boolean;
  phases: Array<{ phaseId: string; canTransition: boolean; canEditContent: boolean }>;
};

/** The single StudioFlow PIC-assignment policy (WO-SF-ACCESS-01). */
export async function getProjectAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string }): Promise<ProjectAccess> {
  const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { pic_designer_id: true, pic_drafter_id: true, phases: { select: { id: true, seat_snapshot: true } } } });
  if (!project) throw notFound("project");
  const override = hasPermission(input.grants, P.projectOverride);
  const isDesigner = project.pic_designer_id === input.actorId;
  const isDrafter = project.pic_drafter_id === input.actorId;
  return {
    override,
    isDesigner,
    isDrafter,
    canEditProject: override || isDesigner,
    canEditDocuments: override || isDesigner || isDrafter,
    phases: project.phases.map((phase) => ({
      phaseId: phase.id,
      canTransition: override || isDesigner || (isDrafter && phase.seat_snapshot === "drafter"),
      canEditContent: override || isDesigner || (isDrafter && phase.seat_snapshot === "drafter"),
    })),
  };
}

export async function requireProjectAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string; kind: "project" | "document" | "transition" | "content"; phaseId?: string | null }): Promise<ProjectAccess> {
  const access = await getProjectAccess(tx, input);
  const permitted = input.kind === "project" ? access.canEditProject
    : input.kind === "document" ? access.canEditDocuments
      : input.kind === "transition" ? access.phases.some((phase) => phase.phaseId === input.phaseId && phase.canTransition)
        : access.phases.some((phase) => phase.phaseId === input.phaseId && phase.canEditContent);
  if (!permitted) throw new AppError("FORBIDDEN", "PERMISSION_DENIED", "Only the project's assigned designer or drafter can change this.");
  return access;
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

/** Phase must exist, belong to a writable project, and be modifiable. */
export async function loadWritablePhase(tx: TxClient, projectId: string, phaseId: string) {
  const phase = await tx.sfPhase.findUnique({ where: { id: phaseId } });
  if (!phase || phase.project_id !== projectId) throw notFound("phase");
  await loadWritableProject(tx, projectId);
  if (phase.is_locked) throw conflict("PHASE_LOCKED", "This phase is approved and locked. Reopen it first.");
  return phase;
}
