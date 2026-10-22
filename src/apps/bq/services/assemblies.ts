import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { toDecimalString } from "@platform/utilities/decimal";

import { BQ_PERMISSIONS, requireKategori, requirePositiveCoefficient, type BqServiceContext } from "./context";
import type { CostSourceKind, CostSourceService } from "./cost-sources";
import { requireRupiah } from "../lib/currency";

export function createAssemblyService(ctx: BqServiceContext, sources: CostSourceService) {
  const { db, runTransaction, runAutomaticSortTransaction, auditWriter, requireEditableProjectForItem } = ctx;

async function createAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; name: string; description?: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const assembly = await db.bqAssemblyTemplate.create({ data: { name: input.name, description: input.description ?? null, created_by: input.actor.userId ?? "system" } });
  await auditWriter({ appId: "bq", action: "bq.assembly.created", entityType: "BqAssemblyTemplate", entityId: assembly.id, actor: input.actor });
  return assembly;
}

async function addAssemblyCustomLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string; title: string; purchaseUnit?: string; harga?: string; currency?: string; kategori?: string; qty?: string; koefisien?: string; notes?: string; saveToLibrary?: boolean }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const currency = requireRupiah(input.currency ?? "IDR");
  const koefisien = requirePositiveCoefficient(input.koefisien ?? "1");
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  // count() collides with a surviving sibling once any line has been deleted
  // (e.g. lines 0,1,2 -> delete 1 -> count()=2 duplicates the untouched line
  // at sort_order 2); MAX+1 never reuses a still-occupied slot. Read and
  // reserve it atomically — two near-simultaneous adds could otherwise both
  // read the same MAX and collide.
  const line = await runAutomaticSortTransaction(async (tx) => {
    const maxSortOrder = await tx.bqAssemblyLine.aggregate({ where: { assembly_template_id: input.assemblyId }, _max: { sort_order: true } });
    const nextSortOrder = (maxSortOrder._max.sort_order ?? -1) + 1;
    return tx.bqAssemblyLine.create({ data: { assembly_template_id: assembly.id, source_type: "CUSTOM", title_snapshot: input.title, purchase_unit_snapshot: input.purchaseUnit ?? "ls", harga_snapshot: input.harga ?? "0", currency_snapshot: currency, kategori: requireKategori(input.kategori ?? "MATERIAL"), qty: input.qty ?? "1", koefisien, sort_order: nextSortOrder, notes: input.notes?.trim() || null } });
  });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.created", entityType: "BqAssemblyLine", entityId: line.id, actor: input.actor });
  // "Save to BQ Library" (owner 2026-10-22): an explicit choice, in the same transaction as the line.
  if (input.saveToLibrary) return sources.saveAssemblyLineToLibrary({ grants: input.grants, actor: input.actor, lineId: line.id });
  return line;
}

/** An Assembly line picked from a Master Data price or a BQ Library item: its facts are snapshotted from the source. */
async function addAssemblySourcedLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string; sourceType: "MASTERDATA" | "BQ_LIBRARY"; sourceRefId: string; sourceKind?: CostSourceKind; qty?: string; koefisien?: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  const snapshot = await sources.resolveSource(input.grants, { sourceType: input.sourceType, sourceRefId: input.sourceRefId, sourceKind: input.sourceKind });
  const koefisien = requirePositiveCoefficient(input.koefisien ?? snapshot.koefisien);
  const line = await runAutomaticSortTransaction(async (tx) => {
    const maxSortOrder = await tx.bqAssemblyLine.aggregate({ where: { assembly_template_id: input.assemblyId }, _max: { sort_order: true } });
    return tx.bqAssemblyLine.create({ data: { assembly_template_id: assembly.id, source_type: snapshot.sourceType, source_ref_id: snapshot.sourceRefId, title_snapshot: snapshot.titleSnapshot, purchase_unit_snapshot: snapshot.purchaseUnitSnapshot, base_unit_snapshot: snapshot.baseUnitSnapshot, harga_snapshot: snapshot.hargaSnapshot, currency_snapshot: requireRupiah(snapshot.currencySnapshot), kategori: requireKategori(snapshot.kategori), qty: input.qty ?? "1", koefisien, sort_order: (maxSortOrder._max.sort_order ?? -1) + 1, notes: snapshot.notes } });
  });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.created", entityType: "BqAssemblyLine", entityId: line.id, actor: input.actor, changes: { sourceType: snapshot.sourceType } });
  return line;
}

/**
 * Saves a Work Item's own Cost Components as a new assembly (a copy; the Work Item is untouched). Kept deliberately
 * plain: a Work Item that uses Component Groups is refused, because an assembly line carries no group quantity or
 * markup, so flattening would change what the assembly prices.
 */
