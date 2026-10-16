import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

import {
  BQ_PERMISSIONS,
  decimalFieldUnchanged,
  fieldUnchanged,
  requireKategori,
  requireMarkupPercent,
  requirePositiveCoefficient,
  type BqKategori,
  type BqServiceContext,
} from "./context";
import { requireRupiah } from "../lib/currency";
import { BQ_PRICE_MODES, type BqPriceMode } from "../lib/quotation";


/** A Work Item's specification is plain text the quotation prints; 1000 characters is a long paragraph. */
function requireSpecification(value: string | null | undefined) {
  if (value != null && value.trim().length > 1000) {
    throw new AppError("VALIDATION", "bq.item.specification-too-long", "The specification is at most 1000 characters");
  }
}

export function createProjectTreeService(ctx: BqServiceContext) {
  const {
    db,
    runTransaction,
    runAutomaticSortTransaction,
    auditWriter,
    requireEditableProject,
    requireEditableProjectForSection,
    requireEditableProjectForSubsection,
    requireEditableProjectForItem,
    requireEditableProjectForLineItem,
    requireEditableProjectForSubObject,
  } = ctx;

  /**
   * A childless Work Item's own markupL1Pct becomes invisible in the UI (it
   * shows the Coefficient field instead, §Work Item row) but the calculation
   * engine keeps applying it — a silently active multiplier the user can no
   * longer see or edit. Zero it the moment the last sub-object/line item
   * under this Work Item is deleted, so nothing keeps multiplying unseen.
   */
  async function zeroMarkupIfChildless(itemId: string): Promise<void> {
    const [subObjectCount, lineItemCount] = await Promise.all([
      db.bqSubObject.count({ where: { item_id: itemId } }),
      db.bqLineItem.count({ where: { item_id: itemId } }),
    ]);
    if (subObjectCount === 0 && lineItemCount === 0) {
      await db.bqItem.update({ where: { id: itemId }, data: { markup_l1_pct: "0" } });
    }
  }

  // Every sibling under the same parent otherwise defaults to sort_order 0,
  // making same-parent display order unstable across reads (bq-contract §13.2).
  async function nextSortOrder(aggregate: () => Promise<{ _max: { sort_order: number | null } }>): Promise<number> {
    const result = await aggregate();
    return (result._max.sort_order ?? -1) + 1;
  }

async function addSection(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  projectId: string;
  name: string;
  sortOrder?: number;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProject(input.projectId);
  // Sibling sort_order must be read and reserved atomically — two near-simultaneous
  // adds under the same parent could otherwise both read the same MAX and collide.
  const section = await (input.sortOrder === undefined ? runAutomaticSortTransaction : runTransaction)(async (tx) => {
    const sortOrder = input.sortOrder ?? (await nextSortOrder(() => tx.bqSection.aggregate({
      where: { project_id: input.projectId },
      _max: { sort_order: true },
    })));
    return tx.bqSection.create({
      data: {
        project_id: input.projectId,
        name: input.name,
        sort_order: sortOrder,
      },
    });
  });
  await auditWriter({
    appId: "bq",
    action: "bq.section.created",
    entityType: "BqSection",
    entityId: section.id,
    actor: input.actor,
  });
  return section;
}

async function addSubsection(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  sectionId: string;
  name: string;
  sortOrder?: number;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForSection(input.sectionId);
  const subsection = await (input.sortOrder === undefined ? runAutomaticSortTransaction : runTransaction)(async (tx) => {
    const sortOrder = input.sortOrder ?? (await nextSortOrder(() => tx.bqSubsection.aggregate({
      where: { section_id: input.sectionId },
      _max: { sort_order: true },
    })));
    return tx.bqSubsection.create({
      data: {
        section_id: input.sectionId,
        name: input.name,
        sort_order: sortOrder,
      },
    });
  });
  await auditWriter({
    appId: "bq",
    action: "bq.subsection.created",
    entityType: "BqSubsection",
    entityId: subsection.id,
    actor: input.actor,
  });
  return subsection;
}

async function updateSection(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const section = await db.bqSection.findUnique({ where: { id: input.id }, select: { id: true, project_id: true, name: true } });
  if (!section) throw new AppError("NOT_FOUND", "bq.section.not-found", "Section not found");
  await requireEditableProject(section.project_id);
  if (input.name === section.name) return section;
  const updated = await db.bqSection.update({ where: { id: input.id }, data: { name: input.name } });
  await auditWriter({
    appId: "bq",
    action: "bq.section.updated",
    entityType: "BqSection",
    entityId: input.id,
    actor: input.actor,
  });
  return updated;
}

async function updateSubsection(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForSubsection(input.id);
  const subsection = await db.bqSubsection.findUnique({ where: { id: input.id } });
  if (!subsection) throw new AppError("NOT_FOUND", "bq.subsection.not-found", "Subsection not found");
  if (input.name === subsection.name) return subsection;
  const updated = await db.bqSubsection.update({ where: { id: input.id }, data: { name: input.name } });
  await auditWriter({
    appId: "bq",
    action: "bq.subsection.updated",
    entityType: "BqSubsection",
    entityId: input.id,
    actor: input.actor,
  });
  return updated;
}

/**
 * A Subsection is optional organisation inside a Section. Removing it keeps
 * its Work Items by making them direct children of that same Section instead
 * of relying on the database cascade that would destroy them.
 */
async function deleteSubsection(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const subsection = await db.bqSubsection.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      section_id: true,
      section: { select: { project_id: true } },
      items: { select: { id: true }, orderBy: { sort_order: "asc" } },
    },
  });
  if (!subsection) throw new AppError("NOT_FOUND", "bq.subsection.not-found", "Subsection not found");
  await requireEditableProject(subsection.section.project_id);

  // Direct Work Items have their own sibling-order namespace. Appending the
  // moved rows avoids its unique index and preserves their relative order.
  const lastDirect = await db.bqItem.aggregate({
    where: { section_id: subsection.section_id },
    _max: { sort_order: true },
  });
  const firstMovedOrder = (lastDirect._max.sort_order ?? -1) + 1;
  for (const [index, item] of subsection.items.entries()) {
    await db.bqItem.update({
      where: { id: item.id },
      data: { section_id: subsection.section_id, subsection_id: null, sort_order: firstMovedOrder + index },
    });
  }
  await db.bqSubsection.delete({ where: { id: subsection.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.subsection.deleted",
    entityType: "BqSubsection",
    entityId: subsection.id,
    actor: input.actor,
    changes: { sectionId: subsection.section_id, movedWorkItems: subsection.items.length },
  });
}

  async function addItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  sectionId?: string;
  subsectionId?: string;
  name: string;
  qty: string;
  unit: string;
  hargaSnapshot?: string;
  koefisien?: string;
  markupL1Pct?: string;
  priceMode?: BqPriceMode;
  specification?: string | null;
  sortOrder?: number;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  if (input.priceMode !== undefined && !BQ_PRICE_MODES.includes(input.priceMode)) {
    throw new AppError("VALIDATION", "bq.item.price-mode-invalid", "Unknown price mode");
  }
  requireSpecification(input.specification);

  if (!input.sectionId && !input.subsectionId) {
    throw new AppError("VALIDATION", "bq.item.no-parent", "Work Item must belong to a Section or Subsection");
  }
  if (input.sectionId && input.subsectionId) {
    throw new AppError("VALIDATION", "bq.item.dual-parent", "Work Item cannot belong to both a Section and Subsection");
  }

  if (input.markupL1Pct !== undefined) requireMarkupPercent(input.markupL1Pct);
  if (input.sectionId) await requireEditableProjectForSection(input.sectionId);
  else await requireEditableProjectForSubsection(input.subsectionId!);

  const item = await (input.sortOrder === undefined ? runAutomaticSortTransaction : runTransaction)(async (tx) => {
    const sortOrder = input.sortOrder ?? (await nextSortOrder(() => tx.bqItem.aggregate({
      where: input.sectionId ? { section_id: input.sectionId } : { subsection_id: input.subsectionId },
      _max: { sort_order: true },
    })));

    return tx.bqItem.create({
      data: {
        section_id: input.sectionId ?? null,
        subsection_id: input.subsectionId ?? null,
        name: input.name,
        qty: input.qty,
        unit: input.unit,
        harga_snapshot: input.hargaSnapshot ?? null,
        koefisien: requirePositiveCoefficient(input.koefisien ?? "1"),
        markup_l1_pct: input.markupL1Pct ?? "0",
        price_mode: input.priceMode ?? "PRICED",
        specification: input.specification?.trim() || null,
        sort_order: sortOrder,
        notes: input.notes ?? null,
      },
    });
  });

  await auditWriter({
    appId: "bq",
    action: "bq.item.created",
    entityType: "BqItem",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function reorderItems(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  sectionId?: string;
  subsectionId?: string;
  orderedIds: string[];
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  if (!input.sectionId && !input.subsectionId) {
    throw new AppError("VALIDATION", "bq.item.no-parent", "Work Item must belong to a Section or Subsection");
  }
  if (input.sectionId && input.subsectionId) {
    throw new AppError("VALIDATION", "bq.item.dual-parent", "Work Item cannot belong to both a Section and Subsection");
  }
  if (input.sectionId) await requireEditableProjectForSection(input.sectionId);
  else await requireEditableProjectForSubsection(input.subsectionId!);

  const children = await db.bqItem.findMany({
    where: input.sectionId ? { section_id: input.sectionId } : { subsection_id: input.subsectionId },
    select: { id: true, sort_order: true },
  });
  const positions = new Map(children.map((child) => [child.id, child.sort_order]));
  if (input.orderedIds.length !== children.length
    || new Set(input.orderedIds).size !== children.length
    || input.orderedIds.some((id) => !positions.has(id))) {
    throw new AppError("CONFLICT", "bq.item.reorder-stale", "The list changed. Refresh and try again.");
  }
  const changed = input.orderedIds.flatMap((id, sortOrder) =>
    positions.get(id) === sortOrder ? [] : [{ id, sortOrder }]);
  if (changed.length === 0) return;

  // Partial unique sibling indexes require parking changed rows above both
  // the current and final ranges before assigning their final positions.
  const offset = children.reduce((max, child) => Math.max(max, child.sort_order + 1), children.length);
  for (const [index, child] of changed.entries()) {
    await db.bqItem.update({ where: { id: child.id }, data: { sort_order: offset + index } });
  }
  for (const child of changed) {
    await db.bqItem.update({ where: { id: child.id }, data: { sort_order: child.sortOrder } });
  }
  await auditWriter({
    appId: "bq",
    action: "bq.items.reordered",
    entityType: input.sectionId ? "BqSection" : "BqSubsection",
    entityId: (input.sectionId ?? input.subsectionId)!,
    actor: input.actor,
    changes: { count: children.length },
  });
}

/**
 * The new order of one parent's children, checked against what is stored (a stale list is refused) and written with
 * the changed rows parked above both ranges first, because siblings have a unique position.
 */
async function writeSiblingOrder(
  children: readonly { id: string; sort_order: number }[],
  orderedIds: readonly string[],
  staleCode: string,
  setOrder: (id: string, sortOrder: number) => Promise<unknown>,
): Promise<boolean> {
  const positions = new Map(children.map((child) => [child.id, child.sort_order]));
  if (orderedIds.length !== children.length
    || new Set(orderedIds).size !== children.length
    || orderedIds.some((id) => !positions.has(id))) {
    throw new AppError("CONFLICT", staleCode, "The list changed. Refresh and try again.");
  }
  const changed = orderedIds.flatMap((id, sortOrder) => (positions.get(id) === sortOrder ? [] : [{ id, sortOrder }]));
  if (changed.length === 0) return false;
  const offset = children.reduce((max, child) => Math.max(max, child.sort_order + 1), children.length);
  for (const [index, child] of changed.entries()) await setOrder(child.id, offset + index);
  for (const child of changed) await setOrder(child.id, child.sortOrder);
  return true;
}

/** Sections of one project in a new order (owner 2026-10-14, by dragging in Struktur). */
async function reorderSections(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  projectId: string;
  orderedIds: string[];
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProject(input.projectId);
  const children = await db.bqSection.findMany({ where: { project_id: input.projectId }, select: { id: true, sort_order: true } });
  const changed = await writeSiblingOrder(children, input.orderedIds, "bq.section.reorder-stale",
    (id, sortOrder) => db.bqSection.update({ where: { id }, data: { sort_order: sortOrder } }));
  if (!changed) return;
  await auditWriter({ appId: "bq", action: "bq.sections.reordered", entityType: "BqProject", entityId: input.projectId, actor: input.actor, changes: { count: children.length } });
}

/** Subsections of one Section in a new order (owner 2026-10-14); they stay in their Section. */
async function reorderSubsections(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  sectionId: string;
  orderedIds: string[];
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForSection(input.sectionId);
  const children = await db.bqSubsection.findMany({ where: { section_id: input.sectionId }, select: { id: true, sort_order: true } });
  const changed = await writeSiblingOrder(children, input.orderedIds, "bq.subsection.reorder-stale",
    (id, sortOrder) => db.bqSubsection.update({ where: { id }, data: { sort_order: sortOrder } }));
  if (!changed) return;
  await auditWriter({ appId: "bq", action: "bq.subsections.reordered", entityType: "BqSection", entityId: input.sectionId, actor: input.actor, changes: { count: children.length } });
}

async function updateItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name?: string;
  qty?: string;
  unit?: string;
  hargaSnapshot?: string | null;
  koefisien?: string;
  markupL1Pct?: string;
  priceMode?: BqPriceMode;
  sortOrder?: number;
  notes?: string | null;
  specification?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  requireSpecification(input.specification);
  if (input.priceMode !== undefined && !BQ_PRICE_MODES.includes(input.priceMode)) {
    throw new AppError("VALIDATION", "bq.item.price-mode-invalid", "Unknown price mode");
  }
  if (input.koefisien !== undefined) requirePositiveCoefficient(input.koefisien);
  if (input.markupL1Pct !== undefined) requireMarkupPercent(input.markupL1Pct);
  await requireEditableProjectForItem(input.id);

  const existing = await db.bqItem.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.item.not-found", "Work Item not found");
  if (
    fieldUnchanged(input.name, existing.name)
    && decimalFieldUnchanged(input.qty, existing.qty)
    && fieldUnchanged(input.unit, existing.unit)
    && decimalFieldUnchanged(input.hargaSnapshot, existing.harga_snapshot)
    && decimalFieldUnchanged(input.koefisien, existing.koefisien)
    && decimalFieldUnchanged(input.markupL1Pct, existing.markup_l1_pct)
    && fieldUnchanged(input.priceMode, existing.price_mode)
    && fieldUnchanged(input.sortOrder, existing.sort_order)
    && fieldUnchanged(input.notes, existing.notes)
    && fieldUnchanged(input.specification, existing.specification)
  ) return existing;

  const item = await db.bqItem.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.qty !== undefined && { qty: input.qty }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.hargaSnapshot !== undefined && { harga_snapshot: input.hargaSnapshot }),
      ...(input.koefisien !== undefined && { koefisien: input.koefisien }),
      ...(input.markupL1Pct !== undefined && { markup_l1_pct: input.markupL1Pct }),
      ...(input.priceMode !== undefined && { price_mode: input.priceMode }),
      ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.specification !== undefined && { specification: input.specification?.trim() || null }),
    },
  });

  await auditWriter({
    appId: "bq",
    action: "bq.item.updated",
    entityType: "BqItem",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function deleteItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForItem(input.id);
  await db.bqItem.delete({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.item.deleted",
    entityType: "BqItem",
    entityId: input.id,
    actor: input.actor,
  });
}

async function addSubObject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  itemId: string;
  name: string;
  qtyPerL1: string;
  markupL2Pct?: string;
  sortOrder?: number;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  if (input.markupL2Pct !== undefined) requireMarkupPercent(input.markupL2Pct);
  await requireEditableProjectForItem(input.itemId);

  const subObject = await (input.sortOrder === undefined ? runAutomaticSortTransaction : runTransaction)(async (tx) => {
    const sortOrder = input.sortOrder ?? (await nextSortOrder(() => tx.bqSubObject.aggregate({
      where: { item_id: input.itemId },
      _max: { sort_order: true },
    })));

    return tx.bqSubObject.create({
      data: {
        item_id: input.itemId,
        name: input.name,
        qty_per_l1: input.qtyPerL1,
        markup_l2_pct: input.markupL2Pct ?? "0",
        sort_order: sortOrder,
        notes: input.notes ?? null,
      },
    });
  });
  // bq-contract §6.2: the L1-only harga_snapshot is simply unused while the
  // item has children. Clearing it here destroyed the estimator's price and
  // left the L1 uncalculable if the last child was later removed.

  await auditWriter({
    appId: "bq",
    action: "bq.sub-object.created",
    entityType: "BqSubObject",
    entityId: subObject.id,
    actor: input.actor,
  });
  return subObject;
}

