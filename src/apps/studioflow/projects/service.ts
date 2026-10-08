import { createAssetRetentionService } from "./asset-retention";
import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { listAuditEvents } from "@platform/core/audit/persistence";
import type { PersonSummary } from "@platform/core/rbac/people";
import { toDecimalString } from "@platform/utilities/decimal";
import { normalizeText } from "@platform/utilities/normalization";

import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import { computeProjectPlan, type PlanIntervals } from "../domain/plan";
import { fwd } from "../domain/working-time";
import { LEGACY_PHASE_DEFINITION_IDS } from "../domain/phase";
import { iterationChoices, iterationKinds } from "../domain/iteration-kinds";
import { phaseSkipReason } from "../domain/phase-display";
import { iterationShortName, waitingDays, type PhaseStatus } from "../domain/phase";
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
  projectAccessFromFacts,
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
/** The statuses the generic status command may set; completion has its own commands. */
export const PROJECT_HOLD_STATUSES = ["ACTIVE", "ON_HOLD"] as const;
export type ProjectHoldStatus = (typeof PROJECT_HOLD_STATUSES)[number];
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
    return { archiveRetentionDays: row?.archive_retention_days ?? 90, cdMall: row?.cd_mall_days ?? 5, cdFinal: row?.cd_final_days ?? 5, gap: row?.fit_out_gap_days ?? 5, fitOutToHandover: row?.fit_out_to_handover_days ?? 40, handoverToOpening: row?.handover_to_opening_days ?? 10 };
  }

  const PLAN_PHASE_DEFINITIONS: ReadonlySet<string> = new Set([LEGACY_PHASE_DEFINITION_IDS.design3d, LEGACY_PHASE_DEFINITION_IDS.cd, LEGACY_PHASE_DEFINITION_IDS.supervision]);

  type PlanProject = { id: string; fit_out_start_date: Date | null; plan_overrides: unknown; opening_date: Date | null; timeline_start_date: Date | null };

  /** Studio defaults, then the project's own overrides. Only the five interval keys are ever read. */
  async function resolveIntervals(client: Db | TxClient, project: PlanProject): Promise<PlanIntervals> {
    const settings = await readSettings(client);
    const overrides = (project.plan_overrides ?? {}) as Partial<PlanIntervals>;
    const pick = (key: keyof PlanIntervals) => overrides[key] ?? settings[key];
    return { cdMall: pick("cdMall"), cdFinal: pick("cdFinal"), gap: pick("gap"), fitOutToHandover: pick("fitOutToHandover"), handoverToOpening: pick("handoverToOpening") };
  }

  async function resolvePlan(client: Db | TxClient, project: PlanProject) {
    const intervals = await resolveIntervals(client, project);
    const holidays = new Set((await client.sfHoliday.findMany({ select: { date: true } })).map((holiday) => dateToDateOnly(holiday.date)!));
    const cd = await client.sfPhase.findFirst({ where: { project_id: project.id, definition_id: LEGACY_PHASE_DEFINITION_IDS.cd }, select: { status: true, status_changed_at: true } });
    const endActual = cd?.status === "DONE" ? dateToDateOnly(cd.status_changed_at) : null;
    const fitOutStartDate = dateToDateOnly(project.fit_out_start_date);
    const plan = fitOutStartDate
      ? computeProjectPlan({ fitOutStart: fitOutStartDate, intervals, holidays, openingDate: dateToDateOnly(project.opening_date), timelineStart: dateToDateOnly(project.timeline_start_date), cdDoneDate: endActual, today: dateToDateOnly(nowOf(ports))! })
      : null;
    return {
      fitOutStartDate,
      intervals,
      overrides: (project.plan_overrides ?? null) as Partial<PlanIntervals> | null,
      milestones: plan?.milestones ?? null,
      endPlanned: plan?.milestones.end ?? null,
      endActual,
      // A suggestion only: the person saves it (or not); the plan never writes a Fit Out Start itself.
      suggestedFitOutStart: fitOutStartDate || !endActual ? null : fwd(endActual, intervals.gap, holidays),
      warnings: plan?.warnings ?? [],
    };
  }

  /** Writes the computed dates of every phase whose dates are not manual (or only `onlyPhaseId`, whose manual flag is cleared first). */
  async function applyPlanIn(tx: TxClient, project: PlanProject, actor: CommandContext["actor"], onlyPhaseId: string | null) {
    if (!project.fit_out_start_date) throw invalid("FIT_OUT_START_REQUIRED", "Set Fit Out Start before applying the plan.");
    if (onlyPhaseId) await tx.sfPhase.update({ where: { id: onlyPhaseId }, data: { planned_dates_manual: false } });
    const resolved = await resolvePlan(tx, project);
    const m = resolved.milestones!;
    const targets: Record<string, { start?: string; end?: string }> = {
      [LEGACY_PHASE_DEFINITION_IDS.design3d]: { end: m.designFinal },
      [LEGACY_PHASE_DEFINITION_IDS.cd]: { start: m.cdMallStart, end: m.end },
      [LEGACY_PHASE_DEFINITION_IDS.supervision]: { start: m.fitOutStart, end: m.handover },
    };
    const phases = await tx.sfPhase.findMany({ where: { project_id: project.id }, select: { id: true, definition_id: true, planned_dates_manual: true, planned_start_date: true, planned_end_date: true } });
    const written: string[] = [], unchanged: string[] = [], kept: string[] = [];
    for (const phase of phases) {
      const target = phase.definition_id ? targets[phase.definition_id] : undefined;
      if (!target || (onlyPhaseId && phase.id !== onlyPhaseId)) continue;
      if (phase.planned_dates_manual) { kept.push(phase.id); continue; }
      const data: { planned_start_date?: Date; planned_end_date?: Date } = {};
      if (target.start && dateToDateOnly(phase.planned_start_date) !== target.start) data.planned_start_date = dateOnlyToDate(target.start);
      if (target.end && dateToDateOnly(phase.planned_end_date) !== target.end) data.planned_end_date = dateOnlyToDate(target.end);
      if (Object.keys(data).length === 0) { unchanged.push(phase.id); continue; }
      await tx.sfPhase.update({ where: { id: phase.id }, data });
      written.push(phase.id);
    }
    if (written.length > 0) await writeAudit(ports, tx, { action: "studioflow.project.plan-applied", entityType: "project", entityId: project.id, actor, metadata: { projectId: project.id, written, kept, scope: onlyPhaseId ? "phase" : "project" } });
    return { written, unchanged, kept, warnings: resolved.warnings, milestones: m };
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

    async setPlanningDefaults(input: CommandContext & PlanIntervals) {
      const userId = requireCommand(input, P.settingsManage);
      if (Object.values({ cdMall: input.cdMall, cdFinal: input.cdFinal, gap: input.gap, fitOutToHandover: input.fitOutToHandover, handoverToOpening: input.handoverToOpening }).some((n) => !Number.isInteger(n) || n < 1 || n > 260)) throw invalid("PLANNING_DEFAULTS_INVALID", "Planning defaults must be whole working days from 1 to 260.");
      return runTransaction(async (tx) => { await tx.sfSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, updated_by_id: userId, cd_mall_days: input.cdMall, cd_final_days: input.cdFinal, fit_out_gap_days: input.gap, fit_out_to_handover_days: input.fitOutToHandover, handover_to_opening_days: input.handoverToOpening }, update: { updated_by_id: userId, cd_mall_days: input.cdMall, cd_final_days: input.cdFinal, fit_out_gap_days: input.gap, fit_out_to_handover_days: input.fitOutToHandover, handover_to_opening_days: input.handoverToOpening } }); await writeAudit(ports, tx, { action: "studioflow.settings.planning-updated", entityType: "settings", entityId: SETTINGS_ID, actor: input.actor }); return readSettings(tx); });
    },
    async listHolidays(input: ReadContext) { requireRead(input.grants); return (await db.sfHoliday.findMany({ orderBy: { date: "asc" } })).map((h) => ({ id: h.id, date: dateToDateOnly(h.date)!, label: h.label })); },
    async addHoliday(input: CommandContext & { date: string; label: string }) { const userId = requireCommand(input, P.settingsManage); const date = parseOpeningDate(input.date); const label = requiredText(input.label, "HOLIDAY_LABEL_REQUIRED", "Holiday label", 200); return runTransaction(async (tx) => { if (await tx.sfHoliday.findUnique({ where: { date: date! }, select: { id: true } })) throw conflict("HOLIDAY_EXISTS", "That date is already in the holiday list."); const holiday = await tx.sfHoliday.create({ data: { date: date!, label, created_by_id: userId, updated_by_id: userId } }); await writeAudit(ports, tx, { action: "studioflow.holiday.added", entityType: "holiday", entityId: holiday.id, actor: input.actor }); return { holidayId: holiday.id }; }); },
    async removeHoliday(input: CommandContext & { holidayId: string }) { requireCommand(input, P.settingsManage); return runTransaction(async (tx) => { const holiday = await tx.sfHoliday.findUnique({ where: { id: input.holidayId } }); if (!holiday) throw notFound("holiday"); await tx.sfHoliday.delete({ where: { id: holiday.id } }); await writeAudit(ports, tx, { action: "studioflow.holiday.removed", entityType: "holiday", entityId: holiday.id, actor: input.actor }); return { holidayId: holiday.id }; }); },

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
        include: { projects: { orderBy: { name: "asc" }, select: { id: true, name: true, status: true, priority: true, archived_at: true } } },
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
          orderBy: [{ priority: "asc" }, { name: "asc" }],
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
        orderBy: [{ priority: "asc" }, { name: "asc" }],
        include: {
          client: { select: { id: true, name: true } },
          phases: { orderBy: { order_index: "asc" }, select: { id: true, definition_id: true, status: true, is_locked: true, status_changed_at: true, name_snapshot: true, planned_start_date: true, planned_end_date: true } },
          _count: { select: { checklist_items: { where: { is_checked: false, parent_id: null } } } },
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
        fitOutStartDate: dateToDateOnly(row.fit_out_start_date),
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
        openItems: row._count.checklist_items,
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
        fitOutStartDate: dateToDateOnly(row.fit_out_start_date),
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
        await tx.sfRevision.create({ data: { id: randomUUID(), phase_id: phaseIds[0]!, major: 1, name: iterationKinds(defaultTemplate.definitions[0]!.default_iteration_kinds)[0] ?? `${defaultTemplate.definitions[0]!.name} 1`, status: "NOT_SENT" } });
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

    async setFitOutStart(input: CommandContext & { projectId: string; fitOutStartDate: string | null }) {
      const userId = requireCommand(input, P.projectManage); const value = parseOpeningDate(input.fitOutStartDate);
      return runTransaction(async (tx) => { await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" }); const project = await loadWritableProject(tx, input.projectId); await tx.sfProject.update({ where: { id: project.id }, data: { fit_out_start_date: value } }); await writeAudit(ports, tx, { action: "studioflow.project.fit-out-start-set", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, fitOutStartDate: input.fitOutStartDate } }); return { projectId: project.id }; });
    },
    async setPlanOverrides(input: CommandContext & { projectId: string; overrides: Partial<PlanIntervals> | null }) {
      const userId = requireCommand(input, P.projectManage); const overrides = input.overrides;
      if (overrides && Object.values(overrides).some((n) => n !== undefined && (!Number.isInteger(n) || n < 1 || n > 260))) throw invalid("PLAN_OVERRIDES_INVALID", "Plan overrides must be whole working days from 1 to 260.");
      return runTransaction(async (tx) => { await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" }); const project = await loadWritableProject(tx, input.projectId); await tx.sfProject.update({ where: { id: project.id }, data: { plan_overrides: overrides ?? Prisma.DbNull } }); await writeAudit(ports, tx, { action: "studioflow.project.plan-overrides-set", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id } }); return { projectId: project.id }; });
    },
    /** Read-only plan: resolved intervals, computed milestones, END (actual/planned), a suggested Fit Out Start, and warnings. Writes nothing. */
    async getProjectPlan(input: ReadContext & { projectId: string }) {
      requireRead(input.grants);
      const project = await db.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true, fit_out_start_date: true, plan_overrides: true, opening_date: true, timeline_start_date: true } });
      if (!project) throw notFound("project");
      return resolvePlan(db, project);
    },
    async applyProjectPlan(input: CommandContext & { projectId: string }) {
      const userId = requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await loadWritableProject(tx, input.projectId);
        return applyPlanIn(tx, project, input.actor, null);
      });
    },
    /** Clears the manual flag of one computed phase and recomputes, atomically. Only the three phases the plan computes qualify. */
    async resetPhasePlannedDates(input: CommandContext & { projectId: string; phaseId: string }) {
      const userId = requireCommand(input, P.projectManage);
      return runTransaction(async (tx) => {
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project" });
        const project = await loadWritableProject(tx, input.projectId);
        const phase = await tx.sfPhase.findUnique({ where: { id: input.phaseId }, select: { id: true, project_id: true, definition_id: true } });
        if (!phase || phase.project_id !== project.id) throw notFound("phase");
        if (!phase.definition_id || !PLAN_PHASE_DEFINITIONS.has(phase.definition_id)) throw invalid("PHASE_NOT_PLANNED", "Only Design 3D, Construction Drawing and Construction get computed dates.");
        return applyPlanIn(tx, project, input.actor, phase.id);
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

    /**
     * ACTIVE ↔ ON_HOLD only. Completion is `phases.markProjectCompleted` and reopening is `phases.reopenProject`
     * (PIC-only, readiness-gated, own audit actions); this generic command never produces or leaves COMPLETED.
     */
    async setProjectStatus(input: CommandContext & { projectId: string; status: ProjectHoldStatus }) {
      const userId = requireCommand(input, P.projectManage);
      if (!(PROJECT_HOLD_STATUSES as readonly string[]).includes(input.status)) {
        throw invalid("PROJECT_STATUS_USE_COMPLETION_FLOW", "Use Complete project or Reopen project to change completion.");
      }
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
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project", allowCompleted: true });
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
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "project", allowCompleted: true });
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

    async listAccess(input: ReadContext & { actor: CommandContext["actor"]; projectIds: string[] }) {
      requireRead(input.grants);
      if (input.actor.kind !== "USER" || !input.actor.userId) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
      if (input.projectIds.length === 0) return new Map<string, ReturnType<typeof projectAccessFromFacts>>();
      const projects = await db.sfProject.findMany({
        where: { id: { in: input.projectIds } },
        select: { id: true, status: true, pic_designer_id: true, pic_drafter_id: true, phases: { select: { id: true, seat_snapshot: true } } },
      });
      return new Map(projects.map((project) => [project.id, projectAccessFromFacts(project, { grants: input.grants, actorId: input.actor.userId! })]));
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
            revisions: { orderBy: { major: "desc" }, select: { id: true, major: true, name: true, status: true, sent_at: true, visit_date: true, created_at: true, note: true, images: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }], select: { id: true, storage_key: true, content_type: true, bytes: true } } } },
            events: { where: { to_state: "DONE", undone_at: null }, orderBy: { occurred_at: "desc" }, take: 1, select: { auto_created: true } },
          } },
        },
      });
      const now = nowOf(ports);
      // Only the current iteration of each phase is signed: the card shows nothing older.
      const signed = new Map<string, Array<{ id: string; url: string | null; contentType: string; bytes: number }>>();
      const signing: Array<Promise<void>> = [];
      for (const project of rows) {
        for (const phase of project.phases) {
          const current = phase.revisions.find((iteration) => ["NOT_SENT", "SENT", "ANSWERED"].includes(iteration.status));
          if (!current) continue;
          signing.push(Promise.all(current.images.map(async (image) => {
            let url: string | null = null;
            try { url = await ports.storage.createSignedReadUrl(image.storage_key, 15 * 60); } catch { /* one thumbnail stays blank; the card still renders */ }
            return { id: image.id, url, contentType: image.content_type, bytes: image.bytes };
          })).then((images) => { signed.set(current.id, images); }));
        }
      }
      await Promise.all(signing);
      return rows.map((project) => {
        const phases = project.phases.map((phase, index) => {
          const previous = index > 0 ? project.phases[index - 1]! : null;
          const current = phase.revisions.find((iteration) => ["NOT_SENT", "SENT", "ANSWERED"].includes(iteration.status)) ?? null;
          const isSupervision = phase.definition_id === "00000000-0000-4000-8000-000000000105";
          const visits = phase.revisions.filter((iteration) => iteration.visit_date);
          const lastVisit = visits.sort((a, b) => (b.visit_date?.getTime() ?? 0) - (a.visit_date?.getTime() ?? 0))[0]?.visit_date ?? null;
          const kinds = iterationKinds(phase.definition.default_iteration_kinds);
          const choices = !current ? (phase.status === "DONE" || (phase.status === "ACTIVE" && !isSupervision) ? ["add_iteration"] : []) : iterationChoices({ state: current.status, phaseStatus: phase.status, iterationName: current.name, kinds, supervision: isSupervision });
          return {
            id: phase.id, name: phase.name_snapshot, order: phase.order_index, status: phase.status as PhaseStatus,
            current_iteration: current ? { id: current.id, name: current.name, short_name: iterationShortName(current.name, phase.prefix_snapshot, current, kinds.includes(current.name)), state: current.status, sent_at: current.sent_at, waiting_days: current.status === "SENT" ? waitingDays(current.sent_at, now) : null, available_choices: choices, answer_choices: iterationChoices({ state: "ANSWERED", phaseStatus: phase.status, iterationName: current.name, kinds, supervision: isSupervision }), note: current.note, images: signed.get(current.id) ?? [] } : null,
            iteration_count: phase.revisions.length, has_note: Boolean(phase.note?.trim()),
            skipped_reason: phaseSkipReason(phase.events[0]),
            can_add_round: choices.includes("add_iteration"),
            is_supervision: isSupervision,
            seat: phase.seat_snapshot as "designer" | "drafter",
            /** A not-started phase may be started now: the project is active and the phase is parallel or its predecessor is done. */
            can_start: phase.status === "PENDING" && project.status === "ACTIVE" && (phase.allow_parallel || !previous || previous.status === "DONE"),
            last_visit_days_ago: isSupervision ? waitingDays(lastVisit, now) : null,
          };
        });
        const allPhasesDone = project.phases.every((phase) => phase.status === "DONE");
        const earliestActive = project.phases.find((phase) => phase.status === "ACTIVE")?.order_index;
        // A later sequential phase that is already done may no longer match a reopened earlier one. Parallel phases are expected to finish out of order.
        return {
          id: project.id, name: project.name, client: project.client, status: project.status as ProjectStatus,
          pic_ids: { designer: project.pic_designer_id, drafter: project.pic_drafter_id },
          all_phases_done: allPhasesDone,
          dependents_review_suggested: earliestActive !== undefined && project.phases.some((phase) => phase.order_index > earliestActive && phase.status === "DONE" && !phase.allow_parallel),
          can_mark_completed: project.status !== "COMPLETED" && Boolean(input.actorId && (project.pic_designer_id === input.actorId || project.pic_drafter_id === input.actorId || hasPermission(input.grants, P.projectOverride))),
          note_phases: project.phases.filter((phase) => Boolean(phase.note?.trim())).map((phase) => phase.id),
          last_update_at: [project.updated_at, ...project.phases.map((phase) => phase.updated_at)].reduce((latest, value) => latest > value ? latest : value),
          phases,
        };
      });
    },

    /** Small, read-only Home projection shared by the page and the app rail. */
    async getHomeStats(input: ReadContext & { filter: "all" | "mine"; actorId: string }) {
      requireRead(input.grants);
      const canOverride = hasPermission(input.grants, P.projectOverride);
      const canWork = hasPermission(input.grants, P.phaseWork);
      const projects = await db.sfProject.findMany({
        where: {
          archived_at: null,
          status: { not: "COMPLETED" },
          ...(input.filter === "mine" ? { OR: [{ pic_designer_id: input.actorId }, { pic_drafter_id: input.actorId }] } : {}),
        },
        select: {
          id: true,
          status: true,
          pic_designer_id: true,
          pic_drafter_id: true,
          phases: { select: { status: true, seat_snapshot: true, revisions: { where: { status: { in: ["SENT", "ANSWERED"] } }, orderBy: { major: "desc" }, take: 1, select: { status: true, sent_at: true } } } },
        },
      });
      const phaseRows = projects.flatMap((project) => project.phases.map((phase) => ({ project, phase })));
      const withClient = phaseRows.filter(({ phase }) => phase.revisions[0]?.status === "SENT");
      const now = nowOf(ports);
      const projectIds = projects.map((project) => project.id);
      const samplesWaiting = projectIds.length === 0 ? 0 : await db.sfScheduleSampleRequest.count({ where: { status: "REQUESTED", option: { entry: { project_id: { in: projectIds } } } } });
      return {
        runningProjects: projects.length,
        waitingOnYou: canWork ? phaseRows.filter(({ project, phase }) => phase.revisions[0]?.status === "ANSWERED" && project.status === "ACTIVE" && (canOverride || input.actorId === (phase.seat_snapshot === "drafter" ? project.pic_drafter_id : project.pic_designer_id))).length : 0,
        withClient: withClient.length,
        longestClientDays: Math.max(0, ...withClient.map(({ phase }) => waitingDays(phase.revisions[0]?.sent_at ?? now, now) ?? 0)),
        phasesDone: phaseRows.filter(({ phase }) => phase.status === "DONE").length,
        phasesTotal: phaseRows.length,
        samplesWaiting,
      };
    },

    /** Narrow rail-badge read: exactly the Mine Home answered-work rule, without loading project trees. */
    async countWaitingOnYou(input: ReadContext & { actorId: string }): Promise<number> {
      requireRead(input.grants);
      if (!hasPermission(input.grants, P.phaseWork)) return 0;
      const canOverride = hasPermission(input.grants, P.projectOverride);
      return db.sfRevision.count({ where: {
        status: "ANSWERED",
        phase: { project: {
          archived_at: null,
          status: "ACTIVE",
          OR: [{ pic_designer_id: input.actorId }, { pic_drafter_id: input.actorId }],
        }, ...(canOverride ? {} : { OR: [{ seat_snapshot: "designer", project: { pic_designer_id: input.actorId } }, { seat_snapshot: "drafter", project: { pic_drafter_id: input.actorId } }] }) },
      } });
    },

    canManageProjects(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.projectManage);
    },
  };
}
