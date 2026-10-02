import { createAssetRetentionService } from "./asset-retention";
import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { listAuditEvents } from "@platform/core/audit/persistence";
import type { PersonSummary } from "@platform/core/rbac/people";
import { currentDateOnly } from "@platform/utilities/date";
import { toDecimalString } from "@platform/utilities/decimal";
import { normalizeText } from "@platform/utilities/normalization";

import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import { iterationChoices, iterationKinds } from "../domain/iteration-kinds";
import { waitingDays, type PhaseStatus } from "../domain/phase";
import {
  P,
  conflict,
  getProjectAccess,
  hasPermission,
  invalid,
  loadWritableProject,
  mapWriteError,
  notFound,
  nowOf,
  optionalText,
  requireCommand,
  requireProjectAccess,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";
import { seedScheduleFromTemplates } from "../schedule/sync";
import { seedChecklistFromTemplates } from "../tasks/sync";

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_PRIORITIES = ["URGENT", "NORMAL", "LOW"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export type ProjectInput = {
  name: string;
  clientId?: string | null;
  /** Creates (or reuses by name) a client in the same transaction. */
  newClientName?: string | null;
  picDesignerId: string;
  picDrafterId: string;
  openingDate?: string | null;
  /** Gantt/timeline start override; null clears it back to the `createdAt`-date fallback. */
  timelineStartDate?: string | null;
  priority?: ProjectPriority;
  clientContact?: string | null;
  address?: string | null;
  area?: string | null;
};

export type ProjectEditInput = Partial<Omit<ProjectInput, "priority">>;

const SETTINGS_ID = "studio";

function clientKey(name: string): string {
  return normalizeText(name).toLowerCase();
}

function parseArea(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  let decimal: string;
  try {
    decimal = toDecimalString(text);
  } catch {
    throw invalid("PROJECT_AREA_INVALID", "Area must be a number.");
  }
  if (decimal.startsWith("-")) throw invalid("PROJECT_AREA_INVALID", "Area cannot be negative.");
  return decimal;
}

function parseOpeningDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    return dateOnlyToDate(value);
  } catch {
    throw invalid("PROJECT_OPENING_DATE_INVALID", "Opening date must be a valid date.");
  }
}

