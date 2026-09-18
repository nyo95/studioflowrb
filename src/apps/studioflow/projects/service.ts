import { randomUUID } from "node:crypto";

import { Prisma, type SfPhaseKey } from "@/generated/prisma/client";
import type { PersonSummary } from "@platform/core/rbac/people";
import { currentDateOnly } from "@platform/utilities/date";
import { toDecimalString } from "@platform/utilities/decimal";
import { normalizeText } from "@platform/utilities/normalization";

import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import { formatProjectName, looksFormatted, parseProjectName } from "../domain/naming";
import { PHASE_BLUEPRINT_SNAPSHOTS, type PhaseKey, type PhaseStatus } from "../domain/phase";
import {
  P,
  conflict,
  hasPermission,
  invalid,
  loadWritableProject,
  mapWriteError,
  notFound,
  nowOf,
  optionalText,
  requireCommand,
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
  projectType?: string | null;
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
    return { autoNamingEnabled: row?.auto_naming_enabled ?? true };
  }

  async function assertPic(userId: string, seat: string): Promise<void> {
    const holders = await ports.people.listHolders(P.phaseWork);
    if (!holders.some((person) => person.id === userId)) {
      throw invalid("PIC_NOT_ELIGIBLE", `The selected ${seat} must be an active staff member who can work on phases.`);
    }
  }

  async function upsertClientByName(tx: TxClient, name: string, actor: CommandContext["actor"]) {
    const clean = requiredText(name, "CLIENT_NAME_REQUIRED", "Client name", 200);
    const existing = await tx.sfClient.findUnique({ where: { name_key: clientKey(clean) } });
    if (existing) {
      if (existing.archived_at) throw conflict("CLIENT_ARCHIVED", "That client is archived. Restore it first.");
      return existing;
    }
    const created = await tx.sfClient.create({ data: { id: randomUUID(), name: clean, name_key: clientKey(clean) } });
    await writeAudit(ports, tx, { action: "studioflow.client.created", entityType: "client", entityId: created.id, actor, metadata: { name: clean } });
    return created;
  }

  async function resolveClientId(tx: TxClient, input: { clientId?: string | null; newClientName?: string | null }, actor: CommandContext["actor"]) {
    if (input.newClientName && input.newClientName.trim()) return (await upsertClientByName(tx, input.newClientName, actor)).id;
    if (!input.clientId) return null;
    const client = await tx.sfClient.findUnique({ where: { id: input.clientId } });
    if (!client) throw notFound("client");
    if (client.archived_at) throw conflict("CLIENT_ARCHIVED", "That client is archived. Restore it first.");
    return client.id;
  }

  async function allocateName(tx: TxClient, readable: string, autoNaming: boolean, now: Date) {
    const clean = requiredText(readable, "PROJECT_NAME_REQUIRED", "Project name", 200);
    if (!autoNaming) {
      const parsed = parseProjectName(clean);
      if (!parsed) throw invalid("PROJECT_NAME_FORMAT", "Project name must use the format: [YYYY]-[Number] [Name], for example 2025-429 Heloskin Cimanggu.");
      return { name: clean, code: parsed.code };
    }
    if (looksFormatted(clean)) {
      throw invalid("PROJECT_NAME_AUTO_CONFLICT", "Enter only the readable project name. Year and number are generated automatically.");
    }
    const year = Number(currentDateOnly({ now }).slice(0, 4));
    // Row-locked counter: concurrent creates in the same year serialize here.
    const [row] = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO "studioflow"."sf_project_sequence" ("year", "last_number")
      VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE SET "last_number" = "sf_project_sequence"."last_number" + 1
      RETURNING "last_number"`;
    // Respect manually named projects already using higher numbers this year.
    const manualMax = await tx.sfProject.findMany({ where: { project_code: { startsWith: `${year}-` } }, select: { project_code: true } });
    let sequence = row.last_number;
    const highest = manualMax.reduce((max, p) => Math.max(max, Number(p.project_code.split("-")[1]) || 0), 0);
    if (highest >= sequence) {
      sequence = highest + 1;
      await tx.sfProjectSequence.update({ where: { year }, data: { last_number: sequence } });
    }
    const name = formatProjectName(year, sequence, clean);
    return { name, code: parseProjectName(name)!.code };
  }

  async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, PersonSummary>> {
    const people = await ports.people.resolve(ids.filter((id): id is string => Boolean(id)));
    return new Map(people.map((person) => [person.id, person]));
  }

  return {
    // ── Settings ───────────────────────────────────────────────────────────
    async getStudioSettings(input: ReadContext) {
      requireRead(input.grants);
      return readSettings(db);
    },

    async setAutoNaming(input: CommandContext & { enabled: boolean }) {
      const userId = requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const before = await readSettings(tx);
        if (before.autoNamingEnabled === input.enabled) return { autoNamingEnabled: input.enabled };
        await tx.sfSettings.upsert({
          where: { id: SETTINGS_ID },
          create: { id: SETTINGS_ID, auto_naming_enabled: input.enabled, updated_by_id: userId },
          update: { auto_naming_enabled: input.enabled, updated_by_id: userId },
        });
        await writeAudit(ports, tx, { action: "studioflow.settings.updated", entityType: "settings", entityId: SETTINGS_ID, actor: input.actor, changes: { autoNamingEnabled: { from: before.autoNamingEnabled, to: input.enabled } } });
        return { autoNamingEnabled: input.enabled };
      });
    },

    // ── People ─────────────────────────────────────────────────────────────
    /** Staff who can be PIC or assignee: holders of `studioflow.phase.work`. */
    async listAssignablePeople(input: ReadContext) {
      requireRead(input.grants);
      return ports.people.listHolders(P.phaseWork);
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
          phases: { orderBy: { order_index: "asc" }, select: { id: true, key: true, status: true, is_locked: true, status_changed_at: true } },
          _count: { select: { activities: { where: { status: "OPEN" } }, checklist_items: { where: { is_checked: false, parent_id: null } } } },
        },
      });
      const people = await namesFor(rows.flatMap((row) => [row.pic_designer_id, row.pic_drafter_id]));
      return rows.map((row) => ({
        id: row.id,
        code: row.project_code,
        name: row.name,
        client: row.client,
        status: row.status as ProjectStatus,
        priority: row.priority as ProjectPriority,
        openingDate: dateToDateOnly(row.opening_date),
        archivedAt: row.archived_at,
        updatedAt: row.updated_at,
        designer: people.get(row.pic_designer_id) ?? { id: row.pic_designer_id, displayName: "Unknown", active: false },
        drafter: people.get(row.pic_drafter_id) ?? { id: row.pic_drafter_id, displayName: "Unknown", active: false },
        phases: row.phases.map((phase) => ({ id: phase.id, key: phase.key as PhaseKey, status: phase.status as PhaseStatus, isLocked: phase.is_locked, statusChangedAt: phase.status_changed_at })),
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
        code: row.project_code,
        name: row.name,
        readableName: parseProjectName(row.name)?.readable ?? row.name,
        client: row.client,
        status: row.status as ProjectStatus,
        priority: row.priority as ProjectPriority,
        projectType: row.project_type,
        openingDate: dateToDateOnly(row.opening_date),
        clientContact: row.client_contact,
        address: row.address,
        area: row.area ? row.area.toString() : null,
        designer: people.get(row.pic_designer_id) ?? { id: row.pic_designer_id, displayName: "Unknown", active: false },
        drafter: people.get(row.pic_drafter_id) ?? { id: row.pic_drafter_id, displayName: "Unknown", active: false },
        archivedAt: row.archived_at,
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
        const settings = await readSettings(tx);
        const { name, code } = await allocateName(tx, input.name, settings.autoNamingEnabled, now);
        if (await tx.sfProject.findFirst({ where: { OR: [{ name }, { project_code: code }] }, select: { id: true } })) {
          throw conflict("PROJECT_NAME_TAKEN", "A project with this name or number already exists.");
        }
        const clientId = await resolveClientId(tx, input, input.actor);
        const projectId = randomUUID();
        try {
          await tx.sfProject.create({
            data: {
              id: projectId,
              project_code: code,
              name,
              client_id: clientId,
              pic_designer_id: input.picDesignerId,
              pic_drafter_id: input.picDrafterId,
              opening_date: openingDate,
              project_type: optionalText(input.projectType, 60) ?? "RETAIL",
              priority: input.priority ?? "NORMAL",
              client_contact: optionalText(input.clientContact, 200),
              address: optionalText(input.address),
              area,
              created_by_id: userId,
            },
          });
        } catch (error) { mapWriteError(error); }

        const phaseIds = new Map<PhaseKey, string>();
        // Bootstrap from default Phase Template (V2-D3)
        const defaultTemplate = await tx.sfPhaseTemplate.findFirst({ where: { is_default: true, is_active: true }, include: { definitions: { orderBy: { order_index: "asc" } } } });
        if (!defaultTemplate || defaultTemplate.definitions.length === 0) {
          throw conflict("PROJECT_PHASE_TEMPLATE_MISSING", "No active default phase template found. Create and set a default template before creating projects.");
        }
        for (let i = 0; i < defaultTemplate.definitions.length; i++) {
          const def = defaultTemplate.definitions[i];
          const id = randomUUID();
          // Map definition seat to PhaseKey for compatibility
          const key = `PHASE_${i + 1}` as PhaseKey;
          phaseIds.set(key, id);
          const isFirst = i === 0;
          await tx.sfPhase.create({
            data: {
              id,
              project_id: projectId,
              key: `PHASE_${i + 1}` as unknown as SfPhaseKey,
              definition_id: def.id,
              order_index: def.order_index,
              allow_parallel: def.allow_parallel,
              name_snapshot: def.name,
              prefix_snapshot: def.prefix,
              seat_snapshot: def.seat,
              status: isFirst ? "IN_PROGRESS" : "PENDING",
              status_changed_at: isFirst ? now : null,
            },
          });
        }
        // Create revision for first phase
        const firstPhaseId = phaseIds.values().next().value;
        await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: firstPhaseId!, major: 1, minor: 0, status: "ACTIVE" } });
        const seeded = await seedChecklistFromTemplates(tx, projectId, userId);
        // Legacy: default schedule categories and template items land on every new project.
        const scheduleRows = await seedScheduleFromTemplates(tx, projectId);
        await writeAudit(ports, tx, { action: "studioflow.project.created", entityType: "project", entityId: projectId, actor: input.actor, metadata: { projectId, name, code, clientId, checklistItems: seeded, scheduleRows } });
        return { projectId, name };
      });
    },

    async updateProject(input: CommandContext & { projectId: string } & ProjectEditInput) {
      requireCommand(input, P.projectManage);
      const area = input.area === undefined ? undefined : parseArea(input.area);
      const openingDate = input.openingDate === undefined ? undefined : parseOpeningDate(input.openingDate);
      return runTransaction(async (tx) => {
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
          const parsed = parseProjectName(project.name);
          const readable = requiredText(input.name, "PROJECT_NAME_REQUIRED", "Project name", 200);
          const next = looksFormatted(readable) ? readable : parsed ? `${parsed.code} ${readable}` : readable;
          const nextParsed = parseProjectName(next);
          if (!nextParsed) throw invalid("PROJECT_NAME_FORMAT", "Project name must use the format: [YYYY]-[Number] [Name].");
          track("name", project.name, next, () => { data.name = next; data.project_code = nextParsed.code; });
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
        if (input.projectType !== undefined) {
          const type = optionalText(input.projectType, 60) ?? "RETAIL";
          track("projectType", project.project_type, type, () => { data.project_type = type; });
        }
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
        } catch (error) { mapWriteError(error); }
        await writeAudit(ports, tx, { action: "studioflow.project.updated", entityType: "project", entityId: project.id, actor: input.actor, changes, metadata: { projectId: project.id } });
        return { projectId: project.id };
      });
    },

    async setProjectPriority(input: CommandContext & { projectId: string; priority: ProjectPriority }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const project = await loadWritableProject(tx, input.projectId);
        if (project.priority === input.priority) return { projectId: project.id };
        await tx.sfProject.update({ where: { id: project.id }, data: { priority: input.priority } });
        await writeAudit(ports, tx, { action: "studioflow.project.priority-changed", entityType: "project", entityId: project.id, actor: input.actor, changes: { priority: { from: project.priority, to: input.priority } }, metadata: { projectId: project.id } });
        return { projectId: project.id };
      });
    },

    /** ACTIVE ↔ ON_HOLD, or COMPLETED (legacy `executeCompleteProject`), or reactivate. */
    async setProjectStatus(input: CommandContext & { projectId: string; status: ProjectStatus }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
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
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId } });
        if (!project) throw notFound("project");
        if (project.archived_at) throw conflict("PROJECT_ALREADY_ARCHIVED", "This project is already archived.");
        await tx.sfProject.update({ where: { id: project.id }, data: { archived_at: nowOf(ports), archived_by_id: userId, archive_reason: reason } });
        await writeAudit(ports, tx, { action: "studioflow.project.archived", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, reason } });
        return { projectId: project.id };
      });
    },

    async restoreProject(input: CommandContext & { projectId: string; reason?: string | null }) {
      requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId } });
        if (!project) throw notFound("project");
        if (!project.archived_at) throw conflict("PROJECT_NOT_ARCHIVED", "This project is not archived.");
        await tx.sfProject.update({ where: { id: project.id }, data: { archived_at: null, archived_by_id: null, archive_reason: null } });
        await writeAudit(ports, tx, { action: "studioflow.project.restored", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, reason: optionalText(input.reason, 500), previousReason: project.archive_reason } });
        return { projectId: project.id };
      });
    },

    /** Project History tab: this app's audit events for the project. */
    async getProjectHistory(input: ReadContext & { projectId: string; limit?: number }) {
      requireRead(input.grants);
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true } });
      if (!project) throw notFound("project");
      const rows = await db.auditEvent.findMany({
        where: { app_id: "studioflow", OR: [{ entity_type: "project", entity_id: project.id }, { metadata: { path: ["projectId"], equals: project.id } }] },
        orderBy: { occurred_at: "desc" },
        take: Math.min(Math.max(input.limit ?? 200, 1), 500),
        select: { id: true, action: true, entity_type: true, actor_label: true, occurred_at: true, changes: true, metadata: true },
      });
      return rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        actorLabel: row.actor_label,
        occurredAt: row.occurred_at,
        changes: (row.changes ?? null) as Record<string, { from: unknown; to: unknown }> | null,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
      }));
    },

    canManageProjects(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.projectManage);
    },
  };
}
