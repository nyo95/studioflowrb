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

export type CreateTaskInput = {
  project_id: string;
  /** Omit/null for General. Phase surfaces inherit their snapshot key here. */
  phase_scope?: string | null;
  title: string;
  assignee_id?: string | null;
  due_date?: Date | null;
  attachment_file_id?: string | null;
};

export type AssignTaskInput = { assignee_id: string | null };

export type SetTaskCompletionInput = { done: boolean };

export type ReorderTaskInput = {
  /** Dragging into General supplies null; dragging onto a phase supplies its key. */
  phase_scope: string | null;
  sort_order: number;
};

export type WaitingOnMeItem =
  | {
      kind: "ITERATION";
      id: string;
      project: { id: string; code: string; name: string; status: "ACTIVE" | "ON_HOLD" | "COMPLETED" };
      phase: { id: string; key: string; name: string; round_prefix: string | null };
      iteration_number: number;
      state: "DRAFT" | "SENT";
      assignee_id: string | null;
      assignee_label: string | null;
      assignment: "MINE" | "NEEDS_ASSIGNMENT";
      waiting_since: Date;
    }
  | {
      kind: "TASK";
      id: string;
      project: { id: string; code: string; name: string; status: "ACTIVE" | "ON_HOLD" | "COMPLETED" };
      phase_scope: string | null;
      title: string;
      assignee_id: string | null;
      assignee_label: string | null;
      assignment: "MINE" | "NEEDS_ASSIGNMENT";
      due_date: Date | null;
      waiting_since: Date;
    };


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

export type LinkFileInput = {
  project_id: string;
  /** Which folder (8.2). null = unsorted tray. */
  folder_key: string | null;
  original_filename: string;
  /** External location (http/https only). Nothing is uploaded. */
  external_url: string;
  bytes?: number;
};

