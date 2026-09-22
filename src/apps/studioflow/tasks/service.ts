import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { normalizeText } from "@platform/utilities/normalization";
import { z } from "zod";

import {
  CHECKLIST_LABEL_MAX_LENGTH,
  CHECKLIST_PRIORITY_NONE,
  CHECKLIST_SORT_STEP,
  buildTree,
  cascadeTargets,
  steppedSortOrders,
  type ChecklistFilterQuery,
} from "../domain/checklist";
import { dateOnlyToDate, dateToDateOnly } from "../domain/dates";
import { isPhaseModifiable, type PhaseStatus } from "../domain/phase";
import {
  P,
  conflict,
  hasPermission,
  invalid,
  notFound,
  nowOf,
  requireCommand,
  requirePermission,
  requireRead,
  requiredText,
  writeAudit,
  type CommandContext,
  type Db,
  type ReadContext,
  type StudioFlowPorts,
  type TxClient,
} from "../shared";
import { seedChecklistFromTemplates } from "./sync";

export const LABEL_COLORS = ["neutral", "success", "warning", "danger"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

const FilterQuerySchema = z.strictObject({
  status: z.enum(["OPEN", "COMPLETED"]),
  priority: z.enum(["P1"]).nullable(),
  assignee: z.enum(["ME"]).nullable(),
  due: z.enum(["TODAY_OR_EARLIER", "OVERDUE"]).nullable(),
});

const ITEM_SELECT = {
  id: true,
  project_id: true,
  phase_id: true,
  parent_id: true,
  label: true,
  is_checked: true,
  checked_at: true,
  is_blocking: true,
  sort_order: true,
  priority: true,
  due_at: true,
  assigned_to_id: true,
  template_id: true,
  created_at: true,
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
} satisfies Prisma.SfChecklistItemSelect;

type ItemRow = Prisma.SfChecklistItemGetPayload<{ select: typeof ITEM_SELECT }>;

export const ITEM_ORDER: Prisma.SfChecklistItemOrderByWithRelationInput[] = [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }];

export type ChecklistItemView = {
  id: string;
  projectId: string;
  phaseId: string | null;
  parentId: string | null;
  label: string;
  isChecked: boolean;
  checkedAt: Date | null;
  /** False = warning-only; it never gates approval. */
  isBlocking: boolean;
  sortOrder: number;
  priority: number;
  dueDate: string | null;
  assigneeId: string | null;
  templateId: string | null;
  labels: Array<{ id: string; name: string; color: string }>;
};

export function toItemView(row: ItemRow): ChecklistItemView {
  return {
    id: row.id,
    projectId: row.project_id,
    phaseId: row.phase_id,
    parentId: row.parent_id,
    label: row.label,
    isChecked: row.is_checked,
    checkedAt: row.checked_at,
    isBlocking: row.is_blocking,
    sortOrder: row.sort_order,
    priority: row.priority,
    dueDate: dateToDateOnly(row.due_at),
    assigneeId: row.assigned_to_id,
    templateId: row.template_id,
    labels: row.labels.map((entry) => entry.label),
  };
}

export { ITEM_SELECT };

function parsePriority(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 4) throw invalid("PRIORITY_INVALID", "Priority must be P1 to P4.");
  return value;
}

function parseDue(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  try { return dateOnlyToDate(value); } catch { throw invalid("DUE_DATE_INVALID", "Due date must be a valid date."); }
}

