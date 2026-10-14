import type { BqItemDetail } from "../public";

export type LineItemSelection = { itemId: string; lineItemIds: readonly string[] } | null;
export type ExistingLineItemTarget = { direct: true } | { subObjectId: string };
export type LineItemTargetOption = {
  key: string;
  label: string;
  description?: string;
  target: ExistingLineItemTarget | { newGroup: true };
};

export function lineItemIds(item: BqItemDetail): string[] {
  return [...item.subObjects.flatMap((group) => group.lineItems.map((line) => line.id)), ...item.lineItems.map((line) => line.id)];
}

export function selectionForItem(selection: LineItemSelection, itemId: string): readonly string[] {
  return selection?.itemId === itemId ? selection.lineItemIds : [];
}

export function toggleLineItemSelection(
  selection: LineItemSelection,
  itemId: string,
  lineItemId: string,
  checked: boolean,
): LineItemSelection {
  const current = selectionForItem(selection, itemId);
  const next = checked
    ? current.includes(lineItemId) ? [...current] : [...current, lineItemId]
    : current.filter((id) => id !== lineItemId);
  return next.length > 0 ? { itemId, lineItemIds: next } : null;
}

export function selectAllLineItems(item: BqItemDetail, checked: boolean): LineItemSelection {
  const ids = checked ? lineItemIds(item) : [];
  return ids.length > 0 ? { itemId: item.id, lineItemIds: ids } : null;
}

export function lineItemTargetOptions(item: BqItemDetail): LineItemTargetOption[] {
  return [
    { key: "direct", label: "Langsung di Work Item", target: { direct: true } },
    ...item.subObjects.map((group) => ({
      key: group.id,
      label: group.name,
      description: `×${group.qtyPerL1} · ${group.markupL2Pct}%`,
      target: { subObjectId: group.id } as ExistingLineItemTarget,
    })),
    { key: "new", label: "Component Group baru…", target: { newGroup: true } as const },
  ];
}

export function selectionAlreadyAtTarget(
  item: BqItemDetail,
  selectedIds: readonly string[],
  target: ExistingLineItemTarget,
): boolean {
  if (selectedIds.length === 0) return false;
  const parentByLineId = new Map<string, string | null>();
  item.lineItems.forEach((line) => parentByLineId.set(line.id, null));
  item.subObjects.forEach((group) => group.lineItems.forEach((line) => parentByLineId.set(line.id, group.id)));
  const targetParentId = "subObjectId" in target ? target.subObjectId : null;
  return selectedIds.every((id) => parentByLineId.has(id) && parentByLineId.get(id) === targetParentId);
}

export function buildLineItemMoveFields(input: {
  projectId: string;
  itemId: string;
  lineItemIds: readonly string[];
  target?: ExistingLineItemTarget | { newGroup: { qtyPerL1: string; markupL2Pct: string } };
  group?: { name: string; qtyPerL1: string; markupL2Pct: string };
}): Record<string, string> {
  return {
    projectId: input.projectId,
    itemId: input.itemId,
    lineItemIds: JSON.stringify(input.lineItemIds),
    ...(input.target ? { target: JSON.stringify(input.target) } : {}),
    ...(input.group ? input.group : {}),
  };
}
