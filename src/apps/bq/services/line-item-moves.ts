import { z } from "zod";
import { AppError } from "@platform/core/errors";
import { hasAnyPermission, requirePermission, type PermissionGrants } from "@platform/core/rbac";
import { validationError } from "@platform/core/validation";
import { isDecimalString, toDecimalString } from "@platform/utilities/decimal";
import { BQ_PERMISSIONS, requireMarkupPercent, requirePositiveCoefficient, type BqServiceContext } from "./context";
import { previewCalculationMove, type LineItemMoveTarget, type LineItemPreviewTarget, type MoveCalculationItem } from "../lib/line-item-move";

const TargetSchema = z.union([z.strictObject({ direct: z.literal(true) }), z.strictObject({ subObjectId: z.string().min(1) })]);
const GroupValuesSchema = z.strictObject({
  qtyPerL1: z.string().trim().refine(isDecimalString, "Quantity must be a canonical decimal").optional(),
  markupL2Pct: z.string().trim().regex(/^-?\d+(\.\d+)?$/).optional(),
});
const PreviewTargetSchema = z.union([TargetSchema, z.strictObject({ newGroup: GroupValuesSchema })]);
type MoveInput = { grants: PermissionGrants; itemId: string; lineItemIds: string[] };
type Actor = { kind: string; userId?: string; label: string };

