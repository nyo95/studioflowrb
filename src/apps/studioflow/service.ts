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
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { AppError } from "@platform/core/errors";
import { roundLabel } from "./labels";

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
  scheduleManage: "studioflow.schedule.manage",
  momManage: "studioflow.mom.manage",
  momIssue: "studioflow.mom.issue",
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
  client_id?: string;
  client_name?: string;
  lead_user_id?: string;
  location?: string;
  address?: string;
  area?: string;
  opened_at: Date;
};

export type EditProjectInput = {
  name?: string;
  lead_user_id?: string | null;
  location?: string | null;
  address?: string | null;
  area?: string | null;
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

export type UpdateTaskInput = {
  title?: string;
  assignee_id?: string | null;
  due_date?: Date | null;
};

export type AssignableUser = { id: string; display_name: string };

export type ReorderTaskInput = {
  /** Dragging into General supplies null; dragging onto a phase supplies its key. */
  phase_scope: string | null;
  sort_order: number;
};

export type CatalogueSpecInput = {
  brand_md_id?: string | null;
  brand_name?: string | null;
  product_name: string;
  colour?: string | null;
  finishing?: string | null;
  dimension_text?: string | null;
  unit?: string | null;
  notes?: string | null;
};

export type EditCatalogueSpecInput = Partial<CatalogueSpecInput>;

export type CatalogueSnapshot = {
  brand_md_id: string | null;
  brand_name: string | null;
  product_name: string;
  colour: string | null;
  finishing: string | null;
  dimension_text: string | null;
  unit: string | null;
  notes: string | null;
  search_key: string;
};

export function deriveCatalogueSearchKey(input: {
  brand_name?: string | null;
  product_name?: string | null;
  colour?: string | null;
  finishing?: string | null;
}): string {
  return [input.brand_name, input.product_name, input.colour, input.finishing]
    .map((part) => part?.trim().toLowerCase() ?? "")
    .filter((part) => part.length > 0)
    .join("::");
}

export function snapshotCatalogueProduct(row: CatalogueSnapshot): CatalogueSnapshot {
  return {
    brand_md_id: row.brand_md_id,
    brand_name: row.brand_name,
    product_name: row.product_name,
    colour: row.colour,
    finishing: row.finishing,
    dimension_text: row.dimension_text,
    unit: row.unit,
    notes: row.notes,
    search_key: row.search_key,
  };
}

export type CreateMomInput = {
  project_id: string;
  topic: string;
  meeting_at: Date;
  venue?: string | null;
  attendees_text?: string | null;
  prepared_by_name: string;
};

export type UpdateMomInput = Partial<Omit<CreateMomInput, "project_id">>;
export type MomContentInput = {
  items: Array<{ sort_order: number; is_text_only: boolean; list_style: "NONE" | "BULLET" | "NUMBERED"; points: Array<{ sort_order: number; text: string; style: "TEXT" | "BULLET" | "NUMBERED" }>; images: Array<{ sort_order: number; storage_key: string; alt_text?: string | null }> }>;
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
  /** Explicitly close the phase with the approval in the same transaction. */
  also_finish_phase?: boolean;
};

export type UpdateNamingTemplateInput = {
  /** Token string e.g. "{date} {project} {location} {round}".
   *  Valid tokens: {date} {project} {location} {round} {code} */
  naming_template: string;
};

// ── §7.1.1 Requirements input types ─────────────────────────────────────────

export type CreateRequirementTemplateInput = {
  key: string;
  scope: "GENERAL" | "PHASE";
  title: string;
  description?: string | null;
  sort_order?: number;
  /** Required when scope is PHASE; must match an existing SfPhaseTemplate id. */
  phase_template_id?: string | null;
};

export type EditRequirementTemplateInput = {
  title?: string;
  description?: string | null;
  sort_order?: number;
};

export type CreateProjectRequirementInput = {
  project_id: string;
  phase_id?: string | null;
  title: string;
  description?: string | null;
  sort_order?: number;
};

export type EditProjectRequirementInput = {
  title?: string;
  description?: string | null;
  sort_order?: number;
};

export type SatisfyRequirementInput = {
  satisfaction_note: string;
};

export type ReopenRequirementInput = {
  reopen_reason: string;
};

export type ArchiveRequirementInput = {
  reason: string;
};

export type RestoreRequirementInput = {
  reason: string;
};

export type LinkEvidenceInput = {
  file_id: string;
};

export type UnlinkEvidenceInput = {
  reason: string;
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

  /**
   * Display names for the platform users a StudioFlow surface already
   * references — project lead, iteration assignee, internal approver.
   *
   * Routes call this instead of reaching for Prisma themselves: direct queries
   * in page components are the legacy pattern the project contract §11 marks
   * PURGE, and the implementation plan's handoff checklist repeats it.
   * Unknown or since-deleted ids are simply absent from the result.
   */
  async function listUserLabels(
    grants: PermissionGrants,
    userIds: readonly (string | null | undefined)[],
  ): Promise<Record<string, string>> {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return {};
    const users = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, display_name: true },
    });
    return Object.fromEntries(users.map((user) => [user.id, user.display_name]));
  }

  async function listAssignableUsers(grants: PermissionGrants): Promise<AssignableUser[]> {
    requireStudioFlowRead(grants);
    const users = await db.user.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        display_name: true,
        user_roles: {
          where: { role: { archived_at: null } },
          select: { role: { select: { role_permissions: { select: { permission_id: true } } } } },
        },
      },
      orderBy: { display_name: "asc" },
    });
    return users
      .filter((user) => {
        const permissions = new Set(
          user.user_roles.flatMap((assignment) =>
            assignment.role.role_permissions.map((permission) => permission.permission_id),
          ),
        );
        return permissions.has(STUDIOFLOW_PERMISSIONS.access) && permissions.has(STUDIOFLOW_PERMISSIONS.projectRead);
      })
      .map(({ id, display_name }) => ({ id, display_name }));
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
    const client = await db.sfClient.findUnique({
      where: { id },
      include: {
        _count: {
          select: { projects: { where: { deleted_at: null } } },
        },
      },
    });
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
      include: {
        client: { select: { id: true, name: true } },
        phases: {
          // Ordered so the directory can draw the pipeline in template order.
          orderBy: { sort_order: "asc" },
          select: {
            id: true,
            key: true,
            name: true,
            sort_order: true,
            state: true,
            iterations: {
              where: { state: "SENT" },
              select: { sent_at: true },
              orderBy: { sent_at: "asc" },
              take: 1,
            },
          },
        },
      },
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
      // Select an existing live client or create the explicitly typed client in
      // the same transaction as the project. The UI may offer creation in
      // context, but the service remains the single policy boundary.
      let client = input.client_id
        ? await db.sfClient.findUnique({ where: { id: input.client_id } })
        : null;
      if (client?.deleted_at) throw new AppError("CONFLICT", "studioflow.client.archived", "New projects require a live client");
      if (!client && input.client_name?.trim()) {
        client = await db.sfClient.create({ data: { name: input.client_name.trim() } });
        await writeAudit({
          action: "client.create",
          entityType: "SfClient",
          entityId: client.id,
          actor,
          changes: { name: client.name, source: "project-create" },
        });
      }
      if (!client) throw new AppError("VALIDATION", "studioflow.client.required", "Select or create a client");

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
          client_id: client.id,
          lead_user_id: input.lead_user_id ?? null,
          location: input.location?.trim() ?? null,
          address: input.address?.trim() ?? null,
          area: input.area ?? null,
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

      // §7.1.1: Snapshot requirement templates into project requirements
      for (const phase of project.phases) {
        await snapshotRequirementsForProject(db, project.id, phase.id, phase.template_id);
      }

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

  /** §8.5: `{date}` is the drop date in the platform's configured timezone.
   *  Reading the parts off the Date would use the server's local zone, which on
   *  the production runtime is UTC — an evening drop in Asia/Jakarta would then
   *  be filed under the previous day. `en-CA` formats as YYYY-MM-DD. */
  function dateToken(instant: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(instant)
      .replace(/-/g, "");
  }

  function resolveFilename(
    template: string,
    project: { name: string; location: string | null; code: string },
    opts: { droppedAt: Date; phaseLabel: string | null; timeZone: string },
    ext: string,
  ): string {
    const date = dateToken(opts.droppedAt, opts.timeZone);
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

  /** Everything the naming template needs: the studio-owned token string and
   *  the platform-owned display timezone that `{date}` resolves in (§8.5). */
  async function getNamingContext(): Promise<{ template: string; timeZone: string }> {
    const [studio, platform] = await Promise.all([
      getStudioSettings(),
      readPlatformGeneralSettings(db),
    ]);
    return { template: studio.naming_template, timeZone: platform.timezone };
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
          orderBy: { number: "desc" },
          include: {
            points: { orderBy: { sort_order: "asc" } },
            internal_approval: {
              select: { approved_at: true, approved_by_id: true },
            },
          },
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
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
    return runTransaction(async () => {
      const iteration = await db.sfIteration.findUnique({
        where: { id: iterationId },
        include: { phase: { select: { id: true, state: true, project_id: true, folder_key: true } } },
      });
      if (!iteration) throw new AppError("NOT_FOUND", "studioflow.iteration.not-found", "Round not found");
      if (iteration.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.iteration.not-draft", "Only draft rounds can be sent");
      if (iteration.phase.state === "DONE") throw new AppError("CONFLICT", "studioflow.phase.closed", "Cannot send a round in a finished phase");
      const pendingClientResponse = await db.sfIteration.count({
        where: { phase_id: iteration.phase_id, state: "SENT" },
      });
      if (pendingClientResponse > 0) {
        throw new AppError(
          "CONFLICT",
          "studioflow.iteration.pending-client-response",
          "Record the previous round's response before sending this one",
        );
      }
      const updated = await db.sfIteration.update({
        where: { id: iterationId },
        data: { state: "SENT", sent_at: new Date(), ...(assigneeId !== undefined ? { assignee_id: assigneeId || null } : {}) },
      });
      if (iteration.phase.folder_key) {
        await db.sfFile.updateMany({
          where: {
            project_id: iteration.phase.project_id,
            folder_key: iteration.phase.folder_key,
            superseded_at: null,
            sent_in_iteration_id: null,
          },
          data: { sent_in_iteration_id: iterationId },
        });
      }
      await recomputePhaseState(db, iteration.phase_id);
      await writeAudit({ action: "iteration.send", entityType: "SfIteration", entityId: iterationId, actor, changes: { from: "DRAFT", to: "SENT", assignee_id: assigneeId ?? null } });
      return updated;
    });
  }

  /** §6.2: an approval is a recorded client answer, not a bare state change.
   *  This entry point exists for callers that only need the round closed, and
   *  it delegates to `recordResponse` so there is exactly one write path and
   *  every APPROVED round is backed by a readable response row. A second path
   *  that skipped the response would leave §6.1's answer history with holes and
   *  let `finishPhase` close a phase on an approval nobody can produce. */
  async function approveIteration(grants: PermissionGrants, actor: AuditActor, iterationId: string) {
    await recordResponse(grants, actor, iterationId, { kind: "APPROVAL" });
    return db.sfIteration.findUniqueOrThrow({ where: { id: iterationId } });
  }

  async function voidIteration(grants: PermissionGrants, actor: AuditActor, iterationId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationReview);
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
      // §6.3: a sent, answered or stopped round is frozen and keeps the
      // checklist snapshot it carried at send time. Ticking a point there would
      // rewrite delivered history, so the checklist is editable in DRAFT only.
      if (point.iteration.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.iteration-point.not-draft", "Only draft rounds can change points");
      return db.sfIterationPoint.update({ where: { id: pointId }, data: { done } });
    });
  }

  async function withdrawPoint(grants: PermissionGrants, actor: AuditActor, pointId: string, reason: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    if (!reason.trim()) throw new AppError("VALIDATION", "studioflow.iteration-point.withdraw-reason-required", "Reason is required");
    return runTransaction(async () => {
      const point = await db.sfIterationPoint.findUnique({
        where: { id: pointId },
        select: { id: true, iteration_id: true, withdrawn_at: true, iteration: { select: { state: true } } },
      });
      if (!point) throw new AppError("NOT_FOUND", "studioflow.iteration-point.not-found", "Checklist point not found");
      // §7.2: withdrawal is a draft-time correction of work still being planned.
      // A frozen round keeps the checklist it was sent with (§6.3).
      if (point.iteration.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.iteration-point.not-draft", "Only draft rounds can withdraw points");
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
    const naming = await getNamingContext();
    const project = await db.sfProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true, location: true, code: true },
    });
    let phaseLabel: string | null = null;
    if (phaseId) {
      const phase = await db.sfProjectPhase.findUniqueOrThrow({
        where: { id: phaseId },
        select: { project_id: true, round_prefix: true, name: true, has_rounds: true },
      });
      if (phase.project_id !== projectId) {
        throw new AppError("NOT_FOUND", "studioflow.phase.not-found", "Phase not found in this project");
      }
      if (phase.has_rounds) {
        const draft = await db.sfIteration.findFirst({
          where: { phase_id: phaseId, state: "DRAFT" },
          select: { number: true },
        });
        if (draft) {
          phaseLabel = roundLabel(phase, draft.number);
        } else {
          const agg = await db.sfIteration.aggregate({
            where: { phase_id: phaseId },
            _max: { number: true },
          });
          phaseLabel = roundLabel(phase, (agg._max.number ?? 0) + 1);
        }
      }
    }
    return resolveFilename(
      naming.template,
      project,
      { droppedAt: new Date(), phaseLabel, timeZone: naming.timeZone },
      opts.extension ?? "",
    );
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
    if (!targetPhase) return { iteration: null, phaseLabel: null };
    if (targetPhase.state === "DONE") {
      throw new AppError(
        "CONFLICT",
        "studioflow.phase.closed",
        "Reopen the phase before adding files",
      );
    }
    if (!targetPhase.has_rounds) return { iteration: null, phaseLabel: null };
    const result = await resolveOrOpenDraft(db, targetPhase.id);
    const phase = await db.sfProjectPhase.findUniqueOrThrow({
      where: { id: targetPhase.id },
      select: { round_prefix: true, name: true },
    });
    if (result.opened) await recomputePhaseState(db, targetPhase.id);
    return {
      iteration: result.iteration,
      phaseLabel: roundLabel(phase, result.iteration.number),
    };
  }

  async function recordFile(grants: PermissionGrants, actor: AuditActor, input: RecordFileInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.iterationManage);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    const originalFilename = input.original_filename.trim();
    if (!originalFilename) {
      throw new AppError("VALIDATION", "studioflow.file.filename-required", "A file name is required");
    }
    if (!Number.isFinite(input.bytes) || input.bytes <= 0) {
      throw new AppError("VALIDATION", "studioflow.file.bytes-invalid", "The file size is not valid");
    }
    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({
        where: { id: input.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");

      const naming = await getNamingContext();
      const ext = originalFilename.includes(".") ? "." + originalFilename.split(".").pop() : "";

      const { iteration, phaseLabel } = await resolveFolderPlacement(project, input.folder_key);

      if (iteration && input.folder_key) {
        const current = await db.sfFile.findFirst({
          where: {
            project_id: input.project_id,
            folder_key: input.folder_key,
            superseded_at: null,
            sent_in_iteration_id: null,
          },
          orderBy: { dropped_at: "desc" },
          select: { id: true },
        });
        if (current) {
          await db.sfFile.update({ where: { id: current.id }, data: { superseded_at: new Date() } });
          await db.sfIteration.update({
            where: { id: iteration.id },
            data: { working_revision: { increment: 1 } },
          });
          await writeAudit({
            action: "file.supersede",
            entityType: "SfFile",
            entityId: current.id,
            actor,
            changes: { reason: "working-file-replaced", iteration_id: iteration.id },
          });
        }
      }

      const filename = resolveFilename(
        naming.template,
        { name: project.name, location: project.location, code: project.code },
        { droppedAt: new Date(), phaseLabel, timeZone: naming.timeZone },
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
        "A revision response requires at least one point",
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
          "Only a sent round can receive a response",
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
        const next = await resolveOrOpenDraft(db, iteration.phase_id);
        nextIteration = { id: next.iteration.id, number: next.iteration.number };
        const existingPointOrder = await db.sfIterationPoint.aggregate({
          where: { iteration_id: nextIteration.id },
          _max: { sort_order: true },
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
              sort_order: (existingPointOrder._max.sort_order ?? 0) + index + 1,
            },
          });
        }
      }

      await recomputePhaseState(db, iteration.phase_id);

      let phaseClosed = false;
      if (input.kind === "APPROVAL" && input.also_finish_phase) {
        const openCount = await db.sfIteration.count({
          where: { phase_id: iteration.phase_id, state: { in: ["DRAFT", "SENT"] } },
        });
        if (openCount > 0) {
          throw new AppError(
            "CONFLICT",
            "studioflow.phase.open-iterations",
            "Finish all open rounds before closing the phase",
          );
        }
        await db.sfProjectPhase.update({
          where: { id: iteration.phase_id },
          data: {
            state: "DONE",
            closed_at: now,
            closed_by_id: actorUserId,
            closure_reason: null,
            closure_kind: "NORMAL",
          },
        });
        phaseClosed = true;
      }

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
          phase_closed: phaseClosed,
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
      throw new AppError("VALIDATION", "studioflow.file.filename-required", "A file name is required");
    }
    const externalUrl = input.external_url.trim();
    let parsed: URL;
    try {
      parsed = new URL(externalUrl);
    } catch {
      throw new AppError("VALIDATION", "studioflow.file.url-invalid", "The link is not valid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new AppError("VALIDATION", "studioflow.file.url-invalid", "The link must use http or https");
    }

    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({
        where: { id: input.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");

      const naming = await getNamingContext();
      const { iteration, phaseLabel } = await resolveFolderPlacement(project, input.folder_key);
      if (iteration && input.folder_key) {
        const current = await db.sfFile.findFirst({
          where: {
            project_id: input.project_id,
            folder_key: input.folder_key,
            superseded_at: null,
            sent_in_iteration_id: null,
          },
          orderBy: { dropped_at: "desc" },
          select: { id: true },
        });
        if (current) {
          await db.sfFile.update({ where: { id: current.id }, data: { superseded_at: new Date() } });
          await db.sfIteration.update({
            where: { id: iteration.id },
            data: { working_revision: { increment: 1 } },
          });
          await writeAudit({
            action: "file.supersede",
            entityType: "SfFile",
            entityId: current.id,
            actor,
            changes: { reason: "working-file-replaced", iteration_id: iteration.id },
          });
        }
      }
      const ext = originalFilename.includes(".") ? "." + originalFilename.split(".").pop() : "";
      const filename = resolveFilename(
        naming.template,
        { name: project.name, location: project.location, code: project.code },
        { droppedAt: new Date(), phaseLabel, timeZone: naming.timeZone },
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
          "A file that has been sent cannot be moved",
        );
      }
      if (file.superseded_at) {
        throw new AppError("CONFLICT", "studioflow.file.superseded", "This file has already been superseded");
      }
      if (file.folder_key === folderKey) return file;

      const project = await db.sfProject.findUniqueOrThrow({
        where: { id: file.project_id },
        include: { phases: { select: { id: true, folder_key: true, state: true, has_rounds: true } } },
      });

      const naming = await getNamingContext();
      const { iteration, phaseLabel } = await resolveFolderPlacement(project, folderKey);
      const ext = file.original_filename.includes(".")
        ? "." + file.original_filename.split(".").pop()
        : "";
      const filename = resolveFilename(
        naming.template,
        { name: project.name, location: project.location, code: project.code },
        { droppedAt: new Date(), phaseLabel, timeZone: naming.timeZone },
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
        throw new AppError("CONFLICT", "studioflow.file.superseded", "This file is already marked superseded");
      }
      if (file.sent_in_iteration_id) {
        throw new AppError(
          "CONFLICT",
          "studioflow.file.already-sent",
          "A file that has been sent cannot be marked superseded",
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

  // ── MOM (§ project-owned meeting record) ────────────────────────────────

  const momInclude = {
    items: {
      orderBy: { sort_order: "asc" as const },
      include: {
        points: { orderBy: { sort_order: "asc" as const } },
        images: { orderBy: { sort_order: "asc" as const } },
      },
    },
  } as const;

  async function listMomDocuments(grants: PermissionGrants, projectId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfMomDocument.findMany({
      where: { project_id: projectId },
      orderBy: [{ created_at: "desc" }, { sequence: "desc" }],
      include: momInclude,
    });
  }

  async function getMom(grants: PermissionGrants, projectId: string, momId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const mom = await db.sfMomDocument.findFirst({
      where: { id: momId, project_id: projectId },
      include: momInclude,
    });
    if (!mom) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
    return mom;
  }

  async function createMomDraft(grants: PermissionGrants, actor: AuditActor, input: CreateMomInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momManage);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    const topic = input.topic.trim();
    const preparedBy = input.prepared_by_name.trim();
    if (!topic || !preparedBy) {
      throw new AppError("VALIDATION", "studioflow.mom.required", "Topic and preparer are required");
    }
    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({ where: { id: input.project_id }, select: { id: true, deleted_at: true } });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");
      if (project.deleted_at) throw new AppError("CONFLICT", "studioflow.project.archived", "Project is archived");
      const mom = await db.sfMomDocument.create({
        data: {
          project_id: input.project_id,
          topic,
          meeting_at: input.meeting_at,
          venue: input.venue?.trim() || null,
          attendees_text: input.attendees_text?.trim() || null,
          prepared_by_name: preparedBy,
          created_by: actorUserId,
          items: { create: { sort_order: 0, is_text_only: true, list_style: "NONE", points: { create: { sort_order: 0, text: "", style: "TEXT" } } } },
        },
        include: momInclude,
      });
      await writeAudit({ action: "mom.create", entityType: "SfMomDocument", entityId: mom.id, actor, changes: { project_id: input.project_id, topic } });
      return mom;
    });
  }

  async function updateMomDraft(grants: PermissionGrants, actor: AuditActor, projectId: string, momId: string, input: UpdateMomInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momManage);
    return runTransaction(async () => {
      const existing = await db.sfMomDocument.findFirst({ where: { id: momId, project_id: projectId } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
      if (existing.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.mom.immutable", "Only draft MOMs can be edited");
      const topic = input.topic === undefined ? undefined : input.topic.trim();
      const preparedBy = input.prepared_by_name === undefined ? undefined : input.prepared_by_name.trim();
      if (topic === "" || preparedBy === "") throw new AppError("VALIDATION", "studioflow.mom.required", "Topic and preparer are required");
      const data = { ...(topic !== undefined ? { topic } : {}), ...(input.meeting_at !== undefined ? { meeting_at: input.meeting_at } : {}), ...(input.venue !== undefined ? { venue: input.venue?.trim() || null } : {}), ...(input.attendees_text !== undefined ? { attendees_text: input.attendees_text?.trim() || null } : {}), ...(preparedBy !== undefined ? { prepared_by_name: preparedBy } : {}) };
      const changed = Object.entries(data).some(([key, value]) => {
        const current = existing[key as keyof typeof existing];
        return current instanceof Date && value instanceof Date ? current.getTime() !== value.getTime() : current !== value;
      });
      if (!changed) return db.sfMomDocument.findUniqueOrThrow({ where: { id: momId }, include: momInclude });
      const updated = await db.sfMomDocument.update({ where: { id: momId }, data, include: momInclude });
      await writeAudit({ action: "mom.edit", entityType: "SfMomDocument", entityId: momId, actor, changes: { project_id: projectId } });
      return updated;
    });
  }

  async function discardMomDraft(grants: PermissionGrants, actor: AuditActor, projectId: string, momId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momManage);
    return runTransaction(async () => {
      const existing = await db.sfMomDocument.findFirst({ where: { id: momId, project_id: projectId }, include: momInclude });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
      if (existing.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.mom.immutable", "Only draft MOMs can be discarded");
      await db.sfMomDocument.delete({ where: { id: momId } });
      await writeAudit({ action: "mom.discard", entityType: "SfMomDocument", entityId: momId, actor, changes: { project_id: projectId } });
      return { id: momId };
    });
  }

  async function updateMomContent(grants: PermissionGrants, actor: AuditActor, projectId: string, momId: string, input: MomContentInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momManage);
    return runTransaction(async () => {
      const existing = await db.sfMomDocument.findFirst({ where: { id: momId, project_id: projectId }, include: momInclude });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
      if (existing.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.mom.immutable", "Only draft MOMs can be edited");
      if (input.items.length === 0) throw new AppError("VALIDATION", "studioflow.mom.item-required", "A MOM needs at least one content block");
      if (input.items.some((item) => item.images.length > 2)) throw new AppError("VALIDATION", "studioflow.mom.image-limit", "Each MOM block supports at most two images");
      const imagePrefix = `studioflow/mom/${projectId}/${momId}/`;
      if (input.items.some((item) => item.images.some((image) => !image.storage_key.startsWith(imagePrefix)))) {
        throw new AppError("VALIDATION", "studioflow.mom.image-key", "A MOM image reference is invalid");
      }
      if (new Set(input.items.map((item) => item.sort_order)).size !== input.items.length) {
        throw new AppError("VALIDATION", "studioflow.mom.item-order", "MOM block order must be unique");
      }
      for (const item of input.items) {
        if (new Set(item.points.map((point) => point.sort_order)).size !== item.points.length ||
            new Set(item.images.map((image) => image.sort_order)).size !== item.images.length) {
          throw new AppError("VALIDATION", "studioflow.mom.child-order", "MOM point and image order must be unique");
        }
        if (item.points.some((point) => !point.text.trim())) {
          throw new AppError("VALIDATION", "studioflow.mom.point-required", "MOM points cannot be empty");
        }
      }
      const currentContent = existing.items.map((item) => ({ sort_order: item.sort_order, is_text_only: item.is_text_only, list_style: item.list_style, points: item.points.map((point) => ({ sort_order: point.sort_order, text: point.text, style: point.style })), images: item.images.map((image) => ({ sort_order: image.sort_order, storage_key: image.storage_key, alt_text: image.alt_text })) }));
      const nextContent = input.items.map((item) => ({ sort_order: item.sort_order, is_text_only: item.is_text_only, list_style: item.list_style, points: item.points.map((point) => ({ sort_order: point.sort_order, text: point.text.trim(), style: point.style })), images: item.images.map((image) => ({ sort_order: image.sort_order, storage_key: image.storage_key, alt_text: image.alt_text?.trim() || null })) }));
      if (JSON.stringify(currentContent) === JSON.stringify(nextContent)) return existing;
      await db.sfMomItem.deleteMany({ where: { document_id: momId } });
      await db.sfMomItem.createMany({ data: input.items.map((item) => ({ document_id: momId, sort_order: item.sort_order, is_text_only: item.is_text_only, list_style: item.list_style })) });
      const items = await db.sfMomItem.findMany({ where: { document_id: momId }, select: { id: true, sort_order: true } });
      for (const item of input.items) {
        const target = items.find((row) => row.sort_order === item.sort_order);
        if (!target) continue;
        if (item.points.length) await db.sfMomPoint.createMany({ data: item.points.map((point) => ({ item_id: target.id, sort_order: point.sort_order, text: point.text.trim(), style: point.style })) });
        if (item.images.length) await db.sfMomImage.createMany({ data: item.images.map((image) => ({ item_id: target.id, sort_order: image.sort_order, storage_key: image.storage_key, alt_text: image.alt_text?.trim() || null })) });
      }
      const updated = await db.sfMomDocument.findUniqueOrThrow({ where: { id: momId }, include: momInclude });
      await writeAudit({ action: "mom.content.edit", entityType: "SfMomDocument", entityId: momId, actor, changes: { project_id: projectId, item_count: input.items.length } });
      return updated;
    });
  }

  async function issueMom(grants: PermissionGrants, actor: AuditActor, projectId: string, momId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momIssue);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    return runTransaction(async () => {
      const existing = await db.sfMomDocument.findFirst({ where: { id: momId, project_id: projectId }, include: momInclude });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
      if (existing.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.mom.not-draft", "Only draft MOMs can be issued");
      if (!existing.items.length || existing.items.every((item) => item.points.every((point) => !point.text.trim()))) {
        throw new AppError("VALIDATION", "studioflow.mom.content-required", "Add meeting content before issuing this MOM");
      }
      const max = await db.sfMomDocument.aggregate({ where: { project_id: projectId }, _max: { sequence: true } });
      const updated = await db.sfMomDocument.update({ where: { id: momId }, data: { state: "ISSUED", sequence: (max._max.sequence ?? 0) + 1, issued_by: actorUserId, issued_at: new Date() }, include: momInclude });
      await writeAudit({ action: "mom.issue", entityType: "SfMomDocument", entityId: momId, actor, changes: { project_id: projectId, sequence: updated.sequence } });
      return updated;
    });
  }

  async function assertMomDraftEditable(grants: PermissionGrants, projectId: string, momId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momManage);
    const mom = await db.sfMomDocument.findFirst({ where: { id: momId, project_id: projectId }, select: { state: true } });
    if (!mom) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
    if (mom.state !== "DRAFT") throw new AppError("CONFLICT", "studioflow.mom.immutable", "Only draft MOMs can be edited");
  }

  async function supersedeMom(grants: PermissionGrants, actor: AuditActor, projectId: string, momId: string, input: CreateMomInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.momIssue);
    const actorUserId = actor.userId;
    if (!actorUserId) throw new AppError("INVARIANT", "studioflow.actor.user-required", "A user actor is required");
    const topic = input.topic.trim();
    const preparedBy = input.prepared_by_name.trim();
    if (!topic || !preparedBy) throw new AppError("VALIDATION", "studioflow.mom.required", "Topic and preparer are required");
    return runTransaction(async () => {
      const source = await db.sfMomDocument.findFirst({ where: { id: momId, project_id: projectId }, include: momInclude });
      if (!source) throw new AppError("NOT_FOUND", "studioflow.mom.not-found", "MOM not found");
      if (source.state !== "ISSUED") throw new AppError("CONFLICT", "studioflow.mom.not-issued", "Only an issued MOM can be corrected");
      const created = await db.sfMomDocument.create({
        data: {
          project_id: projectId, topic, meeting_at: input.meeting_at,
          venue: input.venue?.trim() || null, attendees_text: input.attendees_text?.trim() || null,
          prepared_by_name: preparedBy, created_by: actorUserId, supersedes_id: source.id,
          items: { create: source.items.map((item) => ({
            sort_order: item.sort_order, is_text_only: item.is_text_only, list_style: item.list_style,
            points: { create: item.points.map((point) => ({ sort_order: point.sort_order, text: point.text, style: point.style })) },
            images: { create: item.images.map((image) => ({ sort_order: image.sort_order, storage_key: image.storage_key, alt_text: image.alt_text })) },
          })) },
        }, include: momInclude,
      });
      const max = await db.sfMomDocument.aggregate({ where: { project_id: projectId }, _max: { sequence: true } });
      const issued = await db.sfMomDocument.update({ where: { id: created.id }, data: { state: "ISSUED", sequence: (max._max.sequence ?? 0) + 1, issued_by: actorUserId, issued_at: new Date() }, include: momInclude });
      await db.sfMomDocument.update({ where: { id: source.id }, data: { state: "SUPERSEDED" } });
      await writeAudit({ action: "mom.supersede", entityType: "SfMomDocument", entityId: issued.id, actor, changes: { project_id: projectId, supersedes_id: source.id, sequence: issued.sequence } });
      return issued;
    });
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

  async function updateTask(
    grants: PermissionGrants,
    actor: AuditActor,
    taskId: string,
    input: UpdateTaskInput,
  ) {
    requireStudioFlowRead(grants);
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.taskManage);
    const title = input.title === undefined ? undefined : input.title.trim();
    if (title !== undefined && !title) {
      throw new AppError("VALIDATION", "studioflow.task.title-required", "Task title is required");
    }
    if (input.due_date && Number.isNaN(input.due_date.getTime())) {
      throw new AppError("VALIDATION", "studioflow.task.due-date-invalid", "Task due date is invalid");
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
      if (input.assignee_id) await requireAssignableUser(input.assignee_id);
      const dueDate = input.due_date === undefined ? task.due_date : input.due_date;
      const assigneeId = input.assignee_id === undefined ? task.assignee_id : input.assignee_id;
      const data = {
        ...(title !== undefined ? { title } : {}),
        assignee_id: assigneeId,
        due_date: dueDate,
      };
      if (task.title === (title ?? task.title) && task.assignee_id === assigneeId && task.due_date?.getTime() === dueDate?.getTime()) return task;
      const updated = await db.sfTask.update({ where: { id: taskId }, data });
      await writeAudit({
        action: "task.update",
        entityType: "SfTask",
        entityId: taskId,
        actor,
        changes: {
          ...(title !== undefined && task.title !== title ? { title: { from: task.title, to: title } } : {}),
          ...(task.assignee_id !== assigneeId ? { assignee_id: { from: task.assignee_id, to: assigneeId } } : {}),
          ...(task.due_date?.getTime() !== dueDate?.getTime() ? { due_date: { from: task.due_date, to: dueDate } } : {}),
        },
      });
      return updated;
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
      const sourceSiblings = await db.sfTask.findMany({
        where: { project_id: task.project_id, phase_scope: task.phase_scope, id: { not: taskId } },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const targetSiblings = task.phase_scope === input.phase_scope
        ? sourceSiblings
        : await db.sfTask.findMany({
            where: { project_id: task.project_id, phase_scope: input.phase_scope },
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
            select: { id: true },
          });
      const targetIndex = Math.min(input.sort_order, targetSiblings.length);
      const orderedIds = [...targetSiblings.map((sibling) => sibling.id)];
      orderedIds.splice(targetIndex, 0, taskId);
      if (task.phase_scope !== input.phase_scope) {
        for (const [index, sibling] of sourceSiblings.entries()) {
          await db.sfTask.update({ where: { id: sibling.id }, data: { sort_order: index } });
        }
      }
      for (const [index, id] of orderedIds.entries()) {
        await db.sfTask.update({
          where: { id },
          data: { phase_scope: input.phase_scope, sort_order: index },
        });
      }
      await writeAudit({
        action: "task.reorder",
        entityType: "SfTask",
        entityId: taskId,
        actor: _actor,
        changes: { fromPhase: task.phase_scope, toPhase: input.phase_scope, toIndex: targetIndex },
      });
      return db.sfTask.findUniqueOrThrow({ where: { id: taskId } });
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

    // Resolve the eligible assignee set once. Existing references to users who
    // later become unavailable must remain visible as NEEDS_ASSIGNMENT.
    const assignableUsers = await listAssignableUsers(grants);
    const assignableUserIds = assignableUsers.map((user) => user.id);
    const myLabel = assignableUsers.find((user) => user.id === userId)?.display_name ?? null;

    // Two bounded reads per entity type: mine and the needs-assignment set
    // (null or assigned to a user who is no longer eligible).
    const [myIterations, needsAssignmentIterations, myTasks, needsAssignmentTasks] = await Promise.all([
      db.sfIteration.findMany({
        where: { assignee_id: userId, state: { in: ["DRAFT", "SENT"] }, phase: { project: { deleted_at: null } } },
        select: {
          id: true, number: true, state: true, assignee_id: true, created_at: true, sent_at: true,
          phase: { select: {
            id: true, key: true, name: true, round_prefix: true,
            project: { select: { id: true, code: true, name: true, status: true } },
          } },
        },
      }),
      db.sfIteration.findMany({
        where: { OR: [{ assignee_id: null }, { assignee_id: { notIn: assignableUserIds } }], state: { in: ["DRAFT", "SENT"] }, phase: { project: { deleted_at: null } } },
        select: {
          id: true, number: true, state: true, assignee_id: true, created_at: true, sent_at: true,
          phase: { select: {
            id: true, key: true, name: true, round_prefix: true,
            project: { select: { id: true, code: true, name: true, status: true } },
          } },
        },
      }),
      db.sfTask.findMany({
        where: { assignee_id: userId, status: "OPEN", project: { deleted_at: null } },
        select: {
          id: true, phase_scope: true, title: true, assignee_id: true, due_date: true, created_at: true,
          project: { select: { id: true, code: true, name: true, status: true } },
        },
      }),
      db.sfTask.findMany({
        where: { OR: [{ assignee_id: null }, { assignee_id: { notIn: assignableUserIds } }], status: "OPEN", project: { deleted_at: null } },
        select: {
          id: true, phase_scope: true, title: true, assignee_id: true, due_date: true, created_at: true,
          project: { select: { id: true, code: true, name: true, status: true } },
        },
      }),
    ]);

    const rows: WaitingOnMeItem[] = [];

    for (const iteration of myIterations) {
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
        state: iteration.state as "DRAFT" | "SENT",
        assignee_id: iteration.assignee_id,
        assignee_label: myLabel,
        assignment: "MINE",
        waiting_since: iteration.state === "SENT" ? iteration.sent_at ?? iteration.created_at : iteration.created_at,
      });
    }

    for (const iteration of needsAssignmentIterations) {
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
        state: iteration.state as "DRAFT" | "SENT",
        assignee_id: iteration.assignee_id,
        assignee_label: null,
        assignment: "NEEDS_ASSIGNMENT",
        waiting_since: iteration.state === "SENT" ? iteration.sent_at ?? iteration.created_at : iteration.created_at,
      });
    }

    for (const task of myTasks) {
      rows.push({
        kind: "TASK",
        id: task.id,
        project: task.project,
        phase_scope: task.phase_scope,
        title: task.title,
        assignee_id: task.assignee_id,
        assignee_label: myLabel,
        assignment: "MINE",
        due_date: task.due_date,
        waiting_since: task.created_at,
      });
    }

    for (const task of needsAssignmentTasks) {
      rows.push({
        kind: "TASK",
        id: task.id,
        project: task.project,
        phase_scope: task.phase_scope,
        title: task.title,
        assignee_id: task.assignee_id,
        assignee_label: null,
        assignment: "NEEDS_ASSIGNMENT",
        due_date: task.due_date,
        waiting_since: task.created_at,
      });
    }

    return rows.sort((left, right) =>
      left.waiting_since.getTime() - right.waiting_since.getTime() || left.id.localeCompare(right.id),
    );
  }

  function normalizeCatalogueSpec(input: CatalogueSpecInput) {
    const product_name = input.product_name.trim();
    if (!product_name) {
      throw new AppError("VALIDATION", "studioflow.catalogue.product-required", "Product name is required");
    }
    const brand_md_id = input.brand_md_id?.trim() || null;
    const brand_name = input.brand_name?.trim() || null;
    if (brand_md_id && !brand_name) {
      throw new AppError(
        "VALIDATION",
        "studioflow.catalogue.brand-name-required",
        "A selected brand must freeze its name",
      );
    }
    const colour = input.colour?.trim() || null;
    const finishing = input.finishing?.trim() || null;
    const dimension_text = input.dimension_text?.trim() || null;
    const unit = input.unit?.trim() || null;
    const notes = input.notes?.trim() || null;
    return {
      brand_md_id,
      brand_name,
      product_name,
      colour,
      finishing,
      dimension_text,
      unit,
      notes,
      search_key: deriveCatalogueSearchKey({ brand_name, product_name, colour, finishing }),
    };
  }

  async function listCatalogueProducts(
    grants: PermissionGrants,
    opts?: { search?: string; includeArchived?: boolean },
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const search = opts?.search?.trim();
    return db.sfProductCatalogue.findMany({
      where: {
        ...(opts?.includeArchived ? {} : { deleted_at: null }),
        ...(search
          ? {
              OR: [
                { search_key: { contains: search.toLowerCase() } },
                { product_name: { contains: search, mode: "insensitive" } },
                { brand_name: { contains: search, mode: "insensitive" } },
                { colour: { contains: search, mode: "insensitive" } },
                { finishing: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ sort_order: "asc" }, { product_name: "asc" }, { created_at: "asc" }],
    });
  }

  async function getCatalogueProduct(grants: PermissionGrants, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const row = await db.sfProductCatalogue.findUnique({ where: { id } });
    if (!row) throw new AppError("NOT_FOUND", "studioflow.catalogue.not-found", "Catalogue product not found");
    return row;
  }

  async function createCatalogueProduct(
    grants: PermissionGrants,
    actor: AuditActor,
    input: CatalogueSpecInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage);
    const data = normalizeCatalogueSpec(input);
    return runTransaction(async () => {
      const last = await db.sfProductCatalogue.findFirst({
        orderBy: { sort_order: "desc" },
        select: { sort_order: true },
      });
      const created = await db.sfProductCatalogue.create({
        data: { ...data, sort_order: (last?.sort_order ?? 0) + 1 },
      });
      await writeAudit({
        action: "catalogue.create",
        entityType: "SfProductCatalogue",
        entityId: created.id,
        actor,
        changes: snapshotCatalogueProduct(created),
      });
      return created;
    });
  }

  async function editCatalogueProduct(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: EditCatalogueSpecInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage);
    return runTransaction(async () => {
      const existing = await db.sfProductCatalogue.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.catalogue.not-found", "Catalogue product not found");
      if (existing.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.catalogue.archived", "Catalogue product is archived");
      }
      const data = normalizeCatalogueSpec({
        brand_md_id: input.brand_md_id === undefined ? existing.brand_md_id : input.brand_md_id,
        brand_name: input.brand_name === undefined ? existing.brand_name : input.brand_name,
        product_name: input.product_name === undefined ? existing.product_name : input.product_name,
        colour: input.colour === undefined ? existing.colour : input.colour,
        finishing: input.finishing === undefined ? existing.finishing : input.finishing,
        dimension_text: input.dimension_text === undefined ? existing.dimension_text : input.dimension_text,
        unit: input.unit === undefined ? existing.unit : input.unit,
        notes: input.notes === undefined ? existing.notes : input.notes,
      });
      const before = snapshotCatalogueProduct(existing);
      const after = snapshotCatalogueProduct(data);
      if (JSON.stringify(before) === JSON.stringify(after)) return existing;
      const updated = await db.sfProductCatalogue.update({ where: { id }, data });
      await writeAudit({
        action: "catalogue.edit",
        entityType: "SfProductCatalogue",
        entityId: id,
        actor,
        changes: { before: snapshotCatalogueProduct(existing), after: snapshotCatalogueProduct(updated) },
      });
      return updated;
    });
  }

  async function archiveCatalogueProduct(grants: PermissionGrants, actor: AuditActor, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage);
    return runTransaction(async () => {
      const existing = await db.sfProductCatalogue.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.catalogue.not-found", "Catalogue product not found");
      if (existing.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.catalogue.already-archived", "Catalogue product is already archived");
      }
      const archived = await db.sfProductCatalogue.update({ where: { id }, data: { deleted_at: new Date() } });
      await writeAudit({ action: "catalogue.archive", entityType: "SfProductCatalogue", entityId: id, actor });
      return archived;
    });
  }

  async function restoreCatalogueProduct(grants: PermissionGrants, actor: AuditActor, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage);
    return runTransaction(async () => {
      const existing = await db.sfProductCatalogue.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.catalogue.not-found", "Catalogue product not found");
      if (!existing.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.catalogue.not-archived", "Catalogue product is not archived");
      }
      const restored = await db.sfProductCatalogue.update({ where: { id }, data: { deleted_at: null } });
      await writeAudit({ action: "catalogue.restore", entityType: "SfProductCatalogue", entityId: id, actor });
      return restored;
    });
  }

  // ── §7.1.1 Requirement templates (studio settings) ──────────────────────

  async function listRequirementTemplates(
    grants: PermissionGrants,
    opts?: { includeArchived?: boolean },
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfRequirementTemplate.findMany({
      where: opts?.includeArchived ? {} : { deleted_at: null },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      include: { phase_template: { select: { id: true, key: true, name: true } } },
    });
  }

  async function getRequirementTemplate(grants: PermissionGrants, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const row = await db.sfRequirementTemplate.findUnique({
      where: { id },
      include: { phase_template: { select: { id: true, key: true, name: true } } },
    });
    if (!row) throw new AppError("NOT_FOUND", "studioflow.requirement-template.not-found", "Requirement template not found");
    return row;
  }

  async function createRequirementTemplate(
    grants: PermissionGrants,
    actor: AuditActor,
    input: CreateRequirementTemplateInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    const key = input.key.trim().toLowerCase();
    if (!key) throw new AppError("VALIDATION", "studioflow.requirement-template.key-required", "Template key is required");
    if (!/^[a-z0-9_-]+$/.test(key)) {
      throw new AppError("VALIDATION", "studioflow.requirement-template.key-invalid", "Template key must be lowercase alphanumeric with hyphens or underscores");
    }
    if (!input.title.trim()) throw new AppError("VALIDATION", "studioflow.requirement-template.title-required", "Template title is required");
    if (input.scope === "PHASE" && !input.phase_template_id) {
      throw new AppError("VALIDATION", "studioflow.requirement-template.phase-template-required", "Phase scope requires a phase template reference");
    }
    if (input.scope === "GENERAL" && input.phase_template_id) {
      throw new AppError("VALIDATION", "studioflow.requirement-template.general-no-phase", "General scope must not reference a phase template");
    }
    if (input.phase_template_id) {
      const pt = await db.sfPhaseTemplate.findUnique({ where: { id: input.phase_template_id } });
      if (!pt) throw new AppError("NOT_FOUND", "studioflow.phase-template.not-found", "Phase template not found");
    }
    return runTransaction(async () => {
      const existing = await db.sfRequirementTemplate.findFirst({
        where: { scope: input.scope, phase_template_id: input.phase_template_id ?? null, key },
      });
      if (existing) throw new AppError("CONFLICT", "studioflow.requirement-template.duplicate-key", "A template with this key already exists for this scope");
      const last = await db.sfRequirementTemplate.findFirst({
        where: { scope: input.scope, phase_template_id: input.phase_template_id ?? null },
        orderBy: { sort_order: "desc" },
        select: { sort_order: true },
      });
      const created = await db.sfRequirementTemplate.create({
        data: {
          key,
          scope: input.scope,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          sort_order: input.sort_order ?? ((last?.sort_order ?? 0) + 1),
          phase_template_id: input.phase_template_id ?? null,
        },
      });
      await writeAudit({
        action: "requirement_template.create",
        entityType: "SfRequirementTemplate",
        entityId: created.id,
        actor,
        changes: { key: created.key, scope: created.scope, title: created.title },
      });
      return created;
    });
  }

  async function editRequirementTemplate(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: EditRequirementTemplateInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfRequirementTemplate.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement-template.not-found", "Requirement template not found");
      if (existing.deleted_at) throw new AppError("CONFLICT", "studioflow.requirement-template.archived", "Cannot edit an archived template");
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.description !== undefined) data.description = input.description?.trim() || null;
      if (input.sort_order !== undefined) data.sort_order = input.sort_order;
      if (Object.keys(data).length === 0) return existing;
      const updated = await db.sfRequirementTemplate.update({ where: { id }, data });
      await writeAudit({
        action: "requirement_template.edit",
        entityType: "SfRequirementTemplate",
        entityId: id,
        actor,
        changes: { before: { title: existing.title, description: existing.description, sort_order: existing.sort_order }, after: data },
      });
      return updated;
    });
  }

  async function archiveRequirementTemplate(grants: PermissionGrants, actor: AuditActor, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfRequirementTemplate.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement-template.not-found", "Requirement template not found");
      if (existing.deleted_at) throw new AppError("CONFLICT", "studioflow.requirement-template.already-archived", "Template is already archived");
      const updated = await db.sfRequirementTemplate.update({ where: { id }, data: { deleted_at: new Date() } });
      await writeAudit({ action: "requirement_template.archive", entityType: "SfRequirementTemplate", entityId: id, actor });
      return updated;
    });
  }

  async function restoreRequirementTemplate(grants: PermissionGrants, actor: AuditActor, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfRequirementTemplate.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement-template.not-found", "Requirement template not found");
      if (!existing.deleted_at) throw new AppError("CONFLICT", "studioflow.requirement-template.not-archived", "Template is not archived");
      const updated = await db.sfRequirementTemplate.update({ where: { id }, data: { deleted_at: null } });
      await writeAudit({ action: "requirement_template.restore", entityType: "SfRequirementTemplate", entityId: id, actor });
      return updated;
    });
  }

  async function deleteRequirementTemplate(grants: PermissionGrants, actor: AuditActor, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfRequirementTemplate.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement-template.not-found", "Requirement template not found");
      if (existing.key_immutable) {
        throw new AppError("CONFLICT", "studioflow.requirement-template.key-in-use", "Cannot delete a template whose key has been used in a project snapshot");
      }
      if (!existing.deleted_at) {
        throw new AppError("CONFLICT", "studioflow.requirement-template.not-archived", "Archive the template before deleting");
      }
      await db.sfRequirementTemplate.delete({ where: { id } });
      await writeAudit({ action: "requirement_template.delete", entityType: "SfRequirementTemplate", entityId: id, actor });
    });
  }

  // ── §7.1.1 Project requirements ─────────────────────────────────────────

  async function listProjectRequirements(
    grants: PermissionGrants,
    projectId: string,
    opts?: { phaseId?: string | null; includeArchived?: boolean },
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const project = await db.sfProject.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");
    const where: Record<string, unknown> = { project_id: projectId };
    if (opts?.phaseId !== undefined) where.phase_id = opts.phaseId;
    if (!opts?.includeArchived) where.archived_at = null;
    return db.sfProjectRequirement.findMany({
      where,
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      include: {
        evidence: {
          where: { unlinked_at: null },
          include: { file: { select: { id: true, filename: true, original_filename: true, treatment: true, folder_key: true } } },
        },
      },
    });
  }

  async function getProjectRequirement(grants: PermissionGrants, id: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const row = await db.sfProjectRequirement.findUnique({
      where: { id },
      include: {
        evidence: {
          where: { unlinked_at: null },
          include: { file: { select: { id: true, filename: true, original_filename: true, treatment: true, folder_key: true } } },
        },
      },
    });
    if (!row) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
    return row;
  }

  async function createProjectRequirement(
    grants: PermissionGrants,
    actor: AuditActor,
    input: CreateProjectRequirementInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!input.title.trim()) throw new AppError("VALIDATION", "studioflow.requirement.title-required", "Requirement title is required");
    return runTransaction(async () => {
      const project = await db.sfProject.findUnique({ where: { id: input.project_id } });
      if (!project) throw new AppError("NOT_FOUND", "studioflow.project.not-found", "Project not found");
      if (project.deleted_at) throw new AppError("CONFLICT", "studioflow.project.archived", "Cannot add requirements to an archived project");
      if (input.phase_id) {
        const phase = await db.sfProjectPhase.findFirst({ where: { id: input.phase_id, project_id: input.project_id } });
        if (!phase) throw new AppError("NOT_FOUND", "studioflow.phase.not-found", "Phase not found in this project");
      }
      const last = await db.sfProjectRequirement.findFirst({
        where: { project_id: input.project_id, phase_id: input.phase_id ?? null },
        orderBy: { sort_order: "desc" },
        select: { sort_order: true },
      });
      const created = await db.sfProjectRequirement.create({
        data: {
          project_id: input.project_id,
          phase_id: input.phase_id ?? null,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          sort_order: input.sort_order ?? ((last?.sort_order ?? 0) + 1),
        },
      });
      await writeAudit({
        action: "requirement.create",
        entityType: "SfProjectRequirement",
        entityId: created.id,
        actor,
        changes: { project_id: input.project_id, phase_id: input.phase_id, title: created.title },
      });
      return created;
    });
  }

  async function editProjectRequirement(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: EditProjectRequirementInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const existing = await db.sfProjectRequirement.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      if (existing.archived_at) throw new AppError("CONFLICT", "studioflow.requirement.archived", "Cannot edit an archived requirement");
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title.trim();
      if (input.description !== undefined) data.description = input.description?.trim() || null;
      if (input.sort_order !== undefined) data.sort_order = input.sort_order;
      if (Object.keys(data).length === 0) return existing;
      const updated = await db.sfProjectRequirement.update({ where: { id }, data });
      await writeAudit({
        action: "requirement.edit",
        entityType: "SfProjectRequirement",
        entityId: id,
        actor,
        changes: { before: { title: existing.title, description: existing.description }, after: data },
      });
      return updated;
    });
  }

  async function satisfyRequirement(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: SatisfyRequirementInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!input.satisfaction_note.trim()) {
      throw new AppError("VALIDATION", "studioflow.requirement.satisfaction-note-required", "Satisfaction note is required");
    }
    return runTransaction(async () => {
      const existing = await db.sfProjectRequirement.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      if (existing.archived_at) throw new AppError("CONFLICT", "studioflow.requirement.archived", "Cannot satisfy an archived requirement");
      if (existing.satisfaction_state === "SATISFIED") {
        throw new AppError("CONFLICT", "studioflow.requirement.already-satisfied", "Requirement is already satisfied");
      }
      const updated = await db.sfProjectRequirement.update({
        where: { id },
        data: {
          satisfaction_state: "SATISFIED",
          satisfied_at: new Date(),
          satisfied_by_id: actor.userId,
          satisfaction_note: input.satisfaction_note.trim(),
        },
      });
      await writeAudit({
        action: "requirement.satisfy",
        entityType: "SfProjectRequirement",
        entityId: id,
        actor,
        changes: { project_id: existing.project_id, phase_id: existing.phase_id, satisfaction_note: input.satisfaction_note.trim() },
      });
      return updated;
    });
  }

  async function reopenRequirement(
    grants: PermissionGrants,
    actor: AuditActor,
    id: string,
    input: ReopenRequirementInput,
  ) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!input.reopen_reason.trim()) {
      throw new AppError("VALIDATION", "studioflow.requirement.reopen-reason-required", "Reopen reason is required");
    }
    return runTransaction(async () => {
      const existing = await db.sfProjectRequirement.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      if (existing.archived_at) throw new AppError("CONFLICT", "studioflow.requirement.archived", "Cannot reopen an archived requirement");
      if (existing.satisfaction_state === "OPEN") {
        throw new AppError("CONFLICT", "studioflow.requirement.already-open", "Requirement is already open");
      }
      const updated = await db.sfProjectRequirement.update({
        where: { id },
        data: {
          satisfaction_state: "OPEN",
          satisfied_at: null,
          satisfied_by_id: null,
          satisfaction_note: null,
        },
      });
      await writeAudit({
        action: "requirement.reopen",
        entityType: "SfProjectRequirement",
        entityId: id,
        actor,
        changes: { project_id: existing.project_id, phase_id: existing.phase_id, reopen_reason: input.reopen_reason.trim() },
      });
      return updated;
    });
  }

  async function archiveRequirement(grants: PermissionGrants, actor: AuditActor, id: string, input: ArchiveRequirementInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!input.reason.trim()) throw new AppError("VALIDATION", "studioflow.requirement.archive-reason-required", "Archive reason is required");
    return runTransaction(async () => {
      const existing = await db.sfProjectRequirement.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      if (existing.archived_at) throw new AppError("CONFLICT", "studioflow.requirement.already-archived", "Requirement is already archived");
      const now = new Date();
      const updated = await db.sfProjectRequirement.update({
        where: { id },
        data: { archived_at: now, archived_by_id: actor.userId, archive_reason: input.reason.trim(), deleted_at: now },
      });
      await writeAudit({
        action: "requirement.archive",
        entityType: "SfProjectRequirement",
        entityId: id,
        actor,
        changes: { project_id: existing.project_id, phase_id: existing.phase_id, reason: input.reason.trim() },
      });
      return updated;
    });
  }

  async function restoreRequirement(grants: PermissionGrants, actor: AuditActor, id: string, input: RestoreRequirementInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!input.reason.trim()) throw new AppError("VALIDATION", "studioflow.requirement.restore-reason-required", "Restore reason is required");
    return runTransaction(async () => {
      const existing = await db.sfProjectRequirement.findUnique({ where: { id } });
      if (!existing) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      if (!existing.archived_at) throw new AppError("CONFLICT", "studioflow.requirement.not-archived", "Requirement is not archived");
      const updated = await db.sfProjectRequirement.update({
        where: { id },
        data: {
          archived_at: null,
          archived_by_id: null,
          archive_reason: null,
          deleted_at: null,
          restored_at: new Date(),
          restored_by_id: actor.userId,
          restore_reason: input.reason.trim(),
        },
      });
      await writeAudit({
        action: "requirement.restore",
        entityType: "SfProjectRequirement",
        entityId: id,
        actor,
        changes: { project_id: existing.project_id, phase_id: existing.phase_id, reason: input.reason.trim() },
      });
      return updated;
    });
  }

  async function linkEvidence(grants: PermissionGrants, actor: AuditActor, requirementId: string, input: LinkEvidenceInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    return runTransaction(async () => {
      const req = await db.sfProjectRequirement.findUnique({ where: { id: requirementId } });
      if (!req) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      if (req.archived_at) throw new AppError("CONFLICT", "studioflow.requirement.archived", "Cannot link evidence to an archived requirement");
      const file = await db.sfFile.findUnique({ where: { id: input.file_id } });
      if (!file) throw new AppError("NOT_FOUND", "studioflow.file.not-found", "File not found");
      if (file.project_id !== req.project_id) {
        throw new AppError("VALIDATION", "studioflow.requirement.evidence-wrong-project", "Evidence file must belong to the same project as the requirement");
      }
      const existing = await db.sfRequirementEvidence.findUnique({
        where: { requirement_id_file_id: { requirement_id: requirementId, file_id: input.file_id } },
      });
      if (existing && !existing.unlinked_at) {
        throw new AppError("CONFLICT", "studioflow.requirement.evidence-already-linked", "File is already linked as evidence");
      }
      if (existing && existing.unlinked_at) {
        const restored = await db.sfRequirementEvidence.update({
          where: { id: existing.id },
          data: { unlinked_at: null, unlinked_by_id: null, unlink_reason: null, linked_at: new Date(), linked_by_id: actor.userId },
        });
        await writeAudit({ action: "requirement.evidence.link", entityType: "SfRequirementEvidence", entityId: restored.id, actor, changes: { requirement_id: requirementId, file_id: input.file_id } });
        return restored;
      }
      const created = await db.sfRequirementEvidence.create({
        data: { requirement_id: requirementId, file_id: input.file_id, linked_by_id: actor.userId },
      });
      await writeAudit({ action: "requirement.evidence.link", entityType: "SfRequirementEvidence", entityId: created.id, actor, changes: { requirement_id: requirementId, file_id: input.file_id } });
      return created;
    });
  }

  async function unlinkEvidence(grants: PermissionGrants, actor: AuditActor, requirementId: string, evidenceId: string, input: UnlinkEvidenceInput) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);
    if (!input.reason.trim()) throw new AppError("VALIDATION", "studioflow.requirement.unlink-reason-required", "Unlink reason is required");
    return runTransaction(async () => {
      const req = await db.sfProjectRequirement.findUnique({ where: { id: requirementId } });
      if (!req) throw new AppError("NOT_FOUND", "studioflow.requirement.not-found", "Requirement not found");
      const evidence = await db.sfRequirementEvidence.findFirst({ where: { id: evidenceId, requirement_id: requirementId } });
      if (!evidence) throw new AppError("NOT_FOUND", "studioflow.requirement.evidence-not-found", "Evidence not found");
      if (evidence.unlinked_at) throw new AppError("CONFLICT", "studioflow.requirement.evidence-already-unlinked", "Evidence is already unlinked");
      const updated = await db.sfRequirementEvidence.update({
        where: { id: evidenceId },
        data: { unlinked_at: new Date(), unlinked_by_id: actor.userId, unlink_reason: input.reason.trim() },
      });
      await writeAudit({ action: "requirement.evidence.unlink", entityType: "SfRequirementEvidence", entityId: evidenceId, actor, changes: { requirement_id: requirementId, file_id: evidence.file_id, reason: input.reason.trim() } });
      return updated;
    });
  }

  // ── §7.1.1 Requirement snapshot helpers ─────────────────────────────────

  /**
   * Snapshots active RequirementTemplates for a project.
   * Called inside the project creation transaction AND when adding a project phase.
   */
  async function snapshotRequirementsForProject(
    db: PrismaClient,
    projectId: string,
    projectPhaseId: string,
    phaseTemplateId: string,
  ) {
    // 1. Snapshot active General templates (scope=GENERAL, no phase_template_id)
    const generalTemplates = await db.sfRequirementTemplate.findMany({
      where: { scope: "GENERAL", deleted_at: null },
      orderBy: { sort_order: "asc" },
    });
    for (const tmpl of generalTemplates) {
      await db.sfProjectRequirement.create({
        data: {
          project_id: projectId,
          phase_id: null,
          source_template_id: tmpl.id,
          template_key_snapshot: tmpl.key,
          title: tmpl.title,
          description: tmpl.description,
          sort_order: tmpl.sort_order,
        },
      });
      // Mark key as immutable after first use
      if (!tmpl.key_immutable) {
        await db.sfRequirementTemplate.update({ where: { id: tmpl.id }, data: { key_immutable: true } });
      }
    }
    // 2. Snapshot active Phase templates for this specific phase
    const phaseTemplates = await db.sfRequirementTemplate.findMany({
      where: { scope: "PHASE", phase_template_id: phaseTemplateId, deleted_at: null },
      orderBy: { sort_order: "asc" },
    });
    for (const tmpl of phaseTemplates) {
      await db.sfProjectRequirement.create({
        data: {
          project_id: projectId,
          phase_id: projectPhaseId,
          source_template_id: tmpl.id,
          template_key_snapshot: tmpl.key,
          title: tmpl.title,
          description: tmpl.description,
          sort_order: tmpl.sort_order,
        },
      });
      if (!tmpl.key_immutable) {
        await db.sfRequirementTemplate.update({ where: { id: tmpl.id }, data: { key_immutable: true } });
      }
    }
  }

  // ── §7.1.1 Project requirement queries ─────────────────────────────────

  async function listGeneralRequirements(grants: PermissionGrants, projectId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    return db.sfProjectRequirement.findMany({
      where: { project_id: projectId, phase_id: null, archived_at: null },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      include: {
        evidence: {
          where: { unlinked_at: null },
          include: { file: { select: { id: true, filename: true, treatment: true } } },
        },
      },
    });
  }

  async function listPhaseRequirements(grants: PermissionGrants, projectId: string, phaseId: string) {
    requirePermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
    const phase = await db.sfProjectPhase.findFirst({ where: { id: phaseId, project_id: projectId } });
    if (!phase) throw new AppError("NOT_FOUND", "studioflow.phase.not-found", "Phase not found in this project");
    return db.sfProjectRequirement.findMany({
      where: { project_id: projectId, phase_id: phaseId, archived_at: null },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
      include: {
        evidence: {
          where: { unlinked_at: null },
          include: { file: { select: { id: true, filename: true, treatment: true } } },
        },
      },
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
    // Client responses (WO-5)
    recordResponse,
    listResponses,
    // File management (WO-6)
    linkFile,
    moveFile,
    supersedeFile,
    listProjectFiles,
    listCatalogueProducts,
    getCatalogueProduct,
    createCatalogueProduct,
    editCatalogueProduct,
    archiveCatalogueProduct,
    restoreCatalogueProduct,
    // MOM
    listMomDocuments,
    getMom,
    createMomDraft,
    updateMomDraft,
    discardMomDraft,
    updateMomContent,
    assertMomDraftEditable,
    issueMom,
    supersedeMom,
    // People (platform user labels for StudioFlow surfaces)
    listUserLabels,
    // Tasks (SF-F4)
    listTasks,
    listAssignableUsers,
    createTask,
    updateTask,
    assignTask,
    setTaskCompletion,
    reorderTask,
    deleteTask,
    // Workload (SF-F5 read model)
    listWaitingOnMe,
    // §7.1.1 Requirement templates
    listRequirementTemplates,
    getRequirementTemplate,
    createRequirementTemplate,
    editRequirementTemplate,
    archiveRequirementTemplate,
    restoreRequirementTemplate,
    deleteRequirementTemplate,
    // §7.1.1 Project requirements
    listProjectRequirements,
    getProjectRequirement,
    createProjectRequirement,
    editProjectRequirement,
    satisfyRequirement,
    reopenRequirement,
    archiveRequirement,
    restoreRequirement,
    // §7.1.1 Evidence
    linkEvidence,
    unlinkEvidence,
    // §7.1.1 Queries
    listGeneralRequirements,
    listPhaseRequirements,
  };
}