async function saveItemAsAssembly(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; itemId: string; name: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const name = input.name.trim();
  if (!name) throw new AppError("VALIDATION", "bq.assembly.name-required", "Give the assembly a name");
  const item = await db.bqItem.findUnique({
    where: { id: input.itemId },
    include: { sub_objects: { select: { id: true } }, line_items: { orderBy: { sort_order: "asc" } } },
  });
  if (!item) throw new AppError("NOT_FOUND", "bq.item.not-found", "Work Item not found");
  if (item.sub_objects.length > 0) {
    throw new AppError("CONFLICT", "bq.assembly.item-has-groups", "This Work Item uses Component Groups. An assembly can only be saved from a Work Item whose Cost Components sit directly under it.");
  }
  if (item.line_items.length === 0) {
    throw new AppError("VALIDATION", "bq.assembly.empty", "An assembly must contain at least one Cost Component");
  }
  const assembly = await runTransaction(async (tx) => {
    const created = await tx.bqAssemblyTemplate.create({ data: { name, created_by: input.actor.userId ?? "system" } });
    await tx.bqAssemblyLine.createMany({
      data: item.line_items.map((line, index) => ({
        assembly_template_id: created.id,
        source_type: line.source_type,
        source_ref_id: line.source_ref_id,
        title_snapshot: line.title_snapshot,
        purchase_unit_snapshot: line.purchase_unit_snapshot,
        base_unit_snapshot: line.base_unit_snapshot,
        purchase_to_base_factor_snapshot: line.purchase_to_base_factor_snapshot,
        harga_snapshot: line.harga_snapshot,
        currency_snapshot: line.currency_snapshot,
        kategori: line.kategori,
        qty: line.qty,
        koefisien: line.koefisien,
        sort_order: index,
        notes: line.notes,
      })),
    });
    return created;
  });
  await auditWriter({ appId: "bq", action: "bq.assembly.created", entityType: "BqAssemblyTemplate", entityId: assembly.id, actor: input.actor, changes: { fromItemId: item.id, lines: item.line_items.length } });
  return assembly;
}

async function updateAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string; name?: string; description?: string | null }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  const name = input.name?.trim();
  const description = input.description?.trim() ?? null;
  if ((!name || name === assembly.name) && (input.description === undefined || description === assembly.description)) return assembly;
  const updated = await db.bqAssemblyTemplate.update({ where: { id: input.assemblyId }, data: { ...(name && { name }), ...(input.description !== undefined && { description }) } });
  await auditWriter({ appId: "bq", action: "bq.assembly.updated", entityType: "BqAssemblyTemplate", entityId: input.assemblyId, actor: input.actor, changes: { name, description } });
  return updated;
}

async function deleteAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  await db.bqAssemblyTemplate.delete({ where: { id: input.assemblyId } });
  await auditWriter({ appId: "bq", action: "bq.assembly.deleted", entityType: "BqAssemblyTemplate", entityId: input.assemblyId, actor: input.actor });
}

async function updateAssemblyLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; lineId: string; title?: string; purchaseUnit?: string; harga?: string; currency?: string; kategori?: string; qty?: string; koefisien?: string; notes?: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const currency = input.currency === undefined ? undefined : requireRupiah(input.currency);
  if (input.koefisien !== undefined) requirePositiveCoefficient(input.koefisien);
  const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
  if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
  if ((input.title === undefined || input.title === line.title_snapshot) && (input.purchaseUnit === undefined || input.purchaseUnit === line.purchase_unit_snapshot) && (input.harga === undefined || toDecimalString(input.harga) === line.harga_snapshot.toString()) && (currency === undefined || currency === line.currency_snapshot) && (input.kategori === undefined || input.kategori === line.kategori) && (input.qty === undefined || toDecimalString(input.qty) === line.qty.toString()) && (input.koefisien === undefined || toDecimalString(input.koefisien) === line.koefisien.toString()) && (input.notes === undefined || (input.notes || null) === line.notes)) return line;
  const updated = await db.bqAssemblyLine.update({ where: { id: input.lineId }, data: { ...(input.title !== undefined && { title_snapshot: input.title }), ...(input.purchaseUnit !== undefined && { purchase_unit_snapshot: input.purchaseUnit }), ...(input.harga !== undefined && { harga_snapshot: input.harga }), ...(currency !== undefined && { currency_snapshot: currency }), ...(input.kategori !== undefined && { kategori: requireKategori(input.kategori) }), ...(input.qty !== undefined && { qty: input.qty }), ...(input.koefisien !== undefined && { koefisien: input.koefisien }), ...(input.notes !== undefined && { notes: input.notes || null }) } });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.updated", entityType: "BqAssemblyLine", entityId: input.lineId, actor: input.actor });
  return updated;
}