export function createProjectService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  async function readSettings(client: Db | TxClient) {
    const row = await client.sfSettings.findUnique({ where: { id: SETTINGS_ID } });
    return { archiveRetentionDays: row?.archive_retention_days ?? 90 };
  }

  async function assertPic(userId: string, seat: "designer" | "drafter"): Promise<void> {
    const holders = await ports.people.listHolders(seat === "designer" ? P.projectPicDesigner : P.projectPicDrafter);
    if (!holders.some((person) => person.id === userId)) {
      throw invalid("PIC_NOT_ELIGIBLE", `The selected ${seat} must be an active staff member eligible for that PIC seat.`);
    }
  }

  async function upsertClientByName(tx: TxClient, name: string, actor: CommandContext["actor"]) {
    const clean = requiredText(name, "CLIENT_NAME_REQUIRED", "Client name", 200);
    const nameKey = clientKey(clean);
    const existing = await tx.sfClient.findUnique({ where: { name_key: nameKey } });
    if (existing) {
      if (existing.archived_at) throw conflict("CLIENT_ARCHIVED", "That client is archived. Restore it first.");
      return existing;
    }
    // ON CONFLICT DO NOTHING instead of catching a unique violation: a failed statement aborts the whole
    // Postgres transaction, so the loser of a concurrent same-name race could not read the winner's row.
    const inserted = await tx.$executeRaw`
      INSERT INTO "studioflow"."sf_client" ("id", "name", "name_key", "updated_at")
      VALUES (${randomUUID()}, ${clean}, ${nameKey}, now())
      ON CONFLICT ("name_key") DO NOTHING`;
    const created = await tx.sfClient.findUniqueOrThrow({ where: { name_key: nameKey } });
    if (inserted === 0) {
      if (created.archived_at) throw conflict("CLIENT_ARCHIVED", "That client is archived. Restore it first.");
      return created;
    }
    await writeAudit(ports, tx, { action: "studioflow.client.created", entityType: "client", entityId: created.id, actor, metadata: { name: clean } });
    return created;
  }

  /** A unique-name violation on SfProject is a taken name; anything else maps as usual. */
  function mapProjectWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("PROJECT_NAME_TAKEN", "A project with this name already exists.");
    }
    return mapWriteError(error);
  }

  async function resolveClientId(tx: TxClient, input: { clientId?: string | null; newClientName?: string | null }, actor: CommandContext["actor"]) {
    if (input.newClientName && input.newClientName.trim()) return (await upsertClientByName(tx, input.newClientName, actor)).id;
    if (!input.clientId) return null;
    const client = await tx.sfClient.findUnique({ where: { id: input.clientId } });
    if (!client) throw notFound("client");
    if (client.archived_at) throw conflict("CLIENT_ARCHIVED", "That client is archived. Restore it first.");
    return client.id;
  }

  async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, PersonSummary>> {
    const people = await ports.people.resolve(ids.filter((id): id is string => Boolean(id)));
    return new Map(people.map((person) => [person.id, person]));
  }

  return {
    // ── Settings ───────────────────────────────────────────────────────────
    ...createAssetRetentionService(db, ports),
    async getStudioSettings(input: ReadContext) {
      requireRead(input.grants);
      return readSettings(db);
    },

    async setArchiveRetention(input: CommandContext & { archiveRetentionDays: number }) {
      const userId = requireCommand(input, P.settingsManage);
      if (!Number.isInteger(input.archiveRetentionDays) || input.archiveRetentionDays < 7 || input.archiveRetentionDays > 730) {
        throw invalid("ARCHIVE_RETENTION_INVALID", "Keep archived files for a whole number of days between 7 and 730.");
      }
      return runTransaction(async (tx) => {
        const before = await readSettings(tx);
        const archiveRetentionDays = input.archiveRetentionDays;
        if (before.archiveRetentionDays === archiveRetentionDays) return before;
        await tx.sfSettings.upsert({
          where: { id: SETTINGS_ID },
          create: { id: SETTINGS_ID, archive_retention_days: archiveRetentionDays, updated_by_id: userId },
          update: { archive_retention_days: archiveRetentionDays, updated_by_id: userId },
        });
        await writeAudit(ports, tx, { action: "studioflow.settings.updated", entityType: "settings", entityId: SETTINGS_ID, actor: input.actor, changes: { archiveRetentionDays: { from: before.archiveRetentionDays, to: archiveRetentionDays } } });
        return { archiveRetentionDays };
      });
    },

    // ── People ─────────────────────────────────────────────────────────────
    /** PIC candidates are defined by their requested seat; task assignees keep phase-work eligibility. */
    async listAssignablePeople(input: ReadContext & { seat?: "designer" | "drafter" }) {
      requireRead(input.grants);
      return ports.people.listHolders(input.seat === "designer" ? P.projectPicDesigner : input.seat === "drafter" ? P.projectPicDrafter : P.phaseWork);
    },

    async resolvePeople(input: ReadContext & { userIds: readonly string[] }) {
      requireRead(input.grants);
      return ports.people.resolve(input.userIds);
    },

    // ── Clients ────────────────────────────────────────────────────────────
    async listClients(input: ReadContext & { includeArchived?: boolean; search?: string }) {
      requireRead(input.grants);
      const search = input.search?.trim();
      const rows = await db.sfClient.findMany({
        where: {
          ...(input.includeArchived ? {} : { archived_at: null }),
          ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, address: true, archived_at: true, updated_at: true,
          projects: { where: { archived_at: null }, select: { status: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
        activeProjects: row.projects.filter((p) => p.status !== "COMPLETED").length,
        totalProjects: row.projects.length,
      }));
    },

    async getClient(input: ReadContext & { clientId: string }) {
      requireRead(input.grants);
      const client = await db.sfClient.findUnique({
        where: { id: input.clientId },
        include: { projects: { orderBy: { name: "desc" }, select: { id: true, name: true, status: true, priority: true, archived_at: true } } },
      });
      if (!client) throw notFound("client");
      return client;
    },

    async createClient(input: CommandContext & { name: string; address?: string | null }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const name = requiredText(input.name, "CLIENT_NAME_REQUIRED", "Client name", 200);
        if (await tx.sfClient.findUnique({ where: { name_key: clientKey(name) } })) {
          throw conflict("CLIENT_NAME_TAKEN", "A client with this name already exists.");
        }
        let client;
        try {
          client = await tx.sfClient.create({ data: { id: randomUUID(), name, name_key: clientKey(name), address: optionalText(input.address) } });
        } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "studioflow.client.created", entityType: "client", entityId: client!.id, actor: input.actor, metadata: { name } });
        return { clientId: client!.id };
      });
    },

    async updateClient(input: CommandContext & { clientId: string; name: string; address?: string | null }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const existing = await tx.sfClient.findUnique({ where: { id: input.clientId } });
        if (!existing) throw notFound("client");
        const name = requiredText(input.name, "CLIENT_NAME_REQUIRED", "Client name", 200);
        const address = optionalText(input.address);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (existing.name !== name) changes.name = { from: existing.name, to: name };
        if (existing.address !== address) changes.address = { from: existing.address, to: address };
        if (Object.keys(changes).length === 0) return { clientId: existing.id };
        try {
          await tx.sfClient.update({ where: { id: existing.id }, data: { name, name_key: clientKey(name), address } });
        } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "studioflow.client.updated", entityType: "client", entityId: existing.id, actor: input.actor, changes });
        return { clientId: existing.id };
      });
    },

    async setClientLogo(input: CommandContext & { clientId: string; storageKey: string | null }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const existing = await tx.sfClient.findUnique({ where: { id: input.clientId } });
        if (!existing) throw notFound("client");
        await tx.sfClient.update({ where: { id: existing.id }, data: { logo_storage_key: input.storageKey } });
        await writeAudit(ports, tx, { action: "studioflow.client.logo-changed", entityType: "client", entityId: existing.id, actor: input.actor, metadata: { hasLogo: input.storageKey !== null } });
        return { previousKey: existing.logo_storage_key };
      });
    },

    async archiveClient(input: CommandContext & { clientId: string }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const client = await tx.sfClient.findUnique({ where: { id: input.clientId } });
        if (!client) throw notFound("client");
        if (client.archived_at) return { clientId: client.id };
        const live = await tx.sfProject.count({ where: { client_id: client.id, archived_at: null, status: { not: "COMPLETED" } } });
        if (live > 0) throw conflict("CLIENT_HAS_LIVE_PROJECTS", `This client still has ${live} running project(s).`);
        await tx.sfClient.update({ where: { id: client.id }, data: { archived_at: nowOf(ports) } });
        await writeAudit(ports, tx, { action: "studioflow.client.archived", entityType: "client", entityId: client.id, actor: input.actor });
        return { clientId: client.id };
      });
    },

    async restoreClient(input: CommandContext & { clientId: string }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const client = await tx.sfClient.findUnique({ where: { id: input.clientId } });
        if (!client) throw notFound("client");
        if (!client.archived_at) return { clientId: client.id };
        await tx.sfClient.update({ where: { id: client.id }, data: { archived_at: null } });
        await writeAudit(ports, tx, { action: "studioflow.client.restored", entityType: "client", entityId: client.id, actor: input.actor });
        return { clientId: client.id };
      });
    },

    /** Bounded header search; directory readers retain their full projections. */
    async quickSearch(input: ReadContext & { search: string; limit?: number }) {
      requireRead(input.grants);
      const search = input.search.trim();
      const limit = input.limit ?? 6;
      const [projects, clients] = await Promise.all([
        db.sfProject.findMany({
          where: {
            archived_at: null,
            ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { client: { name: { contains: search, mode: "insensitive" as const } } }] } : {}),
          },
          orderBy: [{ priority: "asc" }, { name: "desc" }],
          take: limit,
          select: { id: true, name: true, client: { select: { name: true } } },
        }),
        db.sfClient.findMany({
          where: { archived_at: null, ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}) },
          orderBy: { name: "asc" },
          take: limit,
          select: { id: true, name: true },
        }),
      ]);
      return {
        projects: projects.map((project) => ({ id: project.id, name: project.name, clientName: project.client?.name ?? null })),
        clients,
      };
    },

    // ── Projects ───────────────────────────────────────────────────────────
    async listProjects(input: ReadContext & {
      status?: ProjectStatus | "ALL";
      priority?: ProjectPriority;
      picUserId?: string;
      clientId?: string;
      search?: string;
      archived?: boolean;
    }) {
      requireRead(input.grants);
      const search = input.search?.trim();
      const where: Prisma.SfProjectWhereInput = {
        archived_at: input.archived ? { not: null } : null,
        ...(input.status && input.status !== "ALL" ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.clientId ? { client_id: input.clientId } : {}),
        ...(input.picUserId ? { OR: [{ pic_designer_id: input.picUserId }, { pic_drafter_id: input.picUserId }] } : {}),
        ...(search ? { AND: [{ OR: [{ name: { contains: search, mode: "insensitive" } }, { client: { name: { contains: search, mode: "insensitive" } } }] }] } : {}),
      };
      const rows = await db.sfProject.findMany({
        where,
        orderBy: [{ priority: "asc" }, { name: "desc" }],
        include: {
          client: { select: { id: true, name: true } },
          phases: { orderBy: { order_index: "asc" }, select: { id: true, definition_id: true, status: true, is_locked: true, status_changed_at: true, name_snapshot: true, planned_start_date: true, planned_end_date: true } },
          _count: { select: { activities: { where: { status: "OPEN" } }, checklist_items: { where: { is_checked: false, parent_id: null } } } },
        },
      });
      const people = await namesFor(rows.flatMap((row) => [row.pic_designer_id, row.pic_drafter_id]));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        client: row.client,
        status: row.status as ProjectStatus,
        priority: row.priority as ProjectPriority,
        openingDate: dateToDateOnly(row.opening_date),
        /** Gantt/timeline start; falls back to `createdAt`'s date when the owner hasn't overridden it. */
        timelineStartDate: dateToDateOnly(row.timeline_start_date) ?? dateToDateOnly(row.created_at)!,
        clientContact: row.client_contact,
        address: row.address,
        area: row.area ? row.area.toString() : null,
        archivedAt: row.archived_at,
        assetsPurgedAt: row.assets_purged_at,
        updatedAt: row.updated_at,
        designer: people.get(row.pic_designer_id) ?? { id: row.pic_designer_id, displayName: "Unknown", active: false },
        drafter: people.get(row.pic_drafter_id) ?? { id: row.pic_drafter_id, displayName: "Unknown", active: false },
        phases: row.phases.map((phase) => ({ id: phase.id, definitionId: phase.definition_id, status: phase.status as PhaseStatus, isLocked: phase.is_locked, statusChangedAt: phase.status_changed_at, label: phase.name_snapshot, plannedStartDate: dateToDateOnly(phase.planned_start_date), plannedEndDate: dateToDateOnly(phase.planned_end_date) })),
        openItems: row._count.activities + row._count.checklist_items,
      }));
    },

    async getProject(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const row = await db.sfProject.findUnique({ where: { id: input.projectId }, include: { client: { select: { id: true, name: true, address: true } } } });
      if (!row) throw notFound("project");
      const people = await namesFor([row.pic_designer_id, row.pic_drafter_id, row.archived_by_id]);
      return {
        id: row.id,
        name: row.name,
        client: row.client,
        status: row.status as ProjectStatus,
        priority: row.priority as ProjectPriority,
        openingDate: dateToDateOnly(row.opening_date),
        /** Gantt/timeline start; falls back to `createdAt`'s date when the owner hasn't overridden it. */
        timelineStartDate: dateToDateOnly(row.timeline_start_date) ?? dateToDateOnly(row.created_at)!,
        clientContact: row.client_contact,
        address: row.address,
        area: row.area ? row.area.toString() : null,
        designer: people.get(row.pic_designer_id) ?? { id: row.pic_designer_id, displayName: "Unknown", active: false },
        drafter: people.get(row.pic_drafter_id) ?? { id: row.pic_drafter_id, displayName: "Unknown", active: false },
        archivedAt: row.archived_at,
        assetsPurgedAt: row.assets_purged_at,
        archivedBy: row.archived_by_id ? people.get(row.archived_by_id)?.displayName ?? null : null,
        archiveReason: row.archive_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    /** Legacy `executeBootstrapProject` (contract §4.3). */
    async createProject(input: CommandContext & ProjectInput) {
      const userId = requireCommand(input, P.projectManage);
      await assertPic(input.picDesignerId, "designer");
      await assertPic(input.picDrafterId, "drafter");
      const area = parseArea(input.area);
      const openingDate = parseOpeningDate(input.openingDate);
      const now = nowOf(ports);
      return runTransaction(async (tx) => {
        const name = requiredText(input.name, "PROJECT_NAME_REQUIRED", "Project name", 200);
        if (await tx.sfProject.findFirst({ where: { name }, select: { id: true } })) {
          throw conflict("PROJECT_NAME_TAKEN", "A project with this name already exists.");
        }
        const clientId = await resolveClientId(tx, input, input.actor);
        const projectId = randomUUID();
        try {
          await tx.sfProject.create({
            data: {
              id: projectId,
              name,
              client_id: clientId,
              pic_designer_id: input.picDesignerId,
              pic_drafter_id: input.picDrafterId,
              opening_date: openingDate,
              priority: input.priority ?? "NORMAL",
              client_contact: optionalText(input.clientContact, 200),
              address: optionalText(input.address),
              area,
              created_by_id: userId,
            },
          });
        } catch (error) { mapProjectWriteError(error); }

        // Bootstrap from the active default phase template: one phase per definition, snapshotted (V2-D3).
        const defaultTemplate = await tx.sfPhaseTemplate.findFirst({ where: { is_default: true, is_active: true }, include: { definitions: { orderBy: { order_index: "asc" } } } });
        if (!defaultTemplate || defaultTemplate.definitions.length === 0) {
          throw conflict("PROJECT_PHASE_TEMPLATE_MISSING", "No active default phase template found. Create and set a default template before creating projects.");
        }
        const phaseIds: string[] = [];
        for (const [index, def] of defaultTemplate.definitions.entries()) {
          const id = randomUUID();
          phaseIds.push(id);
          const isFirst = index === 0;
          await tx.sfPhase.create({
            data: {
              id,
              project_id: projectId,
              definition_id: def.id,
              order_index: def.order_index,
              allow_parallel: def.allow_parallel,
              name_snapshot: def.name,
              prefix_snapshot: def.prefix,
              seat_snapshot: def.seat,
              status: isFirst ? "ACTIVE" : "PENDING",
              status_changed_at: isFirst ? now : null,
            },
          });
        }
        await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phaseIds[0]!, major: 1, name: `${defaultTemplate.definitions[0]!.name} 1`, status: "NOT_SENT" } });
        const seeded = await seedChecklistFromTemplates(tx, projectId, userId);
        // Legacy: default schedule categories and template items land on every new project.
        const scheduleRows = await seedScheduleFromTemplates(tx, projectId);
        await writeAudit(ports, tx, { action: "studioflow.project.created", entityType: "project", entityId: projectId, actor: input.actor, metadata: { projectId, name, clientId, checklistItems: seeded, scheduleRows } });
        return { projectId, name };
      });
    },

    async updateProject(input: CommandContext & { projectId: string } & ProjectEditInput) {
      const userId = requireCommand(input, P.projectManage);
      const area = input.area === undefined ? undefined : parseArea(input.area);
      const openingDate = input.openingDate === undefined ? undefined : parseOpeningDate(input.openingDate);
      const timelineStartDate = input.timelineStartDate === undefined ? undefined : parseOpeningDate(input.timelineStartDate);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await loadWritableProject(tx, input.projectId);
        const data: Prisma.SfProjectUncheckedUpdateInput = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const track = (key: string, from: unknown, to: unknown, apply: () => void) => {
          if (to === undefined) return;
          const a = from instanceof Date ? from.toISOString() : from === null ? null : String(from);
          const b = to instanceof Date ? to.toISOString() : to === null ? null : String(to);
          if (a !== b) { changes[key] = { from: a, to: b }; apply(); }
        };
        if (input.name !== undefined) {
          const next = requiredText(input.name, "PROJECT_NAME_REQUIRED", "Project name", 200);
          track("name", project.name, next, () => { data.name = next; });
        }
        if (input.picDesignerId !== undefined && input.picDesignerId !== project.pic_designer_id) await assertPic(input.picDesignerId, "designer");
        if (input.picDrafterId !== undefined && input.picDrafterId !== project.pic_drafter_id) await assertPic(input.picDrafterId, "drafter");
        track("picDesignerId", project.pic_designer_id, input.picDesignerId, () => { data.pic_designer_id = input.picDesignerId; });
        track("picDrafterId", project.pic_drafter_id, input.picDrafterId, () => { data.pic_drafter_id = input.picDrafterId; });
        // Keeping the current client (even an archived one) is not a change.
        const keepsClient = !input.newClientName?.trim() && input.clientId !== undefined && (input.clientId ?? null) === project.client_id;
        if (!keepsClient && (input.clientId !== undefined || input.newClientName)) {
          const clientId = await resolveClientId(tx, input, input.actor);
          track("clientId", project.client_id, clientId, () => { data.client_id = clientId; });
        }
        track("openingDate", project.opening_date, openingDate, () => { data.opening_date = openingDate; });
        track("timelineStartDate", project.timeline_start_date, timelineStartDate, () => { data.timeline_start_date = timelineStartDate; });
        if (input.clientContact !== undefined) {
          const value = optionalText(input.clientContact, 200);
          track("clientContact", project.client_contact, value, () => { data.client_contact = value; });
        }
        if (input.address !== undefined) {
          const value = optionalText(input.address);
          track("address", project.address, value, () => { data.address = value; });
        }
        track("area", project.area ? project.area.toString() : null, area, () => { data.area = area; });
        if (Object.keys(changes).length === 0) return { projectId: project.id };
        try {
          await tx.sfProject.update({ where: { id: project.id }, data });
        } catch (error) { mapProjectWriteError(error); }
        await writeAudit(ports, tx, { action: "studioflow.project.updated", entityType: "project", entityId: project.id, actor: input.actor, changes, metadata: { projectId: project.id } });
        return { projectId: project.id };
      });
    },

    async setProjectPriority(input: CommandContext & { projectId: string; priority: ProjectPriority }) {
      const userId = requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await loadWritableProject(tx, input.projectId);
        if (project.priority === input.priority) return { projectId: project.id };
        await tx.sfProject.update({ where: { id: project.id }, data: { priority: input.priority } });
        await writeAudit(ports, tx, { action: "studioflow.project.priority-changed", entityType: "project", entityId: project.id, actor: input.actor, changes: { priority: { from: project.priority, to: input.priority } }, metadata: { projectId: project.id } });
        return { projectId: project.id };
      });
    },

    /** ACTIVE ↔ ON_HOLD, or COMPLETED (legacy `executeCompleteProject`), or reactivate. */
    async setProjectStatus(input: CommandContext & { projectId: string; status: ProjectStatus }) {
      const userId = requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await loadWritableProject(tx, input.projectId);
        if (project.status === input.status) return { projectId: project.id };
        await tx.sfProject.update({ where: { id: project.id }, data: { status: input.status } });
        await writeAudit(ports, tx, { action: "studioflow.project.status-changed", entityType: "project", entityId: project.id, actor: input.actor, changes: { status: { from: project.status, to: input.status } }, metadata: { projectId: project.id } });
        return { projectId: project.id };
      });
    },

    async archiveProject(input: CommandContext & { projectId: string; reason: string }) {
      const userId = requireCommand(input, P.projectManage);
      const reason = requiredText(input.reason, "ARCHIVE_REASON_REQUIRED", "A reason", 500);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId } });
        if (!project) throw notFound("project");
        if (project.archived_at) throw conflict("PROJECT_ALREADY_ARCHIVED", "This project is already archived.");
        // A new archive starts a new retention cycle: clear the purge marker so a project that was purged,
        // restored, and archived again is eligible for cleanup again (restore deliberately keeps it for its audit).
        await tx.sfProject.update({ where: { id: project.id }, data: { archived_at: nowOf(ports), archived_by_id: userId, archive_reason: reason, assets_purged_at: null } });
        await writeAudit(ports, tx, { action: "studioflow.project.archived", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, reason } });
        return { projectId: project.id };
      });
    },

    async restoreProject(input: CommandContext & { projectId: string; reason?: string | null }) {
      const userId = requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId } });
        if (!project) throw notFound("project");
        if (!project.archived_at) throw conflict("PROJECT_NOT_ARCHIVED", "This project is not archived.");
        await tx.sfProject.update({ where: { id: project.id }, data: { archived_at: null, archived_by_id: null, archive_reason: null } });
        await writeAudit(ports, tx, { action: "studioflow.project.restored", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, reason: optionalText(input.reason, 500), previousReason: project.archive_reason, assetsPurged: project.assets_purged_at !== null } });
        return { projectId: project.id };
      });
    },

    /** Project History tab: this app's audit events for the project. */
    async getProjectHistory(input: ReadContext & { projectId: string; limit?: number }) {
      requireRead(input.grants);
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true } });
      if (!project) throw notFound("project");
      return listAuditEvents(db, {
        appId: "studioflow",
        anyOf: [{ entityType: "project", entityId: project.id }, { metadata: { path: ["projectId"], equals: project.id } }],
        limit: Math.min(Math.max(input.limit ?? 200, 1), 500),
      });
    },

    async getAccess(input: ReadContext & { actor: CommandContext["actor"]; projectId: string }) {
      requireRead(input.grants);
      if (input.actor.kind !== "USER" || !input.actor.userId) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
      return getProjectAccess(db, { grants: input.grants, actorId: input.actor.userId, projectId: input.projectId });
    },

    /** WO-SF-ITER-01 card read. One relation query keeps card rendering bounded at volume. */
    async listProjectCards(input: ReadContext & { filter: "all" | "mine"; actorId?: string }) {
      requireRead(input.grants);
      if (input.filter === "mine" && !input.actorId) throw invalid("ACTOR_REQUIRED", "My projects needs the signed-in user.");
      const rows = await db.sfProject.findMany({
        where: { archived_at: null, ...(input.filter === "mine" ? { OR: [{ pic_designer_id: input.actorId! }, { pic_drafter_id: input.actorId! }] } : {}) },
        orderBy: [{ updated_at: "desc" }, { name: "asc" }],
        include: {
          client: { select: { id: true, name: true } },
          phases: { orderBy: { order_index: "asc" }, include: {
            definition: { select: { default_iteration_kinds: true } },
            revisions: { orderBy: { major: "desc" }, select: { id: true, major: true, name: true, status: true, sent_at: true, visit_date: true, created_at: true } },
            checklist_items: { where: { is_checked: false, dismissed_at: null }, select: { id: true } },
          } },
        },
      });
      const now = nowOf(ports);
      return rows.map((project) => {
        const phases = project.phases.map((phase) => {
          const current = phase.revisions.find((iteration) => ["NOT_SENT", "SENT", "ANSWERED"].includes(iteration.status)) ?? null;
          const isSupervision = phase.definition_id === "00000000-0000-4000-8000-000000000105";
          const visits = phase.revisions.filter((iteration) => iteration.visit_date);
          const lastVisit = visits.sort((a, b) => (b.visit_date?.getTime() ?? 0) - (a.visit_date?.getTime() ?? 0))[0]?.visit_date ?? null;
          const kinds = iterationKinds(phase.definition.default_iteration_kinds);
          const choices = !current ? (phase.status === "DONE" ? ["add_iteration"] : []) : iterationChoices({ state: current.status, phaseStatus: phase.status, iterationName: current.name, kinds, supervision: isSupervision });
          return {
            id: phase.id, name: phase.name_snapshot, order: phase.order_index, status: phase.status as PhaseStatus,
            current_iteration: current ? { id: current.id, name: current.name, state: current.status, sent_at: current.sent_at, waiting_days: current.status === "SENT" ? waitingDays(current.sent_at, now) : null, available_choices: choices } : null,
            iteration_count: phase.revisions.length, has_note: Boolean(phase.note?.trim()),
            last_visit_days_ago: isSupervision ? waitingDays(lastVisit, now) : null,
          };
        });
        const allPhasesDone = project.phases.every((phase) => phase.status === "DONE");
        const earliestActive = project.phases.find((phase) => phase.status === "ACTIVE")?.order_index;
        return {
          id: project.id, name: project.name, client: project.client, status: project.status as ProjectStatus,
          pic_ids: { designer: project.pic_designer_id, drafter: project.pic_drafter_id },
          all_phases_done: allPhasesDone,
          dependents_review_suggested: earliestActive !== undefined && project.phases.some((phase) => phase.order_index > earliestActive && phase.status === "DONE"),
          can_mark_completed: project.status !== "COMPLETED" && Boolean(input.actorId && (project.pic_designer_id === input.actorId || project.pic_drafter_id === input.actorId || hasPermission(input.grants, P.projectOverride))),
          note_phases: project.phases.filter((phase) => Boolean(phase.note?.trim())).map((phase) => phase.id),
          requirements_waiting: project.phases.reduce((sum, phase) => sum + phase.checklist_items.length, 0),
          last_update_at: [project.updated_at, ...project.phases.map((phase) => phase.updated_at)].reduce((latest, value) => latest > value ? latest : value),
          phases,
        };
      });
    },

    canManageProjects(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.projectManage);
    },
  };
}
