import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { compareDecimals, toDecimalString } from "@platform/utilities/decimal";

import {
  BQ_PERMISSIONS,
  decimalFieldUnchanged,
  fieldUnchanged,
  requireKategori,
  requirePositiveCoefficient,
  type BqKategori,
  type BqServiceContext,
} from "./context";

export function createProjectTreeService(ctx: BqServiceContext) {
  const {
    db,
    auditWriter,
    requireEditableProject,
    requireEditableProjectForSection,
    requireEditableProjectForSubsection,
    requireEditableProjectForItem,
    requireEditableProjectForLineItem,
    requireEditableProjectForSubObject,
  } = ctx;

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
  const sortOrder = input.sortOrder ?? (await nextSortOrder(() => db.bqSection.aggregate({
    where: { project_id: input.projectId },
    _max: { sort_order: true },
  })));
  const section = await db.bqSection.create({
    data: {
      project_id: input.projectId,
      name: input.name,
      sort_order: sortOrder,
    },
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
  const sortOrder = input.sortOrder ?? (await nextSortOrder(() => db.bqSubsection.aggregate({
    where: { section_id: input.sectionId },
    _max: { sort_order: true },
  })));
  const subsection = await db.bqSubsection.create({
    data: {
      section_id: input.sectionId,
      name: input.name,
      sort_order: sortOrder,
    },
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
  sortOrder?: number;
  notes?: string | null;
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

  const sortOrder = input.sortOrder ?? (await nextSortOrder(() => db.bqItem.aggregate({
    where: input.sectionId ? { section_id: input.sectionId } : { subsection_id: input.subsectionId },
    _max: { sort_order: true },
  })));

  const item = await db.bqItem.create({
    data: {
      section_id: input.sectionId ?? null,
      subsection_id: input.subsectionId ?? null,
      name: input.name,
      qty: input.qty,
      unit: input.unit,
      harga_snapshot: input.hargaSnapshot ?? null,
      koefisien: requirePositiveCoefficient(input.koefisien ?? "1"),
      markup_l1_pct: input.markupL1Pct ?? "0",
      sort_order: sortOrder,
      notes: input.notes ?? null,
    },
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
  sortOrder?: number;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  if (input.koefisien !== undefined) requirePositiveCoefficient(input.koefisien);
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
    && fieldUnchanged(input.sortOrder, existing.sort_order)
    && fieldUnchanged(input.notes, existing.notes)
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
      ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
      ...(input.notes !== undefined && { notes: input.notes }),
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
  await requireEditableProjectForItem(input.itemId);

  const sortOrder = input.sortOrder ?? (await nextSortOrder(() => db.bqSubObject.aggregate({
    where: { item_id: input.itemId },
    _max: { sort_order: true },
  })));

  const subObject = await db.bqSubObject.create({
    data: {
      item_id: input.itemId,
      name: input.name,
      qty_per_l1: input.qtyPerL1,
      markup_l2_pct: input.markupL2Pct ?? "0",
      sort_order: sortOrder,
      notes: input.notes ?? null,
    },
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
  await requireEditableProjectForSubObject(input.id);
  await db.bqSubObject.delete({ where: { id: input.id } });
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

  if (!input.subObjectId && !input.itemId) {
    throw new AppError("VALIDATION", "bq.line-item.no-parent", "Cost Component must belong to a Component Group or Work Item");
  }
  if (input.subObjectId && input.itemId) {
    throw new AppError("VALIDATION", "bq.line-item.dual-parent", "Cost Component cannot belong to both a Component Group and Work Item");
  }

  if (input.subObjectId) await requireEditableProjectForSubObject(input.subObjectId);
  else await requireEditableProjectForItem(input.itemId!);

  const sortOrder = input.sortOrder ?? (await nextSortOrder(() => db.bqLineItem.aggregate({
    where: input.subObjectId ? { sub_object_id: input.subObjectId } : { item_id: input.itemId },
    _max: { sort_order: true },
  })));

  const lineItem = await db.bqLineItem.create({
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
      currency_snapshot: input.currencySnapshot ?? "IDR",
      kategori: requireKategori(input.kategori),
      qty: input.qty,
      koefisien: requirePositiveCoefficient(input.koefisien ?? "1"),
      sort_order: sortOrder,
      notes: input.notes ?? null,
    },
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
      ...(input.currencySnapshot !== undefined && { currency_snapshot: input.currencySnapshot }),
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
  await requireEditableProjectForLineItem(input.id);
  await db.bqLineItem.delete({ where: { id: input.id } });
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
    addItem,
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
