import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";

import {
  CHECKLIST_LABEL_MAX_LENGTH,
  CHECKLIST_SORT_STEP,
  buildTree,
  canTickChecklistItem,
  cascadeTargets,
  steppedSortOrders,
} from "../domain/checklist";
import { isPhaseModifiable, type PhaseStatus } from "../domain/phase";
import {
  P,
  assertProjectWritable,
  conflict,
  hasPermission,
  invalid,
  notFound,
  nowOf,
  requireCommand,
  requireProjectAccess,
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
  template_id: true,
  created_at: true,
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
  templateId: string | null;
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
    templateId: row.template_id,
  };
}

export { ITEM_SELECT };

export function createTaskService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;
  async function assertTemplateLabelFree(tx: TxClient, definitionId: string | null, label: string, exceptId?: string) {
    const clash = await tx.sfChecklistTemplate.findFirst({ where: { definition_id: definitionId, is_active: true, label: { equals: label, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw conflict("TEMPLATE_LABEL_DUPLICATE", "This phase already has a requirement with that text.");
  }

  /** `allowLocked`: ticking a requirement stays possible after its phase is done (WO-SF-ITER-01 decision 4). */
  async function loadItem(tx: TxClient, projectId: string, itemId: string, access?: CommandContext, options: { allowLocked?: boolean } = {}) {
    const item = await tx.sfChecklistItem.findUnique({ where: { id: itemId }, include: { project: true, phase: true } });
    if (!item || item.project_id !== projectId) throw notFound("checklist item");
    assertProjectWritable(item.project);
    if (!options.allowLocked && item.phase && !isPhaseModifiable({ status: item.phase.status as PhaseStatus, isLocked: item.phase.is_locked })) {
      throw conflict("PHASE_LOCKED", "This phase is approved and locked. Reopen it first.");
    }
    if (access?.actor.userId) await requireProjectAccess(tx, { grants: access.grants, actorId: access.actor.userId, projectId, phaseId: item.phase_id, kind: item.phase_id ? "content" : "document" });
    return item;
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
        where: { project_id: input.projectId, dismissed_at: null, ...(input.phaseId === undefined ? {} : { phase_id: input.phaseId }) },
        select: ITEM_SELECT,
        orderBy: ITEM_ORDER,
      });
      const views = rows.map(toItemView);
      return buildTree(views);
    },

    canManageTasks(grants: ReadContext["grants"]) {
      return hasPermission(grants, P.taskManage);
    },

    // ── Items ──────────────────────────────────────────────────────────────
    /**
     * Root items come from templates only (legacy rule). People add subtasks
     * that break a requirement down; subtasks inherit project and phase and
     * never block approval.
     */
    async createSubtask(input: CommandContext & { projectId: string; parentId: string; label: string }) {
      const userId = requireCommand(input, P.taskManage);
      const label = requiredText(input.label, "CHECKLIST_LABEL_REQUIRED", "Task", CHECKLIST_LABEL_MAX_LENGTH);
      return runTransaction(async (tx) => {
        const parent = await loadItem(tx, input.projectId, input.parentId, input);
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

    async updateItem(input: CommandContext & { projectId: string; itemId: string; label?: string; isBlocking?: boolean }) {
      requireCommand(input, P.taskManage);
      return runTransaction(async (tx) => {
        const item = await loadItem(tx, input.projectId, input.itemId, input);
        const data: Prisma.SfChecklistItemUncheckedUpdateInput = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (input.label !== undefined) {
          const label = requiredText(input.label, "CHECKLIST_LABEL_REQUIRED", "Task", CHECKLIST_LABEL_MAX_LENGTH);
          if (label !== item.label) { data.label = label; changes.label = { from: item.label, to: label }; }
        }
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
        const item = await loadItem(tx, input.projectId, input.itemId, undefined, { allowLocked: true });
        await requireProjectAccess(tx, { grants: input.grants, actorId: input.actor.userId!, projectId: input.projectId, phaseId: item.phase_id, kind: item.phase_id ? "content" : "document" });
        if (!canTickChecklistItem({ parentId: item.parent_id, phaseId: item.phase_id }, { canManageTasks: hasPermission(input.grants, P.taskManage), canWork: hasPermission(input.grants, P.phaseWork) })) {
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

    /** Renumbers one sibling group; every id must share project, phase, and parent. */
    async reorderItems(input: CommandContext & { projectId: string; orderedIds: string[] }) {
      requireCommand(input, P.taskManage);
      if (input.orderedIds.length === 0) return { count: 0 };
      if (new Set(input.orderedIds).size !== input.orderedIds.length) throw invalid("REORDER_DUPLICATE", "Each task can appear only once.");
      return runTransaction(async (tx) => {
        const first = await loadItem(tx, input.projectId, input.orderedIds[0], input);
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
    /** Two active requirements with the same text on one phase would be copied twice into every new project. */
    async createTemplate(input: CommandContext & { definitionId: string | null; label: string; isBlocking?: boolean }) {
      requireCommand(input, P.settingsManage);
      const label = requiredText(input.label, "TEMPLATE_LABEL_REQUIRED", "Checklist item", CHECKLIST_LABEL_MAX_LENGTH);
      return runTransaction(async (tx) => {
        if (input.definitionId !== null && !(await tx.sfPhaseDefinition.findUnique({ where: { id: input.definitionId }, select: { id: true } }))) {
          throw invalid("PHASE_DEFINITION_INVALID", "Unknown phase.");
        }
        await assertTemplateLabelFree(tx, input.definitionId, label);
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
        if ((data.label !== undefined || data.is_active === true) && (data.is_active ?? template.is_active)) await assertTemplateLabelFree(tx, template.definition_id, data.label ?? template.label, template.id);
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
        assertProjectWritable(project);
        await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, kind: "document" });
        const created = await seedChecklistFromTemplates(tx, project.id, userId);
        if (created > 0) await writeAudit(ports, tx, { action: "studioflow.checklist.synced", entityType: "project", entityId: project.id, actor: input.actor, metadata: { projectId: project.id, created } });
        return { created };
      });
    },
  };
}
