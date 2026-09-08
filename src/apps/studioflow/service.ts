/**
 * StudioFlow service — permissions and domain logic.
 *
 * Permissions: studioflow.md §3.
 * Client: project-contract.md §2.
 * Project + Phase seeding: project-contract.md §3–§4.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { PermissionGrants } from "@platform/core/rbac";
import type { PrismaClient } from "@/generated/prisma/client";
import type { AuditActor, AuditWriter } from "@platform/core/audit";
import { prepareAuditEvent } from "@platform/core/audit";
import { requirePermission, hasPermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";

// ── Permissions ───────────────────────────────────────────────────────────

export const STUDIOFLOW_PERMISSIONS = {
  access: "studioflow.access",
  projectRead: "studioflow.project.read",
  projectManage: "studioflow.project.manage",
  projectDeletionApprove: "studioflow.project-deletion.approve",
  iterationManage: "studioflow.iteration.manage",
  iterationReview: "studioflow.iteration.review",
  phaseOverride: "studioflow.phase.override",
  taskManage: "studioflow.task.manage",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────

type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  changes?: Record<string, unknown>;
};

export type StudioFlowServiceDeps = {
  auditWriter: AuditWriter;
  runTransaction: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T>;
};

// Input types

export type CreateClientInput = {
  name: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  notes?: string;
};

export type EditClientInput = {
  name?: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type CreateProjectInput = {
  name: string;
  client_id: string;
  lead_user_id?: string;
  location?: string;
  address?: string;
  area?: string;
  type: "RESIDENTIAL" | "COMMERCIAL" | "HOSPITALITY" | "OTHER";
  opened_at: Date;
};

export type EditProjectInput = {
  name?: string;
  lead_user_id?: string | null;
  location?: string | null;
  address?: string | null;
  area?: string | null;
  type?: "RESIDENTIAL" | "COMMERCIAL" | "HOSPITALITY" | "OTHER";
  status?: "ACTIVE" | "ON_HOLD" | "COMPLETED";
};

export type SendIterationInput = { assignee_id?: string };
export type AddIterationPointInput = { text: string };
export type WithdrawPointInput = { reason: string };


export type RecordFileInput = {
  project_id: string;
  /** Which folder (§8.2). null = unsorted tray. */
  folder_key: string | null;
  /** Original filename from the browser drop. */
  original_filename: string;
  /** File size in bytes (from browser drop). */
  bytes: number;
  file_modified_at?: Date;
};

export type UpdateNamingTemplateInput = {
  /** Token string e.g. "{date} {project} {location} {round}".
   *  Valid tokens: {date} {project} {location} {round} {code} */
  naming_template: string;
};

// ── Code generation ───────────────────────────────────────────────────────