async function updateSubObject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name?: string;
  qtyPerL1?: string;
  markupL2Pct?: string;
  sortOrder?: number;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  if (input.markupL2Pct !== undefined) requireMarkupPercent(input.markupL2Pct);
  await requireEditableProjectForSubObject(input.id);

  const existing = await db.bqSubObject.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.sub-object.not-found", "Component Group not found");
  if (
    fieldUnchanged(input.name, existing.name)
    && decimalFieldUnchanged(input.qtyPerL1, existing.qty_per_l1)
    && decimalFieldUnchanged(input.markupL2Pct, existing.markup_l2_pct)
    && fieldUnchanged(input.sortOrder, existing.sort_order)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;

  const subObject = await db.bqSubObject.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.qtyPerL1 !== undefined && { qty_per_l1: input.qtyPerL1 }),
      ...(input.markupL2Pct !== undefined && { markup_l2_pct: input.markupL2Pct }),
      ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  await auditWriter({
    appId: "bq",
    action: "bq.sub-object.updated",
    entityType: "BqSubObject",
    entityId: subObject.id,
    actor: input.actor,
  });
  return subObject;
}

async function deleteSubObject(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const itemId = await requireEditableProjectForSubObject(input.id);
  await db.bqSubObject.delete({ where: { id: input.id } });
  await zeroMarkupIfChildless(itemId);
  await auditWriter({
    appId: "bq",
    action: "bq.sub-object.deleted",
    entityType: "BqSubObject",
    entityId: input.id,
    actor: input.actor,
  });
}