export function createTaskService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  async function loadItem(tx: TxClient, projectId: string, itemId: string) {
    const item = await tx.sfChecklistItem.findUnique({ where: { id: itemId }, include: { project: true, phase: true } });
    if (!item || item.project_id !== projectId) throw notFound("checklist item");
    if (item.project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
    if (item.phase && !isPhaseModifiable({ status: item.phase.status as PhaseStatus, isLocked: item.phase.is_locked })) {
      throw conflict("PHASE_LOCKED", "This phase is approved and locked. Reopen it first.");
    }
    return item;
  }

  async function assertAssignee(assigneeId: string | null | undefined) {
    if (!assigneeId) return;
    const holders = await ports.people.listHolders(P.phaseWork);
    if (!holders.some((person) => person.id === assigneeId)) throw invalid("ASSIGNEE_NOT_ELIGIBLE", "The selected person cannot be assigned work.");
  }

  function meta(item: { project_id: string; phase_id: string | null }, extra: Record<string, unknown> = {}) {
    return { projectId: item.project_id, phaseId: item.phase_id, ...extra };
  }

  return {
    // ── Reads ──────────────────────────────────────────────────────────────
    /** phaseId undefined = all; null = general (project-level) items only. */
    async listChecklist(input: ReadContext & { projectId: string; phaseId?: string | null }) {
      requireRead(input.grants);
      const rows = await db.sfChecklistItem.findMany({
        where: { project_id: input.projectId, ...(input.phaseId === undefined ? {} : { phase_id: input.phaseId }) },
        select: ITEM_SELECT,
        orderBy: ITEM_ORDER,
      });
      const views = rows.map(toItemView);
      return buildTree(views);
    },

    async listLabels(input: ReadContext) {
      requireRead(input.grants);
      return db.sfChecklistLabel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });
    },

    canManageTasks(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.taskManage);
    },

    // ── Items ──────────────────────────────────────────────────────────────
    /**
     * V2-D1: Create a freestanding root checklist item (Todo).
     * phaseId = null → general project todo; phaseId set → phase-scoped todo.
     */
    async createItem(input: CommandContext & { projectId: string; phaseId: string | null; label: string; priority?: number; dueDate?: string | null; assignedToId?: string | null; isBlocking?: boolean }) {
      const userId = requireCommand(input, P.taskManage);
      const label = requiredText(input.label, "CHECKLIST_LABEL_REQUIRED", "Task", CHECKLIST_LABEL_MAX_LENGTH);
      const priority = parsePriority(input.priority) ?? CHECKLIST_PRIORITY_NONE;
      const due = parseDue(input.dueDate) ?? null;
      await assertAssignee(input.assignedToId);
      return runTransaction(async (tx) => {
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId }, select: { id: true, archived_at: true } });
        if (!project) throw notFound("project");
        if (project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
        if (input.phaseId) {
          const phase = await tx.sfPhase.findUnique({ where: { id: input.phaseId }, select: { project_id: true, status: true, is_locked: true } });
          if (!phase || phase.project_id !== input.projectId) throw notFound("phase");
          if (!isPhaseModifiable({ status: phase.status as PhaseStatus, isLocked: phase.is_locked })) {
            throw conflict("PHASE_LOCKED", "This phase is approved and locked. Reopen it first.");
          }
        }
        const last = await tx.sfChecklistItem.findFirst({
          where: { project_id: input.projectId, phase_id: input.phaseId, parent_id: null },
          orderBy: { sort_order: "desc" },
          select: { sort_order: true },
        });
        const id = randomUUID();
        await tx.sfChecklistItem.create({
          data: {
            id,
            project_id: input.projectId,
            phase_id: input.phaseId,
            parent_id: null,
            label,
            priority,
            due_at: due,
            assigned_to_id: input.assignedToId ?? null,
            is_blocking: input.isBlocking ?? true,
            sort_order: (last?.sort_order ?? 0) + CHECKLIST_SORT_STEP,
            created_by_id: userId,
          },
        });
        await writeAudit(ports, tx, { action: "studioflow.checklist.item-created", entityType: "checklist-item", entityId: id, actor: input.actor, metadata: { projectId: input.projectId, phaseId: input.phaseId, label } });
        return { itemId: id };
      });
    },

    /**
     * Root items come from templates only (legacy rule). People add subtasks
     * that break a requirement down; subtasks inherit project and phase and
     * never block approval.
     */
    async createSubtask(input: CommandContext & { projectId: string; parentId: string; label: string; priority?: number; dueDate?: string | null; assignedToId?: string | null }) {
      const userId = requireCommand(input, P.taskManage);
      const label = requiredText(input.label, "CHECKLIST_LABEL_REQUIRED", "Task", CHECKLIST_LABEL_MAX_LENGTH);
      const priority = parsePriority(input.priority) ?? CHECKLIST_PRIORITY_NONE;
      const due = parseDue(input.dueDate) ?? null;
      await assertAssignee(input.assignedToId);
      return runTransaction(async (tx) => {
        const parent = await loadItem(tx, input.projectId, input.parentId);
        if (parent.parent_id !== null) throw invalid("CHECKLIST_DEPTH", "Subtasks cannot have subtasks of their own.");
        const last = await tx.sfChecklistItem.findFirst({ where: { parent_id: parent.id }, orderBy: { sort_order: "desc" }, select: { sort_order: true } });
        const id = randomUUID();
        await tx.sfChecklistItem.create({
          data: {
            id,
            project_id: parent.project_id,
            phase_id: parent.phase_id,
            parent_id: parent.id,
            label,
            priority,
            due_at: due,
            assigned_to_id: input.assignedToId ?? null,
            // A subtask never gates approval, so it is stored as non-blocking rather
            // than relying on readers to remember the depth rule.
            is_blocking: false,
            sort_order: (last?.sort_order ?? 0) + CHECKLIST_SORT_STEP,
            created_by_id: userId,
          },
        });
        await writeAudit(ports, tx, { action: "studioflow.checklist.subtask-created", entityType: "checklist-item", entityId: id, actor: input.actor, metadata: meta(parent, { parentId: parent.id, label }) });
        return { itemId: id };
      });
    },

    async updateItem(input: CommandContext & { projectId: string; itemId: string; label?: string; priority?: number; dueDate?: string | null; assignedToId?: string | null; isBlocking?: boolean }) {
      requireCommand(input, P.taskManage);
      const priority = parsePriority(input.priority);
      const due = parseDue(input.dueDate);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        // Only a changed assignee is validated, so items kept on a former member stay editable.
        if (input.assignedToId !== undefined && (input.assignedToId ?? null) !== item.assigned_to_id) await assertAssignee(input.assignedToId);
        const data: Prisma.SfChecklistItemUncheckedUpdateInput = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (input.label !== undefined) {
          const label = requiredText(input.label, "CHECKLIST_LABEL_REQUIRED", "Task", CHECKLIST_LABEL_MAX_LENGTH);
          if (label !== item.label) { data.label = label; changes.label = { from: item.label, to: label }; }
        }
        if (priority !== undefined && priority !== item.priority) { data.priority = priority; changes.priority = { from: item.priority, to: priority }; }
        if (due !== undefined && dateToDateOnly(due) !== dateToDateOnly(item.due_at)) { data.due_at = due; changes.dueDate = { from: dateToDateOnly(item.due_at), to: dateToDateOnly(due) }; }
        if (input.assignedToId !== undefined && (input.assignedToId ?? null) !== item.assigned_to_id) { data.assigned_to_id = input.assignedToId ?? null; changes.assignedToId = { from: item.assigned_to_id, to: input.assignedToId ?? null }; }
        // Only a root item can gate approval, so flipping the flag on a subtask would be a silent no-op.
        if (input.isBlocking !== undefined && input.isBlocking !== item.is_blocking) {
          if (item.parent_id !== null) throw invalid("CHECKLIST_SUBTASK_NEVER_BLOCKS", "Subtasks never block approval, so they cannot be made blocking.");
          data.is_blocking = input.isBlocking;
          changes.isBlocking = { from: item.is_blocking, to: input.isBlocking };
        }
        if (Object.keys(changes).length === 0) return { itemId: item.id };
        await tx.sfChecklistItem.update({ where: { id: item.id }, data });
        await writeAudit(ports, tx, { action: "studioflow.checklist.updated", entityType: "checklist-item", entityId: item.id, actor: input.actor, changes, metadata: meta(item) });
        return { itemId: item.id };
      });
    },

    /** Legacy cascade: a parent pushes its state to all children; children never roll up. */
    async setItemChecked(input: CommandContext & { projectId: string; itemId: string; checked: boolean }) {
      requirePermission(input.grants, P.access);
      if (input.actor.kind !== "USER" || !input.actor.userId) {
        throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "An authenticated staff member is required.");
      }
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        // A non-blocking root item is the merged "requirement" (warning-only, from the
        // deleted RequirementsPanel): toggling it only needs phase-work access, matching
        // that panel's own permission. Everything else still needs task-manage access.
        const isMergedRequirement = item.parent_id === null && !item.is_blocking;
        if (!hasPermission(input.grants, P.taskManage) && !(isMergedRequirement && hasPermission(input.grants, P.phaseWork))) {
          requirePermission(input.grants, P.taskManage);
        }
        const children = item.parent_id === null ? await tx.sfChecklistItem.findMany({ where: { parent_id: item.id }, select: { id: true } }) : [];
        const ids = cascadeTargets({ id: item.id, parentId: item.parent_id }, children.map((child) => child.id));
        await tx.sfChecklistItem.updateMany({ where: { id: { in: ids } }, data: { is_checked: input.checked, checked_at: input.checked ? nowOf(ports) : null } });
        if (item.is_checked !== input.checked) {
          await writeAudit(ports, tx, { action: input.checked ? "studioflow.checklist.checked" : "studioflow.checklist.unchecked", entityType: "checklist-item", entityId: item.id, actor: input.actor, metadata: meta(item, { cascaded: ids.length - 1 }) });
        }
        return { itemId: item.id, affected: ids.length };
      });
    },

    /** Template rows are refused: they would come back on the next sync. Detach first. */
    async deleteItem(input: CommandContext & { projectId: string; itemId: string }) {
      requireCommand(input, P.taskManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        if (item.template_id !== null) throw conflict("CHECKLIST_TEMPLATE_ROW", "This item comes from a checklist template. Detach it from the template first.");
        const subtasks = await tx.sfChecklistItem.count({ where: { parent_id: item.id } });
        await tx.sfChecklistItem.delete({ where: { id: item.id } });
        await writeAudit(ports, tx, { action: "studioflow.checklist.deleted", entityType: "checklist-item", entityId: item.id, actor: input.actor, metadata: meta(item, { label: item.label, subtasksDeleted: subtasks }) });
        return { itemId: item.id, subtasksDeleted: subtasks };
      });
    },

    async detachFromTemplate(input: CommandContext & { projectId: string; itemId: string }) {
      requireCommand(input, P.taskManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        if (item.template_id === null) throw conflict("CHECKLIST_NOT_TEMPLATE", "This item is not linked to a template.");
        await tx.sfChecklistItem.update({ where: { id: item.id }, data: { template_id: null } });
        await writeAudit(ports, tx, { action: "studioflow.checklist.detached", entityType: "checklist-item", entityId: item.id, actor: input.actor, metadata: meta(item, { templateId: item.template_id }) });
        return { itemId: item.id };
      });
    },

    /** Renumbers one sibling group; every id must share project, phase, and parent. */
    async reorderItems(input: CommandContext & { projectId: string; orderedIds: string[] }) {
      requireCommand(input, P.taskManage);
      if (input.orderedIds.length === 0) return { count: 0 };
      if (new Set(input.orderedIds).size !== input.orderedIds.length) throw invalid("REORDER_DUPLICATE", "Each task can appear only once.");
      return runTransaction(async (tx) => {
        const first = await loadItem(tx, input.projectId, input.orderedIds[0]);
        const siblings = await tx.sfChecklistItem.findMany({ where: { project_id: first.project_id, phase_id: first.phase_id, parent_id: first.parent_id }, select: { id: true } });
        const siblingIds = new Set(siblings.map((row) => row.id));
        if (siblings.length !== input.orderedIds.length || input.orderedIds.some((id) => !siblingIds.has(id))) {
          throw invalid("REORDER_SCOPE", "Reorder must include exactly the tasks of one list.");
        }
        for (const { id, sortOrder } of steppedSortOrders(input.orderedIds)) {
          await tx.sfChecklistItem.update({ where: { id }, data: { sort_order: sortOrder } });
        }
        await writeAudit(ports, tx, { action: "studioflow.checklist.reordered", entityType: "checklist-item", entityId: first.id, actor: input.actor, metadata: meta(first, { parentId: first.parent_id, count: input.orderedIds.length }) });
        return { count: input.orderedIds.length };
      });
    },

    // ── Labels ─────────────────────────────────────────────────────────────
    async attachLabel(input: CommandContext & { projectId: string; itemId: string; name: string; color?: LabelColor }) {
      requireCommand(input, P.taskManage);
      const name = requiredText(input.name, "LABEL_NAME_REQUIRED", "Label", 40).toLowerCase();
      const color = input.color && (LABEL_COLORS as readonly string[]).includes(input.color) ? input.color : "neutral";
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        const label = await tx.sfChecklistLabel.upsert({ where: { name }, create: { id: randomUUID(), name, color }, update: {} });
        await tx.sfChecklistItemLabel.upsert({ where: { item_id_label_id: { item_id: item.id, label_id: label.id } }, create: { item_id: item.id, label_id: label.id }, update: {} });
        await writeAudit(ports, tx, { action: "studioflow.checklist.label-attached", entityType: "checklist-item", entityId: item.id, actor: input.actor, metadata: meta(item, { label: name }) });
        return { labelId: label.id };
      });
    },

    async detachLabel(input: CommandContext & { projectId: string; itemId: string; labelId: string }) {
      requireCommand(input, P.taskManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId);
        const removed = await tx.sfChecklistItemLabel.deleteMany({ where: { item_id: item.id, label_id: input.labelId } });
        if (removed.count > 0) await writeAudit(ports, tx, { action: "studioflow.checklist.label-detached", entityType: "checklist-item", entityId: item.id, actor: input.actor, metadata: meta(item, { labelId: input.labelId }) });
        return { removed: removed.count };
      });
    },

    // ── Saved filters (per user) ──────────────────────────────────────────
    async listFilterViews(input: CommandContext) {
      const userId = requireCommand(input, P.projectRead);
      const rows = await db.sfChecklistFilterView.findMany({ where: { owner_id: userId }, orderBy: { created_at: "asc" } });
      return rows.flatMap((row) => {
        const parsed = FilterQuerySchema.safeParse(row.query_json);
        return parsed.success ? [{ id: row.id, name: row.name, query: parsed.data as ChecklistFilterQuery }] : [];
      });
    },

    async saveFilterView(input: CommandContext & { name: string; query: ChecklistFilterQuery }) {
      const userId = requireCommand(input, P.projectRead);
      const name = requiredText(input.name, "FILTER_NAME_REQUIRED", "Filter name", 60);
      const parsed = FilterQuerySchema.safeParse(input.query);
      if (!parsed.success) throw invalid("FILTER_QUERY_INVALID", "This filter cannot be saved.");
      const row = await db.sfChecklistFilterView.upsert({
        where: { owner_id_name: { owner_id: userId, name } },
        create: { id: randomUUID(), owner_id: userId, name, query_json: parsed.data },
        update: { query_json: parsed.data },
      });
      return { id: row.id };
    },

    async deleteFilterView(input: CommandContext & { filterId: string }) {
      const userId = requireCommand(input, P.projectRead);
      await db.sfChecklistFilterView.deleteMany({ where: { id: input.filterId, owner_id: userId } });
      return { filterId: input.filterId };
    },

    // ── Templates (StudioFlow settings) ───────────────────────────────────
    async listTemplates(input: ReadContext & { includeInactive?: boolean }) {
      requireRead(input.grants);
      const rows = await db.sfChecklistTemplate.findMany({
        where: input.includeInactive ? {} : { is_active: true },
        orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
        include: { _count: { select: { generated_items: true } } },
      });
      return rows.map((row) => ({ id: row.id, definitionId: row.definition_id, label: row.label, isBlocking: row.is_blocking, isActive: row.is_active, sortOrder: row.sort_order, usedBy: row._count.generated_items }));
    },

    /** `definitionId` null = general (project-level); otherwise the template seeds phases created from that definition. */
    async createTemplate(input: CommandContext & { definitionId: string | null; label: string; isBlocking?: boolean }) {
      requireCommand(input, P.settingsManage);
      const label = requiredText(input.label, "TEMPLATE_LABEL_REQUIRED", "Checklist item", CHECKLIST_LABEL_MAX_LENGTH);
      return runTransaction(async (tx) => {
        if (input.definitionId !== null && !(await tx.sfPhaseDefinition.findUnique({ where: { id: input.definitionId }, select: { id: true } }))) {
          throw invalid("PHASE_DEFINITION_INVALID", "Unknown phase.");
        }
        const last = await tx.sfChecklistTemplate.findFirst({ where: { definition_id: input.definitionId }, orderBy: { sort_order: "desc" }, select: { sort_order: true } });
        const id = randomUUID();
        await tx.sfChecklistTemplate.create({ data: { id, definition_id: input.definitionId, label, is_blocking: input.isBlocking ?? true, sort_order: (last?.sort_order ?? 0) + CHECKLIST_SORT_STEP } });
        await writeAudit(ports, tx, { action: "studioflow.checklist-template.created", entityType: "checklist-template", entityId: id, actor: input.actor, metadata: { definitionId: input.definitionId, label, isBlocking: input.isBlocking ?? true } });
        return { templateId: id };
      });
    },

    /** Renaming a template never rewrites existing project rows. Changing is_blocking does not rewrite existing generated items. */
    async updateTemplate(input: CommandContext & { templateId: string; label?: string; isActive?: boolean; isBlocking?: boolean }) {
      requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfChecklistTemplate.findUnique({ where: { id: input.templateId } });
        if (!template) throw notFound("checklist template");
        const data: { label?: string; is_active?: boolean; is_blocking?: boolean } = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (input.label !== undefined) {
          const label = requiredText(input.label, "TEMPLATE_LABEL_REQUIRED", "Checklist item", CHECKLIST_LABEL_MAX_LENGTH);
          if (label !== template.label) { data.label = label; changes.label = { from: template.label, to: label }; }
        }
        if (input.isActive !== undefined && input.isActive !== template.is_active) { data.is_active = input.isActive; changes.isActive = { from: template.is_active, to: input.isActive }; }
        if (input.isBlocking !== undefined && input.isBlocking !== template.is_blocking) { data.is_blocking = input.isBlocking; changes.isBlocking = { from: template.is_blocking, to: input.isBlocking }; }
        if (Object.keys(changes).length === 0) return { templateId: template.id };
        await tx.sfChecklistTemplate.update({ where: { id: template.id }, data });
        await writeAudit(ports, tx, { action: "studioflow.checklist-template.updated", entityType: "checklist-template", entityId: template.id, actor: input.actor, changes });
        return { templateId: template.id };
      });
    },

    /** Generated rows are kept and become plain tasks (FK SetNull). */
    async deleteTemplate(input: CommandContext & { templateId: string }) {
      requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const template = await tx.sfChecklistTemplate.findUnique({ where: { id: input.templateId }, include: { _count: { select: { generated_items: true } } } });
        if (!template) throw notFound("checklist template");
        await tx.sfChecklistTemplate.delete({ where: { id: template.id } });
        await writeAudit(ports, tx, { action: "studioflow.checklist-template.deleted", entityType: "checklist-template", entityId: template.id, actor: input.actor, metadata: { label: template.label, definitionId: template.definition_id, detachedRows: template._count.generated_items } });
        return { templateId: template.id, detachedRows: template._count.generated_items };
      });
    },

    async reorderTemplates(input: CommandContext & { definitionId: string | null; orderedIds: string[] }) {
      requireCommand(input, P.settingsManage);
      return runTransaction(async (tx) => {
        const rows = await tx.sfChecklistTemplate.findMany({ where: { definition_id: input.definitionId }, select: { id: true } });
        const ids = new Set(rows.map((row) => row.id));
        if (rows.length !== input.orderedIds.length || input.orderedIds.some((id) => !ids.has(id))) throw invalid("REORDER_SCOPE", "Reorder must include exactly the items of one list.");
        for (const { id, sortOrder } of steppedSortOrders(input.orderedIds)) await tx.sfChecklistTemplate.update({ where: { id }, data: { sort_order: sortOrder } });
        await writeAudit(ports, tx, { action: "studioflow.checklist-template.reordered", entityType: "checklist-template", entityId: input.definitionId ?? "GENERAL", actor: input.actor, metadata: { definitionId: input.definitionId, count: input.orderedIds.length } });
        return { count: input.orderedIds.length };
      });
    },

    /** Idempotent "Apply templates" for one project (legacy sync). */
    async syncProjectChecklist(input: CommandContext & { projectId: string }) {
      const userId = requireCommand(input, P.taskManage);
      return runTransaction(async (tx) => {
        const project = await tx.sfProject.findUnique({ where: { id: input.projectId } });
        if (!project) throw notFound("project");
        if (project.archived_at) throw conflict("PROJECT_ARCHIVED", "This project is archived. Restore it before making changes.");
        const created = await seedChecklistFromTemplates(tx, project.id, userId);
        if (created > 0) await writeAudit(ports, tx, { action: "studioflow.checklist.synced", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, created } });
        return { created };
      });
    },
  };
}

export function normalizeLabelName(value: string): string {
  return normalizeText(value).toLowerCase();
}
