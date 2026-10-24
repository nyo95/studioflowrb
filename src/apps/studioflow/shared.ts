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
/** Project work-section reads need caller identity as well as grants so assignment is enforced at the service boundary. */
export type WorkSectionReadContext = ReadContext & { actorId: string };

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
  canSeeWorkSections: boolean;
  /** Invited to this project's book by a PIC (never true for a PIC; a PIC reads the book as a PIC). */
  isBookMember: boolean;
  /**
   * May read and write the project's private book (WO-SF-BOOK-01): a PIC or an invited member, nobody else. Managers,
   * override holders and the Platform Owner are not book readers; they see workflow records only.
   */
  canReadBook: boolean;
  /** A completed project is read-only for everyone until it is reopened (owner, 2026-10-04). */
  completed: boolean;
  isDesigner: boolean;
  isDrafter: boolean;
  canEditProject: boolean;
  canEditDocuments: boolean;
  phases: Array<{ phaseId: string; canTransition: boolean; canEditContent: boolean }>;
};

/**
 * The one override rule: acting for an absent PIC on any project needs `project.manage` and `project.override` together
 * (the role editor always grants them as a pair; the Manager profile and the Platform Owner hold both). `project.override`
 * alone gives nothing, so a half-configured role can never widen anyone's reach.
 */
export function hasProjectAssignmentOverride(grants: PermissionGrants): boolean {
  return hasPermission(grants, P.projectManage) && hasPermission(grants, P.projectOverride);
}

type ProjectAccessFacts = {
  status: string;
  pic_designer_id: string | null;
  pic_drafter_id: string | null;
  phases: Array<{ id: string; seat_snapshot: string }>;
  /** The actor's own membership row, if any; omitted by callers that only evaluate PIC/manager facts. */
  book_members?: Array<{ user_id: string }>;
};

/** The relation select that gives `projectAccessFromFacts` the actor's own membership. */
export function bookMemberFact(actorId: string) {
  return { where: { user_id: actorId }, select: { user_id: true } } as const;
}

/**
 * The one reader predicate for lists of workspace cards: workflow records are the project's official history and stay
 * visible to anyone who may see the project's work sections; every other card needs a book reader (PIC or member).
 * Mirrors `ProjectAccess.canReadBook`; a test keeps the two in step.
 */
export function visibleBookCardsWhere(actorId: string): Prisma.SfWorkspaceCardWhereInput {
  return { OR: [{ workflow_record: true }, { project: { OR: [{ pic_designer_id: actorId }, { pic_drafter_id: actorId }, { book_members: { some: { user_id: actorId } } }] } }] };
}

/** The single StudioFlow PIC-assignment policy, evaluated from already-read project facts. */
export function projectAccessFromFacts(project: ProjectAccessFacts, input: { grants: PermissionGrants; actorId: string }): ProjectAccess {
  const manager = hasPermission(input.grants, P.projectManage);
  const override = hasProjectAssignmentOverride(input.grants);
  const isDesigner = project.pic_designer_id === input.actorId;
  const isDrafter = project.pic_drafter_id === input.actorId;
  const isBookMember = !isDesigner && !isDrafter && Boolean(project.book_members?.some((member) => member.user_id === input.actorId));
  const completed = project.status === "COMPLETED";
  const open = !completed;
  return {
    override,
    canSeeWorkSections: isDesigner || isDrafter || manager || isBookMember,
    isBookMember,
    canReadBook: isDesigner || isDrafter || isBookMember,
    completed,
    isDesigner,
    isDrafter,
    canEditProject: open && manager,
    canEditDocuments: open && (override || isDesigner || isDrafter),
    phases: project.phases.map((phase) => ({
      phaseId: phase.id,
      canTransition: open && (override || isDesigner || (isDrafter && phase.seat_snapshot === "drafter")),
      canEditContent: open && (override || isDesigner || (isDrafter && phase.seat_snapshot === "drafter")),
    })),
  };
}