async function addLineItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  subObjectId?: string;
  itemId?: string;
  sourceType: "MASTERDATA" | "BQ_LIBRARY" | "CUSTOM";
  sourceRefId?: string;
  sourceImportedAt?: Date;
  titleSnapshot: string;
  purchaseUnitSnapshot: string;
  baseUnitSnapshot?: string | null;
  purchaseToBaseFactorSnapshot?: string;
  hargaSnapshot: string;
  currencySnapshot?: string;
  kategori: string;
  qty: string;
  koefisien?: string;
  sortOrder?: number;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const currencySnapshot = requireRupiah(input.currencySnapshot ?? "IDR");

  if (!input.subObjectId && !input.itemId) {
    throw new AppError("VALIDATION", "bq.line-item.no-parent", "Cost Component must belong to a Component Group or Work Item");
  }
  if (input.subObjectId && input.itemId) {
    throw new AppError("VALIDATION", "bq.line-item.dual-parent", "Cost Component cannot belong to both a Component Group and Work Item");
  }

  if (input.subObjectId) await requireEditableProjectForSubObject(input.subObjectId);
  else await requireEditableProjectForItem(input.itemId!);

  const lineItem = await (input.sortOrder === undefined ? runAutomaticSortTransaction : runTransaction)(async (tx) => {
    const sortOrder = input.sortOrder ?? (await nextSortOrder(() => tx.bqLineItem.aggregate({
      where: input.subObjectId ? { sub_object_id: input.subObjectId } : { item_id: input.itemId },
      _max: { sort_order: true },
    })));

    return tx.bqLineItem.create({
      data: {
        sub_object_id: input.subObjectId ?? null,
        item_id: input.itemId ?? null,
        source_type: input.sourceType,
        source_ref_id: input.sourceRefId ?? null,
        source_imported_at: input.sourceImportedAt ?? null,
        title_snapshot: input.titleSnapshot,
        purchase_unit_snapshot: input.purchaseUnitSnapshot,
        base_unit_snapshot: input.baseUnitSnapshot ?? null,
        purchase_to_base_factor_snapshot: input.purchaseToBaseFactorSnapshot ?? null,
        source_price_snapshot: input.sourceType === "CUSTOM" ? null : input.hargaSnapshot,
        harga_snapshot: input.hargaSnapshot,
        currency_snapshot: currencySnapshot,
        kategori: requireKategori(input.kategori),
        qty: input.qty,
        koefisien: requirePositiveCoefficient(input.koefisien ?? "1"),
        sort_order: sortOrder,
        notes: input.notes ?? null,
      },
    });
  });
  await auditWriter({
    appId: "bq",
    action: "bq.line-item.created",
    entityType: "BqLineItem",
    entityId: lineItem.id,
    actor: input.actor,
  });
  return lineItem;
}