export type RecordResponseInput = {
  kind: "APPROVAL" | "REVISION";
  note?: string;
  /** Client's own wording, one entry per revision request.
   *  Required (non-empty) when kind is REVISION. */
  points?: string[];
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

  function requireStudioFlowRead(grants: PermissionGrants): void {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.access);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  }

  async function requireAssignableUser(userId: string): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        user_roles: {
          where: { role: { archived_at: null } },
          select: { role: { select: { role_permissions: { select: { permission_id: true } } } } },
        },
      },
    });
    const grants = new Set(
      user?.user_roles.flatMap((assignment) =>
        assignment.role.role_permissions.map((permission) => permission.permission_id),
      ) ?? [],
    );
    if (
      user?.status !== "ACTIVE" ||
      !grants.has(STUDIOFLOW_PERMISSIONS.access) ||
      !grants.has(STUDIOFLOW_PERMISSIONS.projectRead)
    ) {
      throw new AppError(
        "VALIDATION",
        "studioflow.assignment.user-ineligible",
        "Assignee must be an active StudioFlow project reader",
      );
    }
  }

  async function requireWritableTaskProject(projectId: string) {
    const project = await db.sfProject.findUnique({
      where: { id: projectId },
      select: { id: true, deleted_at: true },
    });
    if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");
    if (project.deleted_at) {
      throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");
    }
    return project;
  }

  async function validateTaskPhaseScope(projectId: string, phaseScope: string | null): Promise<void> {
    if (phaseScope === null) return;
    const phase = await db.sfProjectPhase.findUnique({
      where: { project_id_key: { project_id: projectId, key: phaseScope } },
      select: { id: true },
    });
    if (!phase) {
      throw new AppError(
        "VALIDATION",
        "studioflow.task.phase-scope-invalid",
        "Task phase scope does not belong to this project",
      );
    }
  }

  async function validateTaskAttachment(projectId: string, fileId: string | null): Promise<void> {
    if (fileId === null) return;
    const file = await db.sfFile.findFirst({
      where: { id: fileId, project_id: projectId, superseded_at: null },
      select: { id: true },
    });
    if (!file) {
      throw new AppError(
        "VALIDATION",
        "studioflow.task.attachment-invalid",
        "Task attachment must be a current file from the same project",
      );
    }
  }

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

  /** Where a file lands (8.2 + 5.3).
   *  A phase output folder with rounds ensures a DRAFT exists and yields its
   *  round label for the filename. The unsorted tray yields no round. */
  async function resolveFolderPlacement(
    project: {
      phases: { id: string; folder_key: string | null; state: string; has_rounds: boolean }[];
    },
    folderKey: string | null,
  ): Promise<{ iteration: { id: string; number: number } | null; phaseLabel: string | null }> {
    const targetPhase = folderKey
      ? project.phases.find((phase) => phase.folder_key === folderKey)
      : null;
    if (!targetPhase?.has_rounds) return { iteration: null, phaseLabel: null };
    if (targetPhase.state === "DONE") {
      throw new AppError(
        "CONFLICT",
        "studioflow.phase.closed",
        "Reopen the phase before adding files",
      );
    }
    const result = await resolveOrOpenDraft(db, targetPhase.id);
    const phase = await db.sfProjectPhase.findUniqueOrThrow({
      where: { id: targetPhase.id },
      select: { round_prefix: true, name: true },
    });
    if (result.opened) await recomputePhaseState(db, targetPhase.id);
    return {
      iteration: result.iteration,
      phaseLabel: `${phase.round_prefix ?? phase.name} ${result.iteration.number}`,
    };
  }

  async function recordFile(grants: PermissionGrants, actor: AuditActor, input: RecordFileInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    const originalFilename = input.original_filename.trim();
    if (!originalFilename) {
      throw new AppError("VALIDATION", "studioflow.file.filename-required", "Nama file wajib diisi");
    }
    if (!Number.isFinite(input.bytes) || input.bytes <= 0) {
      throw new AppError("VALIDATION", "studioflow.file.bytes-invalid", "Ukuran file tidak valid");
    }
    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({
        where: { id: input.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");

      const settings = await getStudioSettings();
      const ext = originalFilename.includes(".") ? "." + originalFilename.split(".").pop() : "";

      const { iteration, phaseLabel } = await resolveFolderPlacement(project, input.folder_key);

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
          original_filename: originalFilename,
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
        changes: { project_id: input.project_id, folder_key: input.folder_key, filename, original_filename: originalFilename, iteration_id: iteration?.id ?? null },
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


  // ── Client responses (WO-5, §6) ──────────────────────────────────────────

  /** Record a client's answer to a SENT round.
   *  APPROVAL  -> round becomes APPROVED.
   *  REVISION  -> round becomes SUPERSEDED and the next round opens as DRAFT,
   *               seeded with CLIENT_REVISION points carrying full provenance. */
  async function recordResponse(
    grants: PermissionGrants,
    actor: AuditActor,
    iterationId: string,
    input: RecordResponseInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");

    const note = input.note?.trim() || null;
    const points = (input.points ?? []).map((text) => text.trim()).filter(Boolean);
    if (input.kind === "REVISION" && points.length === 0) {
      throw new AppError(
        "VALIDATION",
        "studioflow.response.points-required",
        "Response revisi butuh minimal satu poin",
      );
    }

    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({
        where: { id: iterationId },
        select: { id: true, phase_id: true, state: true, number: true },
      });
      if (!iteration) {
        throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      }
      if (iteration.state !== "SENT") {
        throw new AppError(
          "CONFLICT",
          "studioflow.iteration.not-sent",
          "Hanya round terkirim yang bisa menerima response",
        );
      }

      const now = new Date();
      const response = await db.sfResponse.create({
        data: {
          iteration_id: iterationId,
          kind: input.kind,
          note,
          received_at: now,
          recorded_by_id: actorUserId,
        },
      });

      const recordedPoints: { id: string; text: string }[] = [];
      for (const [index, text] of points.entries()) {
        const point = await db.sfResponsePoint.create({
          data: { response_id: response.id, text, sort_order: index + 1 },
          select: { id: true, text: true },
        });
        recordedPoints.push(point);
      }

      let nextIteration: { id: string; number: number } | null = null;

      if (input.kind === "APPROVAL") {
        await db.sfIteration.update({
          where: { id: iterationId },
          data: { state: "APPROVED", responded_at: now },
        });
      } else {
        await db.sfIteration.update({
          where: { id: iterationId },
          data: { state: "SUPERSEDED", responded_at: now },
        });
        const number = await nextIterationNumber(db, iteration.phase_id);
        nextIteration = await db.sfIteration.create({
          data: { phase_id: iteration.phase_id, number, state: "DRAFT" },
          select: { id: true, number: true },
        });
        // Carry the client's wording forward verbatim, with provenance (7.2).
        for (const [index, point] of recordedPoints.entries()) {
          await db.sfIterationPoint.create({
            data: {
              iteration_id: nextIteration.id,
              text: point.text,
              source: "CLIENT_REVISION",
              source_response_id: response.id,
              source_point_id: point.id,
              sort_order: index + 1,
            },
          });
        }
      }

      await recomputePhaseState(db, iteration.phase_id);
      await writeAudit({
        action: "response.record",
        entityType: "SfResponse",
        entityId: response.id,
        actor,
        changes: {
          iteration_id: iterationId,
          kind: input.kind,
          point_count: recordedPoints.length,
          next_iteration_id: nextIteration?.id ?? null,
        },
      });

      return { response, nextIteration };
    });
  }

  async function listResponses(grants: PermissionGrants, iterationId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfResponse.findMany({
      where: { iteration_id: iterationId },
      orderBy: { received_at: "desc" },
      include: { points: { orderBy: { sort_order: "asc" } } },
    });
  }


  // ── File management (WO-6, 8) ────────────────────────────────────────────

  /** Record a LINKED file: the bytes live somewhere else, we keep the pointer. */
  async function linkFile(grants: PermissionGrants, actor: AuditActor, input: LinkFileInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");

    const originalFilename = input.original_filename.trim();
    if (!originalFilename) {
      throw new AppError("VALIDATION", "studioflow.file.filename-required", "Nama file wajib diisi");
    }
    const externalUrl = input.external_url.trim();
    let parsed: URL;
    try {
      parsed = new URL(externalUrl);
    } catch {
      throw new AppError("VALIDATION", "studioflow.file.url-invalid", "Link tidak valid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new AppError("VALIDATION", "studioflow.file.url-invalid", "Link harus http atau https");
    }

    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({
        where: { id: input.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");

      const settings = await getStudioSettings();
      const { iteration, phaseLabel } = await resolveFolderPlacement(project, input.folder_key);
      const ext = originalFilename.includes(".") ? "." + originalFilename.split(".").pop() : "";
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
          treatment: "LINKED",
          filename,
          original_filename: originalFilename,
          bytes: BigInt(input.bytes && input.bytes > 0 ? input.bytes : 0),
          external_url: externalUrl,
          dropped_by_id: actorUserId,
          dropped_at: new Date(),
        },
      });

      await writeAudit({
        action: "file.link",
        entityType: "SfFile",
        entityId: file.id,
        actor,
        changes: {
          project_id: input.project_id,
          folder_key: input.folder_key,
          filename,
          external_url: externalUrl,
          iteration_id: iteration?.id ?? null,
        },
      });

      return { file, iteration };
    });
  }

  /** Move a file between folders. Landing in a phase output folder resolves or
   *  opens that phase's DRAFT (5.3) and renames the file for that round (8.5).
   *  A file already sent in a round is frozen (8.3). */
  async function moveFile(
    grants: PermissionGrants,
    actor: AuditActor,
    fileId: string,
    folderKey: string | null,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    return runTransaction(async () => {
      const file = await db.sfFile.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          project_id: true,
          folder_key: true,
          original_filename: true,
          sent_in_iteration_id: true,
          superseded_at: true,
        },
      });
      if (!file) throw new AppError("NOT_FOUND", "studioflow.file.not-found", "File not found");
      if (file.sent_in_iteration_id) {
        throw new AppError(
          "CONFLICT",
          "studioflow.file.already-sent",
          "File yang sudah dikirim tidak bisa dipindah",
        );
      }
      if (file.superseded_at) {
        throw new AppError("CONFLICT", "studioflow.file.superseded", "File ini sudah diganti");
      }
      if (file.folder_key === folderKey) return file;

      const project = await db.sfProject.findUniqueOrThrow({
        where: { id: file.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });

      const settings = await getStudioSettings();
      const { iteration, phaseLabel } = await resolveFolderPlacement(project, folderKey);
      const ext = file.original_filename.includes(".")
        ? "." + file.original_filename.split(".").pop()
        : "";
      const filename = resolveFilename(
        settings.naming_template,
        { name: project.name, location: project.location, code: project.code },
        { droppedAt: new Date(), phaseLabel },
        ext,
      );

      const updated = await db.sfFile.update({
        where: { id: fileId },
        data: { folder_key: folderKey, filename },
      });

      await writeAudit({
        action: "file.move",
        entityType: "SfFile",
        entityId: fileId,
        actor,
        changes: {
          from: file.folder_key,
          to: folderKey,
          filename,
          iteration_id: iteration?.id ?? null,
        },
      });

      return updated;
    });
  }

  /** Mark a working file as replaced (8.6). The record is kept forever;
   *  only the bytes may be released later. */
  async function supersedeFile(grants: PermissionGrants, actor: AuditActor, fileId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    return runTransaction(async () => {
      const file = await db.sfFile.findUnique({
        where: { id: fileId },
        select: { id: true, superseded_at: true, sent_in_iteration_id: true },
      });
      if (!file) throw new AppError("NOT_FOUND", "studioflow.file.not-found", "File not found");
      if (file.superseded_at) {
        throw new AppError("CONFLICT", "studioflow.file.superseded", "File ini sudah ditandai diganti");
      }
      if (file.sent_in_iteration_id) {
        throw new AppError(
          "CONFLICT",
          "studioflow.file.already-sent",
          "File yang sudah dikirim tidak bisa ditandai diganti",
        );
      }
      const updated = await db.sfFile.update({
        where: { id: fileId },
        data: { superseded_at: new Date() },
      });
      await writeAudit({
        action: "file.supersede",
        entityType: "SfFile",
        entityId: fileId,
        actor,
      });
      return updated;
    });
  }

  /** Every file on a project, plus the folder vocabulary to group them by. */
  async function listProjectFiles(grants: PermissionGrants, projectId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const [files, phases] = await Promise.all([
      db.sfFile.findMany({
        where: { project_id: projectId },
        orderBy: [{ dropped_at: "desc" }],
      }),
      db.sfProjectPhase.findMany({
        where: { project_id: projectId, folder_key: { not: null } },
        orderBy: { sort_order: "asc" },
        select: { id: true, name: true, folder_key: true, state: true, has_rounds: true },
      }),
    ]);
    return { files, folders: phases };
  }

  // ── Tasks (§7.3) ───────────────────────────────────────────────────────

  async function listTasks(
    grants: PermissionGrants,
    projectId: string,
    opts?: { includeDone?: boolean; phaseScope?: string | null },
  ) {
    requireStudioFlowRead(grants);
    return db.sfTask.findMany({
      where: {
        project_id: projectId,
        ...(opts?.includeDone ? {} : { status: "OPEN" }),
        ...(opts && "phaseScope" in opts ? { phase_scope: opts.phaseScope } : {}),
      },
      orderBy: [{ status: "asc" }, { sort_order: "asc" }, { created_at: "asc" }],
      include: {
        attachment_file: {
          select: { id: true, filename: true, original_filename: true, treatment: true, bytes_released_at: true },
        },
      },
    });
  }

  async function createTask(
    grants: PermissionGrants,
    _actor: AuditActor,
    input: CreateTaskInput,
  ) {
    requireStudioFlowRead(grants);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
    const title = input.title.trim();
    if (!title) {
      throw new AppError("VALIDATION", "studioflow.task.title-required", "Task title is required");
    }
    const phaseScope = input.phase_scope ?? null;
    const assigneeId = input.assignee_id ?? null;
    const attachmentFileId = input.attachment_file_id ?? null;

    return runTransaction(async () => {
      await requireWritableTaskProject(input.project_id);
      await validateTaskPhaseScope(input.project_id, phaseScope);
      await validateTaskAttachment(input.project_id, attachmentFileId);
      if (assigneeId) await requireAssignableUser(assigneeId);

      const max = await db.sfTask.aggregate({
        where: { project_id: input.project_id, phase_scope: phaseScope, status: "OPEN" },
        _max: { sort_order: true },
      });
      return db.sfTask.create({
        data: {
          project_id: input.project_id,
          phase_scope: phaseScope,
          title,
          assignee_id: assigneeId,
          due_date: input.due_date ?? null,
          attachment_file_id: attachmentFileId,
          sort_order: (max._max.sort_order ?? 0) + 1,
        },
      });
    });
  }

  async function assignTask(
    grants: PermissionGrants,
    actor: AuditActor,
    taskId: string,
    input: AssignTaskInput,
  ) {
    requireStudioFlowRead(grants);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
    return runTransaction(async () => {
      const task = await db.sfTask.findUnique({
        where: { id: taskId },
        include: { project: { select: { deleted_at: true } } },
      });
      if (!task) throw new AppError("NOT_FOUND", "studioflow.task.not-found", "Task not found");
      if (task.project.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");
      }
      if (input.assignee_id) await requireAssignableUser(input.assignee_id);
      if (task.assignee_id === input.assignee_id) return task;

      const updated = await db.sfTask.update({
        where: { id: taskId },
        data: { assignee_id: input.assignee_id },
      });
      await writeAudit({
        action: "task.assign",
        entityType: "SfTask",
        entityId: taskId,
        actor,
        changes: { from: task.assignee_id, to: input.assignee_id },
      });
      return updated;
    });
  }

  async function setTaskCompletion(
    grants: PermissionGrants,
    _actor: AuditActor,
    taskId: string,
    input: SetTaskCompletionInput,
  ) {
    requireStudioFlowRead(grants);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
    return runTransaction(async () => {
      const task = await db.sfTask.findUnique({
        where: { id: taskId },
        include: { project: { select: { deleted_at: true } } },
      });
      if (!task) throw new AppError("NOT_FOUND", "studioflow.task.not-found", "Task not found");
      if (task.project.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");
      }
      const status = input.done ? "DONE" : "OPEN";
      if (task.status === status) return task;
      return db.sfTask.update({ where: { id: taskId }, data: { status } });
    });
  }

  async function reorderTask(
    grants: PermissionGrants,
    _actor: AuditActor,
    taskId: string,
    input: ReorderTaskInput,
  ) {
    requireStudioFlowRead(grants);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
    if (!Number.isSafeInteger(input.sort_order) || input.sort_order < 0) {
      throw new AppError(
        "VALIDATION",
        "studioflow.task.sort-order-invalid",
        "Task sort order must be a non-negative integer",
      );
    }
    return runTransaction(async () => {
      const task = await db.sfTask.findUnique({
        where: { id: taskId },
        include: { project: { select: { deleted_at: true } } },
      });
      if (!task) throw new AppError("NOT_FOUND", "studioflow.task.not-found", "Task not found");
      if (task.project.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");
      }
      await validateTaskPhaseScope(task.project_id, input.phase_scope);
      if (task.phase_scope === input.phase_scope && task.sort_order === input.sort_order) return task;
      return db.sfTask.update({
        where: { id: taskId },
        data: { phase_scope: input.phase_scope, sort_order: input.sort_order },
      });
    });
  }

  async function deleteTask(grants: PermissionGrants, _actor: AuditActor, taskId: string) {
    requireStudioFlowRead(grants);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
    return runTransaction(async () => {
      const task = await db.sfTask.findUnique({
        where: { id: taskId },
        include: { project: { select: { deleted_at: true } } },
      });
      if (!task) throw new AppError("NOT_FOUND", "studioflow.task.not-found", "Task not found");
      if (task.project.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");
      }
      return db.sfTask.delete({ where: { id: taskId } });
    });
  }

  // ── Cross-project workload (§10.2) ─────────────────────────────────────

  async function listWaitingOnMe(
    grants: PermissionGrants,
    userId: string,
  ): Promise<WaitingOnMeItem[]> {
    requireStudioFlowRead(grants);
    const [iterations, tasks] = await Promise.all([
      db.sfIteration.findMany({
        where: {
          state: { in: ["DRAFT", "SENT"] },
          phase: { project: { deleted_at: null } },
        },
        select: {
          id: true,
          number: true,
          state: true,
          assignee_id: true,
          created_at: true,
          sent_at: true,
          phase: {
            select: {
              id: true,
              key: true,
              name: true,
              round_prefix: true,
              project: { select: { id: true, code: true, name: true, status: true } },
            },
          },
        },
      }),
      db.sfTask.findMany({
        where: { status: "OPEN", project: { deleted_at: null } },
        select: {
          id: true,
          phase_scope: true,
          title: true,
          assignee_id: true,
          due_date: true,
          created_at: true,
          project: { select: { id: true, code: true, name: true, status: true } },
        },
      }),
    ]);

    const assigneeIds = [
      ...new Set(
        [...iterations, ...tasks]
          .map((item) => item.assignee_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const users = assigneeIds.length
      ? await db.user.findMany({
          where: { id: { in: assigneeIds } },
          select: {
            id: true,
            display_name: true,
            status: true,
            user_roles: {
              where: { role: { archived_at: null } },
              select: { role: { select: { role_permissions: { select: { permission_id: true } } } } },
            },
          },
        })
      : [];
    const people = new Map(
      users.map((user) => {
        const permissionIds = new Set(
          user.user_roles.flatMap((assignment) =>
            assignment.role.role_permissions.map((permission) => permission.permission_id),
          ),
        );
        return [
          user.id,
          {
            label: user.display_name,
            available:
              user.status === "ACTIVE" &&
              permissionIds.has(STUDIOFLOW_PERMISSIONS.access) &&
              permissionIds.has(STUDIOFLOW_PERMISSIONS.projectRead),
          },
        ] as const;
      }),
    );
    const assignmentFor = (assigneeId: string | null): "MINE" | "NEEDS_ASSIGNMENT" | null => {
      if (!assigneeId || !people.get(assigneeId)?.available) return "NEEDS_ASSIGNMENT";
      return assigneeId === userId ? "MINE" : null;
    };

    const rows: WaitingOnMeItem[] = [];
    for (const iteration of iterations) {
      const assignment = assignmentFor(iteration.assignee_id);
      if (!assignment) continue;
      rows.push({
        kind: "ITERATION",
        id: iteration.id,
        project: iteration.phase.project,
        phase: {
          id: iteration.phase.id,
          key: iteration.phase.key,
          name: iteration.phase.name,
          round_prefix: iteration.phase.round_prefix,
        },
        iteration_number: iteration.number,
        state: iteration.state,
        assignee_id: iteration.assignee_id,
        assignee_label: iteration.assignee_id ? people.get(iteration.assignee_id)?.label ?? null : null,
        assignment,
        waiting_since: iteration.state === "SENT" ? iteration.sent_at ?? iteration.created_at : iteration.created_at,
      });
    }
    for (const task of tasks) {
      const assignment = assignmentFor(task.assignee_id);
      if (!assignment) continue;
      rows.push({
        kind: "TASK",
        id: task.id,
        project: task.project,
        phase_scope: task.phase_scope,
        title: task.title,
        assignee_id: task.assignee_id,
        assignee_label: task.assignee_id ? people.get(task.assignee_id)?.label ?? null : null,
        assignment,
        due_date: task.due_date,
        waiting_since: task.created_at,
      });
    }
    return rows.sort((left, right) =>
      left.waiting_since.getTime() - right.waiting_since.getTime() || left.id.localeCompare(right.id),
    );
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
    // Client responses (WO-5)
    recordResponse,
    listResponses,
    // File management (WO-6)
    linkFile,
    moveFile,
    supersedeFile,
    listProjectFiles,
    // Tasks (SF-F4)
    listTasks,
    createTask,
    assignTask,
    setTaskCompletion,
    reorderTask,
    deleteTask,
    // Workload (SF-F5 read model)
    listWaitingOnMe,
  };
}