/** The single StudioFlow PIC-assignment policy (WO-SF-ACCESS-01). */
export async function getProjectAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string }): Promise<ProjectAccess> {
  const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { status: true, pic_designer_id: true, pic_drafter_id: true, phases: { select: { id: true, seat_snapshot: true } }, book_members: bookMemberFact(input.actorId) } });
  if (!project) throw notFound("project");
  return projectAccessFromFacts(project, input);
}

/** Hidden work sections must also stay private through cross-module image sources. */
export async function requireWorkSectionAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string }): Promise<ProjectAccess> {
  const access = await getProjectAccess(tx, input);
  if (!access.canSeeWorkSections) throw new AppError("FORBIDDEN", "PERMISSION_DENIED", "This project's work sections are restricted to its assigned team, invited members and managers.");
  return access;
}

/**
 * One stored note image for another module. A workflow record's image reads for anyone who sees the work sections;
 * every other image only for a book reader, and a hidden image answers exactly like a missing one.
 */
export async function readNoteImageObject(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string; phaseId?: string | null; imageId: string }) {
  const access = await requireWorkSectionAccess(tx, input);
  const image = await tx.sfWorkspaceCard.findFirst({
    where: { id: input.imageId, kind: "IMAGE", project_id: input.projectId, ...(access.canReadBook ? {} : { workflow_record: true }), ...(input.phaseId ? { phase_id: input.phaseId } : {}) },
    select: { id: true, storage_key: true, content_type: true, bytes: true, project: { select: { name: true } } },
  });
  if (!image?.storage_key || !image.content_type || image.bytes === null) throw new AppError("NOT_FOUND", "NOTE_IMAGE_NOT_FOUND", "This note image no longer exists.");
  return { id: image.id, key: image.storage_key, contentType: image.content_type, bytes: image.bytes, projectName: image.project.name };
}

export function bookForbidden(): AppError {
  return new AppError("FORBIDDEN", "PERMISSION_DENIED", "This project's book is private to its designer, drafter and the people they invited.");
}

/** Reads and writes of the private book: a PIC or an invited member. */
export async function requireBookAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string }): Promise<ProjectAccess> {
  const access = await getProjectAccess(tx, input);
  if (!access.canReadBook) throw bookForbidden();
  return access;
}

/** Project detail is confidential: the directory is broad, but detail belongs to the assigned team and Studio Managers. */
export async function requireProjectDetailAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string }): Promise<ProjectAccess> {
  requireRead(input.grants);
  return requireWorkSectionAccess(tx, input);
}

/** Who may mark a project completed or reopen it: either PIC, or an override holder. */
export function canChangeCompletion(access: ProjectAccess): boolean {
  return access.override || access.isDesigner || access.isDrafter;
}

/** `allowCompleted` (project-level checks only) lets a PIC archive, restore or reopen a completed project. */
export async function requireProjectAccess(tx: Db | TxClient, input: { grants: PermissionGrants; actorId: string; projectId: string; kind: "project" | "document" | "transition" | "content"; phaseId?: string | null; allowCompleted?: boolean }): Promise<ProjectAccess> {
  const access = await getProjectAccess(tx, input);
  if (access.completed && !(input.allowCompleted && input.kind === "project")) throw projectCompletedError();
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

export function projectCompletedError(): AppError {
  return conflict("PROJECT_COMPLETED", "This project is completed. Reopen it before making changes.");
}

/** Archived and completed projects take no changes; reopening is the only way back (owner, 2026-10-04). */
export function assertProjectWritable(project: { archived_at: Date | null; status: string }, options: { allowCompleted?: boolean } = {}): void {
  if (project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
  if (!options.allowCompleted && project.status === "COMPLETED") throw projectCompletedError();
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

/** Archived (contract §4.4) and completed projects are read-only everywhere. Only the completion
 * commands themselves pass `allowCompleted`, so a completed project can be reopened. */
export async function loadWritableProject(tx: TxClient, projectId: string, options: { allowCompleted?: boolean } = {}) {
  const project = await tx.sfProject.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("project");
  assertProjectWritable(project, options);
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
