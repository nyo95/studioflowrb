import { Prisma, SfCdItemStatus } from "@/generated/prisma/client";

import { drawingGroup, drawingNumber, normalizeDrawingCode } from "../domain/cd-list";
import {
  P,
  invalid,
  loadWritablePhase,
  notFound,
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

const STATUS_VALUES = new Set<string>(Object.values(SfCdItemStatus));
const ITEM_SELECT = {
  id: true,
  phase_id: true,
  drawing_code: true,
  drawing_name: true,
  status: true,
  assigned_to_id: true,
  created_by_id: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.SfCdItemSelect;

type ItemRow = Prisma.SfCdItemGetPayload<{ select: typeof ITEM_SELECT }>;

export type CdItemView = {
  id: string;
  phaseId: string;
  drawingCode: string;
  drawingName: string;
  status: SfCdItemStatus;
  assigneeId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  group: string;
};

function toView(item: ItemRow): CdItemView {
  return {
    id: item.id,
    phaseId: item.phase_id,
    drawingCode: item.drawing_code,
    drawingName: item.drawing_name,
    status: item.status,
    assigneeId: item.assigned_to_id,
    createdById: item.created_by_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    group: drawingGroup(item.drawing_code),
  };
}

function compareItems(left: CdItemView, right: CdItemView): number {
  const leftNumber = drawingNumber(left.drawingCode);
  const rightNumber = drawingNumber(right.drawingCode);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumber !== null && rightNumber === null) return -1;
  if (leftNumber === null && rightNumber !== null) return 1;
  return left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
}

function assertDrafterPhase(phase: { seat_snapshot: string }) {
  if (phase.seat_snapshot !== "drafter") throw invalid("CD_LIST_WRONG_PHASE", "The CD List is available only on a drafter phase.");
}

export function createCdListService(db: Db, ports: StudioFlowPorts) {
  const { runTransaction } = ports;

  async function assertAssignee(assigneeId: string | null | undefined) {
    if (!assigneeId) return;
    const holders = await ports.people.listHolders(P.phaseWork);
    if (!holders.some((person) => person.id === assigneeId)) {
      throw invalid("CD_ASSIGNEE_NOT_ELIGIBLE", "The selected person cannot be assigned a drawing.");
    }
  }

  async function loadReadPhase(projectId: string, phaseId: string) {
    const phase = await db.sfPhase.findUnique({ where: { id: phaseId }, select: { id: true, project_id: true, seat_snapshot: true } });
    if (!phase || phase.project_id !== projectId) throw notFound("phase");
    assertDrafterPhase(phase);
    return phase;
  }

  async function loadWritableCdPhase(tx: TxClient, input: CommandContext & { projectId: string; phaseId: string }) {
    const phase = await loadWritablePhase(tx, input.projectId, input.phaseId);
    assertDrafterPhase(phase);
    const userId = requireCommand(input, P.phaseWork);
    await requireProjectAccess(tx, { grants: input.grants, actorId: userId, projectId: input.projectId, phaseId: input.phaseId, kind: "content" });
    return { phase, userId };
  }

  async function loadWritableItem(tx: TxClient, input: CommandContext & { projectId: string; phaseId: string; itemId: string }) {
    const item = await tx.sfCdItem.findUnique({ where: { id: input.itemId }, select: ITEM_SELECT });
    if (!item || item.phase_id !== input.phaseId) throw notFound("CD item");
    await loadWritableCdPhase(tx, input);
    return item;
  }

  function metadata(item: Pick<ItemRow, "phase_id" | "drawing_code" | "drawing_name">, projectId: string) {
    return { projectId, phaseId: item.phase_id, drawingCode: item.drawing_code, drawingName: item.drawing_name };
  }

  return {
    async list(input: ReadContext & { projectId: string; phaseId: string }) {
      requireRead(input.grants);
      await loadReadPhase(input.projectId, input.phaseId);
      const rows = await db.sfCdItem.findMany({ where: { phase_id: input.phaseId }, select: ITEM_SELECT });
      return rows.map(toView).sort(compareItems);
    },

    async create(input: CommandContext & { projectId: string; phaseId: string; drawingCode: string; drawingName: string; assignedToId?: string | null }) {
      const drawingCode = normalizeDrawingCode(input.drawingCode);
      const drawingName = requiredText(input.drawingName, "DRAWING_NAME_REQUIRED", "Drawing name", 200);
      await assertAssignee(input.assignedToId);
      return runTransaction(async (tx) => {
        const { userId } = await loadWritableCdPhase(tx, input);
        const item = await tx.sfCdItem.create({ data: { phase_id: input.phaseId, drawing_code: drawingCode, drawing_name: drawingName, assigned_to_id: input.assignedToId ?? null, created_by_id: userId }, select: ITEM_SELECT });
        await writeAudit(ports, tx, { action: "studioflow.cd-item.created", entityType: "cd_item", entityId: item.id, actor: input.actor, metadata: metadata(item, input.projectId) });
        return toView(item);
      });
    },

    async update(input: CommandContext & { projectId: string; phaseId: string; itemId: string; drawingCode?: string; drawingName?: string; assignedToId?: string | null }) {
      const drawingCode = input.drawingCode === undefined ? undefined : normalizeDrawingCode(input.drawingCode);
      const drawingName = input.drawingName === undefined ? undefined : requiredText(input.drawingName, "DRAWING_NAME_REQUIRED", "Drawing name", 200);
      await assertAssignee(input.assignedToId);
      return runTransaction(async (tx) => {
        const item = await loadWritableItem(tx, input);
        const data: Prisma.SfCdItemUncheckedUpdateInput = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (drawingCode !== undefined && drawingCode !== item.drawing_code) { data.drawing_code = drawingCode; changes.drawingCode = { from: item.drawing_code, to: drawingCode }; }
        if (drawingName !== undefined && drawingName !== item.drawing_name) { data.drawing_name = drawingName; changes.drawingName = { from: item.drawing_name, to: drawingName }; }
        if (input.assignedToId !== undefined && input.assignedToId !== item.assigned_to_id) { data.assigned_to_id = input.assignedToId; changes.assignedToId = { from: item.assigned_to_id, to: input.assignedToId }; }
        if (Object.keys(changes).length === 0) return toView(item);
        const updated = await tx.sfCdItem.update({ where: { id: item.id }, data, select: ITEM_SELECT });
        await writeAudit(ports, tx, { action: "studioflow.cd-item.updated", entityType: "cd_item", entityId: updated.id, actor: input.actor, changes, metadata: metadata(updated, input.projectId) });
        return toView(updated);
      });
    },

    async setStatus(input: CommandContext & { projectId: string; phaseId: string; itemId: string; status: SfCdItemStatus }) {
      if (!STATUS_VALUES.has(input.status)) throw invalid("CD_STATUS_INVALID", "Choose a valid drawing status.");
      return runTransaction(async (tx) => {
        const item = await loadWritableItem(tx, input);
        if (item.status === input.status) return toView(item);
        const updated = await tx.sfCdItem.update({ where: { id: item.id }, data: { status: input.status }, select: ITEM_SELECT });
        await writeAudit(ports, tx, { action: "studioflow.cd-item.status-changed", entityType: "cd_item", entityId: updated.id, actor: input.actor, changes: { status: { from: item.status, to: updated.status } }, metadata: metadata(updated, input.projectId) });
        return toView(updated);
      });
    },

    async delete(input: CommandContext & { projectId: string; phaseId: string; itemId: string }) {
      return runTransaction(async (tx) => {
        const item = await loadWritableItem(tx, input);
        await tx.sfCdItem.delete({ where: { id: item.id } });
        await writeAudit(ports, tx, { action: "studioflow.cd-item.deleted", entityType: "cd_item", entityId: item.id, actor: input.actor, metadata: metadata(item, input.projectId) });
        return { itemId: item.id };
      });
    },
  };
}
