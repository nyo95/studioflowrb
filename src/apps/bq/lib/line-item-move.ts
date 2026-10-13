import { compareDecimals } from "@platform/utilities/decimal";
import { calculateItem, type ItemInput, type LineItemInput, type SubObjectInput } from "./calculation-engine";

export type LineItemMoveTarget = { direct: true } | { subObjectId: string };
export type LineItemPreviewTarget = LineItemMoveTarget | { newGroup: { qtyPerL1?: string; markupL2Pct?: string } };
export type MoveCalculationItem = Omit<ItemInput, "lineItemsDirect" | "subObjects"> & {
  lineItemsDirect: (LineItemInput & { id: string })[];
  subObjects: (Omit<SubObjectInput, "lineItems"> & { id: string; lineItems: (LineItemInput & { id: string })[] })[];
};

/** Caller validates ownership and supplies the group's stored decimal representation. */
export function previewCalculationMove(
  item: MoveCalculationItem,
  lineItemIds: readonly string[],
  target: LineItemMoveTarget | { newGroup: Pick<SubObjectInput, "qtyPerL1" | "markupL2Pct"> },
) {
  const selected = new Set(lineItemIds);
  // Across parents, preserve tree order: direct rows, then groups in their order.
  const moved = [...item.lineItemsDirect, ...item.subObjects.flatMap((group) => group.lineItems)]
    .filter((line) => selected.has(line.id));
  const afterItem: ItemInput = {
    ...item,
    lineItemsDirect: item.lineItemsDirect.filter((line) => !selected.has(line.id)),
    subObjects: item.subObjects.map((group) => ({ ...group, lineItems: group.lineItems.filter((line) => !selected.has(line.id)) })),
  };
  if ("newGroup" in target) {
    afterItem.subObjects.push({ ...target.newGroup, lineItems: moved });
  } else if ("direct" in target) {
    // Rows already in the target keep their positions, just as in the command.
    afterItem.lineItemsDirect = [...item.lineItemsDirect, ...moved.filter((line) => !item.lineItemsDirect.some((existing) => existing.id === line.id))];
  } else {
    const index = item.subObjects.findIndex((group) => group.id === target.subObjectId);
    const existing = item.subObjects[index]!;
    afterItem.subObjects[index]!.lineItems = [...existing.lineItems, ...moved.filter((line) => !existing.lineItems.some((row) => row.id === line.id))];
  }
  const before = calculateItem(item);
  const after = calculateItem(afterItem);
  return {
    changes: compareDecimals(before.rate, after.rate) !== 0 || compareDecimals(before.total, after.total) !== 0,
    before: { rate: before.rate, total: before.total },
    after: { rate: after.rate, total: after.total },
  };
}