export function createLineItemMoveService(ctx: BqServiceContext) {
  const { db, auditWriter, requireEditableProjectForItem } = ctx;

  async function load(input: MoveInput, target?: LineItemMoveTarget) {
    if (input.lineItemIds.length === 0 || new Set(input.lineItemIds).size !== input.lineItemIds.length) {
      throw new AppError("VALIDATION", "bq.line-item.move-invalid", "Select at least one Cost Component without duplicates.");
    }
    const item = await db.bqItem.findUnique({
      where: { id: input.itemId },
      include: {
        line_items: { orderBy: { sort_order: "asc" } },
        sub_objects: { orderBy: { sort_order: "asc" }, include: { line_items: { orderBy: { sort_order: "asc" } } } },
      },
    });
    const stale = () => new AppError("CONFLICT", "bq.line-item.move-stale", "The list changed. Refresh and try again.");
    if (!item) throw stale();
    const lines = [...item.line_items, ...item.sub_objects.flatMap((group) => group.line_items)];
    const selected = new Set(input.lineItemIds);
    if (input.lineItemIds.some((id) => !lines.some((line) => line.id === id))) throw stale();
    if (target && "subObjectId" in target && !item.sub_objects.some((group) => group.id === target.subObjectId)) throw stale();
    return { item, selected, lines: lines.filter((line) => selected.has(line.id)) };
  }
  type Loaded = Awaited<ReturnType<typeof load>>;

  async function groupValues(input: { qtyPerL1?: string; markupL2Pct?: string }) {
    const parsed = GroupValuesSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const qty = requirePositiveCoefficient((parsed.data.qtyPerL1 ?? "1").trim());
    const markup = requireMarkupPercent((parsed.data.markupL2Pct ?? "0").trim());
    // Match PostgreSQL's existing storage scales before previewing; no engine
    // rounding changes and no floating-point approximation of stored values.
    const [values] = await db.$queryRaw<{ qty: string; markup: string }[]>`
      SELECT CAST(${qty} AS DECIMAL(18,6))::text AS qty,
             CAST(${markup} AS DECIMAL(7,4))::text AS markup
    `;
    const qtyPerL1 = toDecimalString(values!.qty);
    requirePositiveCoefficient(qtyPerL1);
    return { qtyPerL1, markupL2Pct: toDecimalString(values!.markup) };
  }

  async function previewLineItemMove(input: MoveInput & { target: LineItemPreviewTarget }) {
    if (!hasAnyPermission(input.grants, [BQ_PERMISSIONS.projectRead, BQ_PERMISSIONS.projectManage])) {
      requirePermission(input.grants, BQ_PERMISSIONS.projectRead);
    }
    const parsed = PreviewTargetSchema.safeParse(input.target);
    if (!parsed.success) throw validationError(parsed.error);
    const target = parsed.data;
    const loaded = await load(input, "newGroup" in target ? undefined : target);
    const { item } = loaded;
    const lineInput = (line: Loaded["lines"][number]) => ({
      id: line.id, qty: toDecimalString(line.qty.toString()),
      hargaSnapshot: toDecimalString(line.harga_snapshot.toString()), koefisien: toDecimalString(line.koefisien.toString()),
    });
    const calculation: MoveCalculationItem = {
      qty: toDecimalString(item.qty.toString()), markupL1Pct: toDecimalString(item.markup_l1_pct.toString()),
      hargaSnapshot: item.harga_snapshot === null ? undefined : toDecimalString(item.harga_snapshot.toString()),
      koefisien: toDecimalString(item.koefisien.toString()),
      lineItemsDirect: item.line_items.map(lineInput),
      subObjects: item.sub_objects.map((group) => ({
        id: group.id, qtyPerL1: toDecimalString(group.qty_per_l1.toString()), markupL2Pct: toDecimalString(group.markup_l2_pct.toString()),
        lineItems: group.line_items.map(lineInput),
      })),
    };
    return previewCalculationMove(calculation, input.lineItemIds,
      "newGroup" in target ? { newGroup: await groupValues(target.newGroup) } : target);
  }

  async function move(loaded: Loaded, target: LineItemMoveTarget) {
    const targetId = "subObjectId" in target ? target.subObjectId : null;
    const moved = loaded.lines.filter((line) => line.sub_object_id !== targetId);
    if (moved.length === 0) return moved;
    const targetLines = targetId === null ? loaded.item.line_items : loaded.item.sub_objects.find((group) => group.id === targetId)?.line_items ?? [];
    const start = targetLines.reduce((max, line) => Math.max(max, line.sort_order), -1) + 1;
    for (const [index, line] of moved.entries()) {
      await db.bqLineItem.update({ where: { id: line.id }, data: {
        item_id: targetId === null ? loaded.item.id : null, sub_object_id: targetId, sort_order: start + index,
      } });
    }
    const sources = new Set(moved.map((line) => line.sub_object_id));
    for (const sourceId of sources) {
      const original = sourceId === null ? loaded.item.line_items : loaded.item.sub_objects.find((group) => group.id === sourceId)!.line_items;
      const remaining = original.filter((line) => !loaded.selected.has(line.id));
      const changed = remaining.flatMap((line, index) => line.sort_order === index ? [] : [{ id: line.id, sortOrder: index }]);
      const offset = original.reduce((max, line) => Math.max(max, line.sort_order + 1), remaining.length);
      for (const [index, line] of changed.entries()) {
        await db.bqLineItem.update({ where: { id: line.id }, data: { sort_order: offset + index } });
      }
      for (const line of changed) {
        await db.bqLineItem.update({ where: { id: line.id }, data: { sort_order: line.sortOrder } });
      }
    }
    return moved;
  }

  async function moveLineItems(input: MoveInput & { actor: Actor; target: LineItemMoveTarget }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const parsed = TargetSchema.safeParse(input.target);
    if (!parsed.success) throw validationError(parsed.error);
    const loaded = await load(input, parsed.data);
    await requireEditableProjectForItem(input.itemId);
    const moved = await move(loaded, parsed.data);
    if (moved.length === 0) return;
    await auditWriter({ appId: "bq", action: "bq.line-items.moved", entityType: "BqItem", entityId: input.itemId, actor: input.actor,
      changes: { count: moved.length, itemId: input.itemId, sourceParentIds: [...new Set(moved.map((line) => line.sub_object_id ?? input.itemId))], targetParentId: "subObjectId" in parsed.data ? parsed.data.subObjectId : input.itemId } });
  }

  async function groupLineItems(input: MoveInput & { actor: Actor; name: string; qtyPerL1?: string; markupL2Pct?: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const name = input.name.trim();
    if (!name) throw new AppError("VALIDATION", "bq.sub-object.name-required", "Component Group name is required.");
    const loaded = await load(input);
    await requireEditableProjectForItem(input.itemId);
    const values = await groupValues({ qtyPerL1: input.qtyPerL1, markupL2Pct: input.markupL2Pct });
    const sortOrder = loaded.item.sub_objects.reduce((max, group) => Math.max(max, group.sort_order), -1) + 1;
    const group = await db.bqSubObject.create({ data: { item_id: input.itemId, name, qty_per_l1: values.qtyPerL1, markup_l2_pct: values.markupL2Pct, sort_order: sortOrder } });
    const moved = await move(loaded, { subObjectId: group.id });
    await auditWriter({ appId: "bq", action: "bq.line-items.grouped", entityType: "BqItem", entityId: input.itemId, actor: input.actor,
      changes: { count: moved.length, itemId: input.itemId, sourceParentIds: [...new Set(moved.map((line) => line.sub_object_id ?? input.itemId))], targetParentId: group.id } });
    return group;
  }
  return { previewLineItemMove, moveLineItems, groupLineItems };
}