async function deleteAssemblyLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; lineId: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
  if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
  await db.bqAssemblyLine.delete({ where: { id: input.lineId } });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.deleted", entityType: "BqAssemblyLine", entityId: line.id, actor: input.actor });
}

/**
 * `placement: "direct"` snapshots the assembly's lines straight under the Work Item (no wrapping Component Group): used
 * when a new Work Item is made from an assembly, where a group named like the item would only repeat it. The default
 * "group" keeps the assembly as one Component Group with its own quantity per Work Item.
 */
async function applyAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; itemId: string; assemblyId: string; qtyPerL1?: string; placement?: "group" | "direct" }) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForItem(input.itemId);
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId }, include: { lines: { orderBy: { sort_order: "asc" } } } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  if (!assembly.lines.length) throw new AppError("VALIDATION", "bq.assembly.empty", "An assembly must contain at least one Cost Component");
  // Priced at use (owner 2026-10-22): sourced lines take today's source price; the Assembly itself is never rewritten.
  const { prices, refresh: priceRefresh } = await sources.currentPrices(input.grants, assembly.lines);
  const hargaOf = (line: (typeof assembly.lines)[number]) => prices.get(line.id) ?? line.harga_snapshot;
  if (input.placement === "direct") {
    const lineData = (line: (typeof assembly.lines)[number], sortOrder: number) => ({ item_id: input.itemId, source_type: line.source_type, source_ref_id: line.source_ref_id, source_imported_at: new Date(), title_snapshot: line.title_snapshot, purchase_unit_snapshot: line.purchase_unit_snapshot, base_unit_snapshot: line.base_unit_snapshot, purchase_to_base_factor_snapshot: line.purchase_to_base_factor_snapshot, source_price_snapshot: line.source_type === "CUSTOM" ? null : hargaOf(line), harga_snapshot: hargaOf(line), currency_snapshot: line.currency_snapshot, kategori: line.kategori, qty: line.qty, koefisien: line.koefisien, sort_order: sortOrder, notes: line.notes });
    const created = await runTransaction(async (tx) => {
      const last = await tx.bqLineItem.aggregate({ where: { item_id: input.itemId }, _max: { sort_order: true } });
      const first = (last._max.sort_order ?? -1) + 1;
      await tx.bqLineItem.createMany({ data: assembly.lines.map((line, index) => lineData(line, first + index)) });
      return assembly.lines.length;
    });
    await auditWriter({ appId: "bq", action: "bq.assembly.applied", entityType: "BqItem", entityId: input.itemId, actor: input.actor, changes: { assemblyId: assembly.id, placement: "direct", lines: created, pricesRefreshed: priceRefresh.refreshed, pricesKept: priceRefresh.kept.length } });
    return { id: input.itemId, priceRefresh };
  }
  // Read+reserve the sub-object's sort_order and copy its lines atomically: two
  // near-simultaneous applies could otherwise both read the same MAX and collide,
  // and a createMany failure after the bare create would strand an empty group.
  const subObject = await runTransaction(async (tx) => {
    const maxSubObjectSortOrder = await tx.bqSubObject.aggregate({ where: { item_id: input.itemId }, _max: { sort_order: true } });
    const created = await tx.bqSubObject.create({ data: { item_id: input.itemId, name: assembly.name, qty_per_l1: input.qtyPerL1 ?? "1", sort_order: (maxSubObjectSortOrder._max.sort_order ?? -1) + 1 } });
    await tx.bqLineItem.createMany({ data: assembly.lines.map((line) => ({ sub_object_id: created.id, source_type: line.source_type, source_ref_id: line.source_ref_id, source_imported_at: new Date(), title_snapshot: line.title_snapshot, purchase_unit_snapshot: line.purchase_unit_snapshot, base_unit_snapshot: line.base_unit_snapshot, purchase_to_base_factor_snapshot: line.purchase_to_base_factor_snapshot, source_price_snapshot: line.source_type === "CUSTOM" ? null : hargaOf(line), harga_snapshot: hargaOf(line), currency_snapshot: line.currency_snapshot, kategori: line.kategori, qty: line.qty, koefisien: line.koefisien, sort_order: line.sort_order, notes: line.notes })) });
    return created;
  });
  await auditWriter({ appId: "bq", action: "bq.assembly.applied", entityType: "BqSubObject", entityId: subObject.id, actor: input.actor, changes: { assemblyId: assembly.id, pricesRefreshed: priceRefresh.refreshed, pricesKept: priceRefresh.kept.length } });
  return { ...subObject, priceRefresh };
}


  return {
    createAssemblyTemplate,
    saveItemAsAssembly,
    updateAssemblyTemplate,
    deleteAssemblyTemplate,
    addAssemblyCustomLine,
    addAssemblySourcedLine,
    updateAssemblyLine,
    deleteAssemblyLine,
    applyAssemblyTemplate,
  };
}
