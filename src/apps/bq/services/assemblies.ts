import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { toDecimalString } from "@platform/utilities/decimal";

import { BQ_PERMISSIONS, requireKategori, requirePositiveCoefficient, type BqServiceContext } from "./context";

export function createAssemblyService(ctx: BqServiceContext) {
  const { db, auditWriter, requireEditableProjectForItem } = ctx;

async function createAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; name: string; description?: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const assembly = await db.bqAssemblyTemplate.create({ data: { name: input.name, description: input.description ?? null, created_by: input.actor.userId ?? "system" } });
  await auditWriter({ appId: "bq", action: "bq.assembly.created", entityType: "BqAssemblyTemplate", entityId: assembly.id, actor: input.actor });
  return assembly;
}

async function addAssemblyCustomLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; assemblyId: string; title: string; purchaseUnit?: string; harga?: string; currency?: string; kategori?: string; qty?: string; koefisien?: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const koefisien = requirePositiveCoefficient(input.koefisien ?? "1");
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  const existingCount = await db.bqAssemblyLine.count({ where: { assembly_template_id: input.assemblyId } });
  const line = await db.bqAssemblyLine.create({ data: { assembly_template_id: assembly.id, source_type: "CUSTOM", title_snapshot: input.title, purchase_unit_snapshot: input.purchaseUnit ?? "ls", harga_snapshot: input.harga ?? "0", currency_snapshot: input.currency ?? "IDR", kategori: requireKategori(input.kategori ?? "MATERIAL"), qty: input.qty ?? "1", koefisien, sort_order: existingCount } });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.created", entityType: "BqAssemblyLine", entityId: line.id, actor: input.actor });
  return line;
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
  if (input.koefisien !== undefined) requirePositiveCoefficient(input.koefisien);
  const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
  if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
  if ((input.title === undefined || input.title === line.title_snapshot) && (input.purchaseUnit === undefined || input.purchaseUnit === line.purchase_unit_snapshot) && (input.harga === undefined || toDecimalString(input.harga) === line.harga_snapshot.toString()) && (input.currency === undefined || input.currency === line.currency_snapshot) && (input.kategori === undefined || input.kategori === line.kategori) && (input.qty === undefined || toDecimalString(input.qty) === line.qty.toString()) && (input.koefisien === undefined || toDecimalString(input.koefisien) === line.koefisien.toString()) && (input.notes === undefined || (input.notes || null) === line.notes)) return line;
  const updated = await db.bqAssemblyLine.update({ where: { id: input.lineId }, data: { ...(input.title !== undefined && { title_snapshot: input.title }), ...(input.purchaseUnit !== undefined && { purchase_unit_snapshot: input.purchaseUnit }), ...(input.harga !== undefined && { harga_snapshot: input.harga }), ...(input.currency !== undefined && { currency_snapshot: input.currency }), ...(input.kategori !== undefined && { kategori: requireKategori(input.kategori) }), ...(input.qty !== undefined && { qty: input.qty }), ...(input.koefisien !== undefined && { koefisien: input.koefisien }), ...(input.notes !== undefined && { notes: input.notes || null }) } });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.updated", entityType: "BqAssemblyLine", entityId: input.lineId, actor: input.actor });
  return updated;
}

async function deleteAssemblyLine(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; lineId: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
  if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
  await db.bqAssemblyLine.delete({ where: { id: input.lineId } });
  await auditWriter({ appId: "bq", action: "bq.assembly-line.deleted", entityType: "BqAssemblyLine", entityId: line.assembly_template_id, actor: input.actor });
}

async function applyAssemblyTemplate(input: { grants: PermissionGrants; actor: { kind: string; userId?: string; label: string }; itemId: string; assemblyId: string; qtyPerL1?: string }) {
  requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
  await requireEditableProjectForItem(input.itemId);
  const assembly = await db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId }, include: { lines: { orderBy: { sort_order: "asc" } } } });
  if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");
  if (!assembly.lines.length) throw new AppError("VALIDATION", "bq.assembly.empty", "An assembly must contain at least one Cost Component");
  const existingSubObjectCount = await db.bqSubObject.count({ where: { item_id: input.itemId } });
  const subObject = await db.bqSubObject.create({ data: { item_id: input.itemId, name: assembly.name, qty_per_l1: input.qtyPerL1 ?? "1", sort_order: existingSubObjectCount } });
  await db.bqLineItem.createMany({ data: assembly.lines.map((line) => ({ sub_object_id: subObject.id, source_type: line.source_type, source_ref_id: line.source_ref_id, source_imported_at: new Date(), title_snapshot: line.title_snapshot, purchase_unit_snapshot: line.purchase_unit_snapshot, base_unit_snapshot: line.base_unit_snapshot, purchase_to_base_factor_snapshot: line.purchase_to_base_factor_snapshot, harga_snapshot: line.harga_snapshot, currency_snapshot: line.currency_snapshot, kategori: line.kategori, qty: line.qty, koefisien: line.koefisien, sort_order: line.sort_order, notes: line.notes })) });
  await auditWriter({ appId: "bq", action: "bq.assembly.applied", entityType: "BqSubObject", entityId: subObject.id, actor: input.actor, changes: { assemblyId: assembly.id } });
  return subObject;
}


  return {
    createAssemblyTemplate,
    updateAssemblyTemplate,
    deleteAssemblyTemplate,
    addAssemblyCustomLine,
    updateAssemblyLine,
    deleteAssemblyLine,
    applyAssemblyTemplate,
  };
}