/** Generates the next project code in format SF<YY>-<NNNN>. Runs inside tx. */
async function nextProjectCode(db: PrismaClient, year: number): Promise<string> {
  const prefix = `SF${String(year).slice(-2)}-`;
  const last = await db.sfProject.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const seq = last ? (parseInt(last.code.slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ── Service factory ───────────────────────────────────────────────────────

export function createStudioFlowService(rootDb: PrismaClient, deps: StudioFlowServiceDeps) {
  const transactionStore = new AsyncLocalStorage<PrismaClient>();

  const db = new Proxy(rootDb, {
    get(target, property, receiver) {
      const client = transactionStore.getStore() ?? target;
      const value = Reflect.get(client, property, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  }) as PrismaClient;

  const runTransaction = <T>(work: (tx: PrismaClient) => Promise<T>): Promise<T> => {
    const current = transactionStore.getStore();
    return current
      ? work(current)
      : deps.runTransaction((tx) => transactionStore.run(tx, () => work(tx)));
  };

  const writeAudit = async (input: AuditInput): Promise<void> => {
    const tx = transactionStore.getStore();
    if (!tx) throw new Error("StudioFlow audit writes require the active business transaction.");
    await deps.auditWriter.write(
      prepareAuditEvent({
        appId: "studioflow",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: input.actor,
        metadata: input.changes,
      }),
      tx,
    );
  };

  // ── Client ──────────────────────────────────────────────────────────────

  async function listClients(
    grants: PermissionGrants,
    opts?: { includeArchived?: boolean },
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfClient.findMany({
      where: opts?.includeArchived ? undefined : { deleted_at: null },
      orderBy: [{ name: "asc" }],
    });
  }

  async function getClient(grants: PermissionGrants, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const client = await db.sfClient.findUnique({ where: { id } });
    if (!client) throw new AppError("NOT_FOUND", "studioflow.client.not-found", "Client not found");
    return client;
  }

  async function createClient(
    grants: PermissionGrants,
    actor: AuditActor,
    input: CreateClientInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const client = await db.sfClient.create({
        data: {
          name: input.name.trim(),
          contact_name: input.contact_name?.trim() ?? null,
          contact_phone: input.contact_phone?.trim() ?? null,
          contact_email: input.contact_email?.trim().toLowerCase() ?? null,
          address: input.address?.trim() ?? null,
          notes: input.notes?.trim() ?? null,
        },
      });
      await writeAudit({
        action: "client.create",
        entityType: "SfClient",
        entityId: client.id,
        actor,
        changes: { name: client.name },
      });
      return client;
    });
  }

  async function editClient(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: EditClientInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfClient.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.client.not-found", "Client not found");
      if (existing.deleted_at) throw new AppError("CONFLICT", "studioflow.client.archived", "Client is archived");

      const updated = await db.sfClient.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() ?? null } : {}),
          ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() ?? null } : {}),
          ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim().toLowerCase() ?? null } : {}),
          ...(input.address !== undefined ? { address: input.address?.trim() ?? null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
        },
      });
      await writeAudit({
        action: "client.edit",
        entityType: "SfClient",
        entityId: id,
        actor,
        changes: { before: existing, after: updated },
      });
      return updated;
    });
  }

  /** Archive a client. Blocked if the client has any live (non-archived) projects. */
  async function archiveClient(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfClient.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.client.not-found", "Client not found");
      if (existing.deleted_at) throw new AppError("CONFLICT", "studioflow.client.already-archived", "Client is already archived");

      const liveProjects = await db.sfProject.count({
        where: { client_id: id, deleted_at: null },
      });
      if (liveProjects > 0) {
        throw new AppError(
          "CONFLICT",
          "studioflow.client.has-live-projects",
          "Cannot archive a client with live projects",
        );
      }

      const archived = await db.sfClient.update({
        where: { id },
        data: { deleted_at: new Date() },
      });
      await writeAudit({
        action: "client.archive",
        entityType: "SfClient",
        entityId: id,
        actor,
      });
      return archived;
    });
  }

  async function restoreClient(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfClient.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.client.not-found", "Client not found");
      if (!existing.deleted_at) throw new AppError("CONFLICT", "studioflow.client.not-archived", "Client is not archived");

      const restored = await db.sfClient.update({ where: { id }, data: { deleted_at: null } });
      await writeAudit({ action: "client.restore", entityType: "SfClient", entityId: id, actor });
      return restored;
    });
  }

  // ── Project ─────────────────────────────────────────────────────────────

  async function listProjects(
    grants: PermissionGrants,
    opts?: { includeArchived?: boolean; clientId?: string },
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfProject.findMany({
      where: {
        ...(opts?.includeArchived ? {} : { deleted_at: null }),
        ...(opts?.clientId ? { client_id: opts.clientId } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ priority: "desc" }, { opened_at: "desc" }],
    });
  }

  async function getProject(grants: PermissionGrants, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const project = await db.sfProject.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        phases: { orderBy: { sort_order: "asc" } },
      },
    });
    if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");
    return project;
  }

  /**
   * Create a project and seed its phases from the current template in the same
   * transaction. Exactly one phase per template key; order is template sort_order.
   * project.manage required; client must be live.
   */
  async function createProject(
    grants: PermissionGrants,
    actor: AuditActor,
    input: CreateProjectInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      // Verify client exists and is live
      const client = await db.sfClient.findUnique({ where: { id: input.client_id } });
      if (!client) throw new AppError("NOT_FOUND", "studioflow.client.not-found", "Client not found");
      if (client.deleted_at) throw new AppError("CONFLICT", "studioflow.client.archived", "New projects require a live client");

      // Fetch template entries
      const templates = await db.sfPhaseTemplate.findMany({ orderBy: { sort_order: "asc" } });
      if (templates.length === 0) {
        throw new AppError("INTERNAL", "studioflow.template.empty", "Phase template is empty — seed the template first");
      }

      // Generate unique code inside the transaction
      const year = input.opened_at.getFullYear();
      const code = await nextProjectCode(db, year);

      const project = await db.sfProject.create({
        data: {
          code,
          name: input.name.trim(),
          client_id: input.client_id,
          lead_user_id: input.lead_user_id ?? null,
          location: input.location?.trim() ?? null,
          address: input.address?.trim() ?? null,
          area: input.area ?? null,
          type: input.type,
          status: "ACTIVE",
          opened_at: input.opened_at,
          phases: {
            create: templates.map((t) => ({
              template_id: t.id,
              key: t.key,
              name: t.name,
              sort_order: t.sort_order,
              has_rounds: t.has_rounds,
              round_prefix: t.round_prefix,
              folder_key: t.folder_key,
              requires_internal_approval: t.requires_internal_approval,
              state: "NOT_STARTED",
            })),
          },
        },
        include: {
          client: { select: { id: true, name: true } },
          phases: { orderBy: { sort_order: "asc" } },
        },
      });

      await writeAudit({
        action: "project.create",
        entityType: "SfProject",
        entityId: project.id,
        actor,
        changes: { code: project.code, name: project.name, client_id: project.client_id },
      });

      return project;
    });
  }

  async function editProject(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: EditProjectInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfProject.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");
      if (existing.deleted_at) throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");

      const updated = await db.sfProject.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.lead_user_id !== undefined ? { lead_user_id: input.lead_user_id } : {}),
          ...(input.location !== undefined ? { location: input.location?.trim() ?? null } : {}),
          ...(input.address !== undefined ? { address: input.address?.trim() ?? null } : {}),
          ...(input.area !== undefined ? { area: input.area } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        include: {
          client: { select: { id: true, name: true } },
          phases: { orderBy: { sort_order: "asc" } },
        },
      });

      await writeAudit({
        action: "project.edit",
        entityType: "SfProject",
        entityId: id,
        actor,
        changes: { before: existing, after: updated },
      });

      return updated;
    });
  }

  // ── Phase template (read-only in WO-2; settings UI deferred) ────────────

  async function listPhaseTemplates(grants: PermissionGrants) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return db.sfPhaseTemplate.findMany({ orderBy: { sort_order: "asc" } });
  }


  // ── §5.3 Iteration numbering (concurrency-safe) ────────────────────────

  /** Allocates the next iteration number for a phase.
   *  Locks the phase row for the transaction duration.
   *  Must run inside a transaction. */
  async function nextIterationNumber(db: PrismaClient, phaseId: string): Promise<number> {
    await db.$executeRaw`SELECT 1 FROM studioflow.sf_project_phase WHERE id = ${phaseId} FOR UPDATE`;
    const agg = await db.sfIteration.aggregate({
      where: { phase_id: phaseId },
      _max: { number: true },
    });
    return (agg._max.number ?? 0) + 1;
  }

  /** §5.3: Resolve existing DRAFT or open the next number.
   *  Every trigger (Start round, first file drop) calls this.
   *  Must run inside a transaction. */
  async function resolveOrOpenDraft(
    db: PrismaClient,
    phaseId: string,
  ): Promise<{ iteration: { id: string; number: number; state: string }; opened: boolean }> {
    const existing = await db.sfIteration.findFirst({
      where: { phase_id: phaseId, state: "DRAFT" },
      select: { id: true, number: true, state: true },
    });
    if (existing) return { iteration: existing, opened: false };

    const number = await nextIterationNumber(db, phaseId);
    const iteration = await db.sfIteration.create({
      data: { phase_id: phaseId, number, state: "DRAFT" },
      select: { id: true, number: true, state: true },
    });
    return { iteration, opened: true };
  }

  // ── §4.3 Phase state projection ────────────────────────────────────────

  /** Recomputes and persists phase state for iteration-bearing phases.
   *  Supervision (has_rounds=false) manages its own state; returns immediately.
   *  Must run inside a transaction. */
  async function recomputePhaseState(db: PrismaClient, phaseId: string): Promise<void> {
    const phase = await db.sfProjectPhase.findUniqueOrThrow({
      where: { id: phaseId },
      select: { has_rounds: true, closed_at: true },
    });
    if (!phase.has_rounds) return;
    if (phase.closed_at) return;

    const sentCount = await db.sfIteration.count({
      where: { phase_id: phaseId, state: "SENT" },
    });
    if (sentCount > 0) {
      await db.sfProjectPhase.update({ where: { id: phaseId }, data: { state: "WAITING_CLIENT" } });
      return;
    }
    const anyCount = await db.sfIteration.count({ where: { phase_id: phaseId } });
    await db.sfProjectPhase.update({
      where: { id: phaseId },
      data: { state: anyCount > 0 ? "IN_PROGRESS" : "NOT_STARTED" },
    });
  }

  // ── §8.5 Filename resolution ───────────────────────────────────────────

  const VALID_TOKENS = ["{date}", "{project}", "{location}", "{round}", "{code}"] as const;

  function isValidTemplate(template: string): boolean {
    const tokenRegex = /\{[^}]+\}/g;
    for (const match of template.matchAll(tokenRegex)) {
      if (!(VALID_TOKENS as readonly string[]).includes(match[0])) return false;
    }
    return true;
  }

  function resolveFilename(
    template: string,
    project: { name: string; location: string | null; code: string },
    opts: { droppedAt: Date; phaseLabel: string | null },
    ext: string,
  ): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = opts.droppedAt;
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const name = template
      .replace("{date}", date)
      .replace("{project}", project.name)
      .replace("{location}", project.location ?? "")
      .replace("{round}", opts.phaseLabel ?? "")
      .replace("{code}", project.code)
      .replace(/  +/g, " ")
      .trim();
    return name + (ext ? (ext.startsWith(".") ? ext : `.${ext}`) : "");
  }

  // ── Studio settings ──────────────────────────────────────────────────────

  async function getStudioSettings() {
    return db.sfStudioSettings.upsert({
      where: { id: "studio" },
      create: { id: "studio" },
      update: {},
    });
  }

  async function updateNamingTemplate(
    grants: PermissionGrants,
    actor: AuditActor,
    input: UpdateNamingTemplateInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!isValidTemplate(input.naming_template)) {
      throw new AppError("VALIDATION", "studioflow.settings.invalid-template", "Template contains unknown tokens");
    }
    return runTransaction(async () => {
      const updated = await db.sfStudioSettings.upsert({
        where: { id: "studio" },
        create: { id: "studio", naming_template: input.naming_template, updated_by_id: actor.userId },
        update: { naming_template: input.naming_template, updated_by_id: actor.userId },
      });
      await writeAudit({
        action: "studio_settings.update_naming_template",
        entityType: "SfStudioSettings",
        entityId: "studio",
        actor,
        changes: { naming_template: input.naming_template },
      });
      return updated;
    });
  }

  // ── Phase queries ────────────────────────────────────────────────────────

  async function listProjectPhases(grants: PermissionGrants, projectId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfProjectPhase.findMany({
      where: { project_id: projectId },
      orderBy: { sort_order: "asc" },
      include: {
        iterations: {
          where: { state: { not: "VOIDED" } },
          orderBy: { number: "desc" },
          take: 5,
        },
      },
    });
  }

  async function getPhase(grants: PermissionGrants, projectId: string, phaseId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const phase = await db.sfProjectPhase.findFirst({
      where: { id: phaseId, project_id: projectId },
      include: { iterations: { orderBy: { number: "asc" } } },
    });
    if (!phase) throw new AppError("NOT_FOUND", "studioflow.phase.not-found", "Phase not found");
    return phase;
  }

  // ── Phase actions (iteration-bearing, §4.3) ──────────────────────────────

  async function finishPhase(grants: PermissionGrants, actor: AuditActor, phaseId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({
        where: { id: phaseId },
        select: { id: true, state: true, has_rounds: true },
      });
      if (!phase.has_rounds) {
        throw new AppError("CONFLICT", "studioflow.phase.supervision-use-supervision-actions", "Use supervision actions for this phase");
      }
      if (phase.state === "DONE") {
        throw new AppError("CONFLICT", "studioflow.phase.already-done", "Phase is already finished");
      }
      const openCount = await db.sfIteration.count({
        where: { phase_id: phaseId, state: { in: ["DRAFT", "SENT"] } },
      });
      if (openCount > 0) {
        throw new AppError("CONFLICT", "studioflow.phase.open-iterations", "Finish all open rounds before closing the phase");
      }
      const latest = await db.sfIteration.findFirst({
        where: { phase_id: phaseId, state: { not: "VOIDED" } },
        orderBy: { number: "desc" },
        select: { state: true },
      });
      if (!latest || latest.state !== "APPROVED") {
        throw new AppError("CONFLICT", "studioflow.phase.latest-round-not-approved", "The latest round must be approved to finish this phase");
      }
      const now = new Date();
      const updated = await db.sfProjectPhase.update({
        where: { id: phaseId },
        data: { state: "DONE", closed_at: now, closed_by_id: actor.userId, closure_reason: null, closure_kind: "NORMAL" },
      });
      await writeAudit({ action: "phase.finish", entityType: "SfProjectPhase", entityId: phaseId, actor, changes: { from: phase.state, to: "DONE" } });
      return updated;
    });
  }

  async function reopenPhase(grants: PermissionGrants, actor: AuditActor, phaseId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    if (!reason.trim()) throw new AppError("VALIDATION", "studioflow.phase.reopen-reason-required", "Reason is required to reopen a phase");
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({
        where: { id: phaseId },
        select: { id: true, state: true, has_rounds: true },
      });
      if (!phase.has_rounds) throw new AppError("CONFLICT", "studioflow.phase.supervision-use-supervision-actions", "Use supervision actions for this phase");
      if (phase.state !== "DONE") throw new AppError("CONFLICT", "studioflow.phase.not-done", "Phase is not finished");
      await db.sfProjectPhase.update({ where: { id: phaseId }, data: { closed_at: null, closed_by_id: null, closure_reason: null, closure_kind: null } });
      await recomputePhaseState(db, phaseId);
      await writeAudit({ action: "phase.reopen", entityType: "SfProjectPhase", entityId: phaseId, actor, changes: { from: "DONE", reason } });
      return db.sfProjectPhase.findUniqueOrThrow({ where: { id: phaseId } });
    });
  }

  async function closePhaseByException(grants: PermissionGrants, actor: AuditActor, phaseId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.phaseOverride);
    if (!reason.trim()) throw new AppError("VALIDATION", "studioflow.phase.exception-reason-required", "Reason is required for exception closure");
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({ where: { id: phaseId }, select: { id: true, state: true } });
      if (phase.state === "DONE") throw new AppError("CONFLICT", "studioflow.phase.already-done", "Phase is already finished");
      const openCount = await db.sfIteration.count({ where: { phase_id: phaseId, state: { in: ["DRAFT", "SENT"] } } });
      if (openCount > 0) throw new AppError("CONFLICT", "studioflow.phase.open-iterations", "Cannot close by exception while rounds are open");
      const now = new Date();
      const updated = await db.sfProjectPhase.update({
        where: { id: phaseId },
        data: { state: "DONE", closed_at: now, closed_by_id: actor.userId, closure_reason: reason.trim(), closure_kind: "EXCEPTION" },
      });
      await writeAudit({ action: "phase.close_exception", entityType: "SfProjectPhase", entityId: phaseId, actor, changes: { from: phase.state, to: "DONE", closure_kind: "EXCEPTION", reason } });
      return updated;
    });
  }

  // ── Supervision actions (§4.4) ───────────────────────────────────────────

  async function startSupervision(grants: PermissionGrants, actor: AuditActor, phaseId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({ where: { id: phaseId }, select: { id: true, state: true, has_rounds: true } });
      if (phase.has_rounds) throw new AppError("CONFLICT", "studioflow.phase.not-supervision", "Not a supervision phase");
      if (phase.state !== "NOT_STARTED") throw new AppError("CONFLICT", "studioflow.phase.already-started", "Supervision already started");
      const updated = await db.sfProjectPhase.update({ where: { id: phaseId }, data: { state: "IN_PROGRESS" } });
      await writeAudit({ action: "phase.supervision.start", entityType: "SfProjectPhase", entityId: phaseId, actor, changes: { from: "NOT_STARTED", to: "IN_PROGRESS" } });
      return updated;
    });
  }

  async function finishSupervision(grants: PermissionGrants, actor: AuditActor, phaseId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({ where: { id: phaseId }, select: { id: true, state: true, has_rounds: true } });
      if (phase.has_rounds) throw new AppError("CONFLICT", "studioflow.phase.not-supervision", "Not a supervision phase");
      if (phase.state !== "IN_PROGRESS") throw new AppError("CONFLICT", "studioflow.phase.not-in-progress", "Supervision is not in progress");
      const now = new Date();
      const updated = await db.sfProjectPhase.update({ where: { id: phaseId }, data: { state: "DONE", closed_at: now, closed_by_id: actor.userId, closure_reason: null, closure_kind: "NORMAL" } });
      await writeAudit({ action: "phase.supervision.finish", entityType: "SfProjectPhase", entityId: phaseId, actor, changes: { from: "IN_PROGRESS", to: "DONE" } });
      return updated;
    });
  }

  async function reopenSupervision(grants: PermissionGrants, actor: AuditActor, phaseId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    if (!reason.trim()) throw new AppError("VALIDATION", "studioflow.phase.reopen-reason-required", "Reason is required");
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({ where: { id: phaseId }, select: { id: true, state: true, has_rounds: true } });
      if (phase.has_rounds) throw new AppError("CONFLICT", "studioflow.phase.not-supervision", "Not a supervision phase");
      if (phase.state !== "DONE") throw new AppError("CONFLICT", "studioflow.phase.not-done", "Supervision is not finished");
      const updated = await db.sfProjectPhase.update({ where: { id: phaseId }, data: { state: "IN_PROGRESS", closed_at: null, closed_by_id: null, closure_kind: null, closure_reason: null } });
      await writeAudit({ action: "phase.supervision.reopen", entityType: "SfProjectPhase", entityId: phaseId, actor, changes: { from: "DONE", to: "IN_PROGRESS", reason } });
      return updated;
    });
  }

  // ── Iteration actions ────────────────────────────────────────────────────

  async function openIteration(grants: PermissionGrants, actor: AuditActor, phaseId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    return runTransaction(async () => {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({ where: { id: phaseId }, select: { id: true, state: true, has_rounds: true } });
      if (!phase.has_rounds) throw new AppError("CONFLICT", "studioflow.phase.no-rounds", "This phase type does not use rounds");
      if (phase.state === "DONE") throw new AppError("CONFLICT", "studioflow.phase.closed", "Reopen the phase before starting a new round");
      const { iteration, opened } = await resolveOrOpenDraft(db, phaseId);
      if (opened) {
        await recomputePhaseState(db, phaseId);
        await writeAudit({ action: "iteration.open", entityType: "SfIteration", entityId: iteration.id, actor, changes: { number: iteration.number, phase_id: phaseId } });
      }
      return { iteration, opened };
    });
  }

  async function getIteration(grants: PermissionGrants, projectId: string, phaseId: string, iterationId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const iteration = await db.sfIteration.findFirst({
      where: { id: iterationId, phase_id: phaseId, phase: { project_id: projectId } },
      include: {
        phase: { select: { id: true, name: true, state: true, has_rounds: true, round_prefix: true } },
        points: { orderBy: { sort_order: "asc" } },
      },
    });
    if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
    return iteration;
  }

  // ── Iteration lifecycle (WO-4) ───────────────────────────────────────────

  async function sendIteration(
    grants: PermissionGrants,
    actor: AuditActor,
    iterationId: string,
    assigneeId?: string,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({
        where: { id: iterationId },
        include: { phase: { select: { id: true, state: true } } },
      });
      if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      if (iteration.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.iteration.not-draft", "Only draft rounds can be sent");
      if (iteration.phase.state === "DONE") throw new AppError("CONFLICT", "studioflow.phase.closed", "Cannot send a round in a finished phase");
      const updated = await db.sfIteration.update({
        where: { id: iterationId },
        data: { state: "SENT", sent_at: new Date(), ...(assigneeId !== undefined ? { assignee_id: assigneeId || null } : {}) },
      });
      await recomputePhaseState(db, iteration.phase_id);
      await writeAudit({ action: "iteration.send", entityType: "SfIteration", entityId: iterationId, actor, changes: { from: "DRAFT", to: "SENT", assignee_id: assigneeId ?? null } });
      return updated;
    });
  }

  async function approveIteration(grants: PermissionGrants, actor: AuditActor, iterationId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({ where: { id: iterationId }, select: { id: true, phase_id: true, state: true } });
      if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      if (iteration.state !== "SENT") throw new AppError("CONFLICT", "studioflow.iteration.not-sent", "Only sent rounds can be approved");
      const updated = await db.sfIteration.update({ where: { id: iterationId }, data: { state: "APPROVED", responded_at: new Date() } });
      await recomputePhaseState(db, iteration.phase_id);
      await writeAudit({ action: "iteration.approve", entityType: "SfIteration", entityId: iterationId, actor, changes: { from: "SENT", to: "APPROVED" } });
      return updated;
    });
  }

  async function voidIteration(grants: PermissionGrants, actor: AuditActor, iterationId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    if (!reason.trim()) throw new AppError("VALIDATION", "studioflow.iteration.void-reason-required", "Reason is required");
    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({ where: { id: iterationId }, select: { id: true, phase_id: true, state: true } });
      if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      if (iteration.state !== "DRAFT" && iteration.state !== "SENT") throw new AppError("CONFLICT", "studioflow.iteration.not-open", "Only draft or sent rounds can be cancelled");
      const updated = await db.sfIteration.update({ where: { id: iterationId }, data: { state: "VOIDED", voided_at: new Date(), voided_by_id: actor.userId, void_reason: reason.trim() } });
      await recomputePhaseState(db, iteration.phase_id);
      await writeAudit({ action: "iteration.void", entityType: "SfIteration", entityId: iterationId, actor, changes: { from: iteration.state, to: "VOIDED", reason: reason.trim() } });
      return updated;
    });
  }

  // ── Iteration points (WO-4) ──────────────────────────────────────────────

  async function addIterationPoint(grants: PermissionGrants, actor: AuditActor, iterationId: string, text: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    if (!text.trim()) throw new AppError("VALIDATION", "studioflow.iteration-point.text-required", "Point text is required");
    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({ where: { id: iterationId }, select: { id: true, state: true } });
      if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      if (iteration.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.iteration.not-draft", "Points can only be added to draft rounds");
      const max = await db.sfIterationPoint.aggregate({ where: { iteration_id: iterationId }, _max: { sort_order: true } });
      const point = await db.sfIterationPoint.create({ data: { iteration_id: iterationId, text: text.trim(), source: "INTERNAL", sort_order: (max._max.sort_order ?? 0) + 1 } });
      await writeAudit({ action: "iteration_point.add", entityType: "SfIterationPoint", entityId: point.id, actor, changes: { iteration_id: iterationId, text: point.text } });
      return point;
    });
  }

  async function markPointDone(grants: PermissionGrants, _actor: AuditActor, pointId: string, done: boolean) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    return runTransaction(async () => {
      const point = await db.sfIterationPoint.findUnique({ where: { id: pointId }, include: { iteration: { select: { state: true } } } });
      if (!point) throw new AppError("NOT_FOUND", "studioflow.iteration-point.not-found", "Checklist point not found");
      if (point.iteration.state !== "DRAFT" && point.iteration.state !== "SENT") throw new AppError("CONFLICT", "studioflow.iteration-point.not-open", "Only draft or sent rounds can change points");
      return db.sfIterationPoint.update({ where: { id: pointId }, data: { done } });
    });
  }

  async function withdrawPoint(grants: PermissionGrants, actor: AuditActor, pointId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    if (!reason.trim()) throw new AppError("VALIDATION", "studioflow.iteration-point.withdraw-reason-required", "Reason is required");
    return runTransaction(async () => {
      const point = await db.sfIterationPoint.findUnique({ where: { id: pointId }, select: { id: true, iteration_id: true, withdrawn_at: true } });
      if (!point) throw new AppError("NOT_FOUND", "studioflow.iteration-point.not-found", "Checklist point not found");
      if (point.withdrawn_at) throw new AppError("CONFLICT", "studioflow.iteration-point.already-withdrawn", "Point is already withdrawn");
      const updated = await db.sfIterationPoint.update({ where: { id: pointId }, data: { withdrawn_at: new Date(), withdrawn_by_id: actor.userId, withdrawal_reason: reason.trim() } });
      await writeAudit({ action: "iteration_point.withdraw", entityType: "SfIterationPoint", entityId: pointId, actor, changes: { iteration_id: point.iteration_id, reason: reason.trim() } });
      return updated;
    });
  }

  // ── File operations ──────────────────────────────────────────────────────

  async function getNextFilename(
    grants: PermissionGrants,
    projectId: string,
    phaseId: string | null,
    opts: { extension?: string } = {},
  ): Promise<string> {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const settings = await getStudioSettings();
    const project = await db.sfProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true, location: true, code: true },
    });
    let phaseLabel: string | null = null;
    if (phaseId) {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({
        where: { id: phaseId },
        select: { round_prefix: true, name: true, has_rounds: true },
      });
      if (phase.has_rounds) {
        const latest = await db.sfIteration.findFirst({
          where: { phase_id: phaseId, state: "DRAFT" },
          select: { number: true },
        });
        if (latest) phaseLabel = `${phase.round_prefix ?? phase.name} ${latest.number}`;
      }
    }
    return resolveFilename(settings.naming_template, project, { droppedAt: new Date(), phaseLabel }, opts.extension ?? "");
  }

  async function recordFile(grants: PermissionGrants, actor: AuditActor, input: RecordFileInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({
        where: { id: input.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");

      const settings = await getStudioSettings();
      const ext = input.original_filename.includes(".") ? "." + input.original_filename.split(".").pop() : "";

      const targetPhase = input.folder_key
        ? project.phases.find((p) => p.folder_key === input.folder_key)
        : null;

      let iteration: { id: string; number: number } | null = null;
      let phaseLabel: string | null = null;

      if (targetPhase?.has_rounds) {
        if (targetPhase.state === "DONE") throw new AppError("CONFLICT", "studioflow.phase.closed", "Reopen the phase before recording files");
        const result = await resolveOrOpenDraft(db, targetPhase.id);
        iteration = result.iteration;
        const phase = await db.sfProjectPhase.findUniqueOrThrow({ where: { id: targetPhase.id }, select: { round_prefix: true, name: true } });
        phaseLabel = `${phase.round_prefix ?? phase.name} ${iteration.number}`;
        if (result.opened) await recomputePhaseState(db, targetPhase.id);
      }

      const filename = resolveFilename(
        settings.naming_template,
        { name: project.name, location: project.location, code: project.code },
        { droppedAt: new Date(), phaseLabel },
        ext,
      );

      const file = await db.sfFile.create({
        data: {
          project_id: input.project_id,
          folder_key: input.folder_key,
          treatment: "RECORDED",
          filename,
          original_filename: input.original_filename,
          bytes: BigInt(input.bytes),
          file_modified_at: input.file_modified_at ?? null,
          dropped_by_id: actorUserId,
          dropped_at: new Date(),
        },
      });

      await writeAudit({
        action: "file.record",
        entityType: "SfFile",
        entityId: file.id,
        actor,
        changes: { project_id: input.project_id, folder_key: input.folder_key, filename, original_filename: input.original_filename, iteration_id: iteration?.id ?? null },
      });

      return { file, iteration };
    });
  }

  async function listFiles(grants: PermissionGrants, projectId: string, opts?: { folder_key?: string | null }) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfFile.findMany({
      where: { project_id: projectId, ...(opts?.folder_key !== undefined ? { folder_key: opts.folder_key } : {}) },
      orderBy: [{ dropped_at: "desc" }],
    });
  }

  // ── Internal approval (§6.7) ─────────────────────────────────────────────

  async function recordInternalApproval(grants: PermissionGrants, actor: AuditActor, iterationId: string, note?: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({ where: { id: iterationId }, select: { id: true, state: true, phase_id: true } });
      if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      if (iteration.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.iteration.not-draft", "Internal approval only applies to DRAFT rounds");
      const approval = await db.sfInternalApproval.upsert({
        where: { iteration_id: iterationId },
        create: { iteration_id: iterationId, approved_by_id: actorUserId, note: note ?? null },
        update: { approved_by_id: actorUserId, approved_at: new Date(), note: note ?? null },
      });
      await writeAudit({ action: "iteration.internal_approval", entityType: "SfInternalApproval", entityId: approval.id, actor, changes: { iteration_id: iterationId, note } });
      return approval;
    });
  }

  // ── Public surface ───────────────────────────────────────────────────────

  return {
    // Client
    listClients,
    getClient,
    createClient,
    editClient,
    archiveClient,
    restoreClient,
    // Project
    listProjects,
    getProject,
    createProject,
    editProject,
    // Template (read)
    listPhaseTemplates,
    // Studio settings (WO-3)
    getStudioSettings,
    updateNamingTemplate,
    // Phase (WO-3)
    listProjectPhases,
    getPhase,
    finishPhase,
    reopenPhase,
    closePhaseByException,
    startSupervision,
    finishSupervision,
    reopenSupervision,
    // Iteration (WO-3)
    openIteration,
    getIteration,
    // Iteration lifecycle (WO-4)
    sendIteration,
    approveIteration,
    voidIteration,
    // Iteration points (WO-4)
    addIterationPoint,
    markPointDone,
    withdrawPoint,
    // File (WO-3)
    getNextFilename,
    recordFile,
    listFiles,
    // Internal approval (WO-3)
    recordInternalApproval,
  };
}