async function updateLineItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  titleSnapshot?: string;
  purchaseUnitSnapshot?: string;
  baseUnitSnapshot?: string | null;
  purchaseToBaseFactorSnapshot?: string | null;
  hargaSnapshot?: string;
  currencySnapshot?: string;
  kategori?: BqKategori;
  qty?: string;
  koefisien?: string;
  sortOrder?: number;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const currencySnapshot = input.currencySnapshot === undefined ? undefined : requireRupiah(input.currencySnapshot);
  if (input.koefisien !== undefined) requirePositiveCoefficient(input.koefisien);
  await requireEditableProjectForLineItem(input.id);
  const existing = await db.bqLineItem.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Cost Component not found");
  if (
    fieldUnchanged(input.titleSnapshot, existing.title_snapshot)
    && fieldUnchanged(input.purchaseUnitSnapshot, existing.purchase_unit_snapshot)
    && fieldUnchanged(input.baseUnitSnapshot, existing.base_unit_snapshot)
    && decimalFieldUnchanged(input.purchaseToBaseFactorSnapshot, existing.purchase_to_base_factor_snapshot)
    && decimalFieldUnchanged(input.hargaSnapshot, existing.harga_snapshot)
    && fieldUnchanged(input.currencySnapshot, existing.currency_snapshot)
    && fieldUnchanged(input.kategori, existing.kategori)
    && decimalFieldUnchanged(input.qty, existing.qty)
    && decimalFieldUnchanged(input.koefisien, existing.koefisien)
    && fieldUnchanged(input.sortOrder, existing.sort_order)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;

  const lineItem = await db.bqLineItem.update({
    where: { id: input.id },
    data: {
      ...(input.titleSnapshot !== undefined && { title_snapshot: input.titleSnapshot }),
      ...(input.purchaseUnitSnapshot !== undefined && { purchase_unit_snapshot: input.purchaseUnitSnapshot }),
      ...(input.baseUnitSnapshot !== undefined && { base_unit_snapshot: input.baseUnitSnapshot }),
      ...(input.purchaseToBaseFactorSnapshot !== undefined && { purchase_to_base_factor_snapshot: input.purchaseToBaseFactorSnapshot }),
      ...(input.hargaSnapshot !== undefined && { harga_snapshot: input.hargaSnapshot }),
      ...(currencySnapshot !== undefined && { currency_snapshot: currencySnapshot }),
      ...(input.kategori !== undefined && { kategori: requireKategori(input.kategori) }),
      ...(input.qty !== undefined && { qty: input.qty }),
      ...(input.koefisien !== undefined && { koefisien: input.koefisien }),
      ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  await auditWriter({
    appId: "bq",
    action: input.hargaSnapshot !== undefined
      && existing.source_price_snapshot !== null
      && compareDecimals(
        toDecimalString(existing.source_price_snapshot.toString()),
        toDecimalString(input.hargaSnapshot),
      ) !== 0
      ? "bq.line-item.price-overridden"
      : "bq.line-item.updated",
    entityType: "BqLineItem",
    entityId: lineItem.id,
    actor: input.actor,
  });
  return lineItem;
}


async function revertLineItemPrice(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForLineItem(input.id);
  const lineItem = await db.bqLineItem.findUnique({ where: { id: input.id } });
  if (!lineItem) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Cost Component not found");
  const snap = lineItem.source_price_snapshot;
  if (snap == null) {
    throw new AppError("INVARIANT", "bq.line-item.no-snapshot", "This Cost Component has no imported source price to restore");
  }
  if (compareDecimals(toDecimalString(lineItem.harga_snapshot.toString()), toDecimalString(snap.toString())) === 0) return lineItem;
  const updated = await db.bqLineItem.update({
    where: { id: input.id },
    data: { harga_snapshot: snap },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.line-item.price-reverted",
    entityType: "BqLineItem",
    entityId: updated.id,
    actor: input.actor,
  });
  return updated;
}
async function deleteLineItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  const itemId = await requireEditableProjectForLineItem(input.id);
  await db.bqLineItem.delete({ where: { id: input.id } });
  await zeroMarkupIfChildless(itemId);
  await auditWriter({
    appId: "bq",
    action: "bq.line-item.deleted",
    entityType: "BqLineItem",
    entityId: input.id,
    actor: input.actor,
  });
}


  return {
    addSection,
    addSubsection,
    updateSection,
    updateSubsection,
    deleteSubsection,
    addItem,
    reorderItems,
    reorderSections,
    reorderSubsections,
    updateItem,
    deleteItem,
    addSubObject,
    updateSubObject,
    deleteSubObject,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    revertLineItemPrice,
  };
}
