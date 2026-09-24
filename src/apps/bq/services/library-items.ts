import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";

import {
  BQ_PERMISSIONS,
  decimalFieldUnchanged,
  fieldUnchanged,
  requireKategori,
  requirePositiveCoefficient,
  type BqServiceContext,
} from "./context";

export function createLibraryItemService(ctx: BqServiceContext) {
  const { db, auditWriter } = ctx;

async function createLibMaterial(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  name: string;
  purchaseUnit: string;
  baseUnit?: string;
  harga: string;
  currency: string;
  defaultKoefisien?: string;
  notes?: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const item = await db.bqLibMaterial.create({
    data: {
      name: input.name,
      purchase_unit: input.purchaseUnit,
      base_unit: input.baseUnit ?? null,
      harga: input.harga,
      currency: input.currency,
      default_koefisien: requirePositiveCoefficient(input.defaultKoefisien ?? "1"),
      kategori: "MATERIAL",
      notes: input.notes ?? null,
      created_by: input.actor.userId ?? "system",
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-material.created",
    entityType: "BqLibMaterial",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function updateLibMaterial(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name?: string;
  purchaseUnit?: string;
  baseUnit?: string | null;
  harga?: string;
  currency?: string;
  defaultKoefisien?: string;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  if (input.defaultKoefisien !== undefined) requirePositiveCoefficient(input.defaultKoefisien);
  const existing = await db.bqLibMaterial.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.lib-material.not-found", "Library material not found");
  if (
    fieldUnchanged(input.name, existing.name)
    && fieldUnchanged(input.purchaseUnit, existing.purchase_unit)
    && fieldUnchanged(input.baseUnit, existing.base_unit)
    && decimalFieldUnchanged(input.harga, existing.harga)
    && fieldUnchanged(input.currency, existing.currency)
    && decimalFieldUnchanged(input.defaultKoefisien, existing.default_koefisien)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;
  const item = await db.bqLibMaterial.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
      ...(input.baseUnit !== undefined && { base_unit: input.baseUnit }),
      ...(input.harga !== undefined && { harga: input.harga }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-material.updated",
    entityType: "BqLibMaterial",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function deleteLibMaterial(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  // The recommendation's FK is ON DELETE SET NULL, but its check constraint
  // requires exactly one source column set — nulling this one without
  // removing the row would fail that constraint mid-delete.
  await db.bqTemplateRecommendation.deleteMany({ where: { lib_material_id: input.id } });
  await db.bqLibMaterial.delete({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-material.deleted",
    entityType: "BqLibMaterial",
    entityId: input.id,
    actor: input.actor,
  });
}

async function createLibLabor(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  name: string;
  purchaseUnit: string;
  baseUnit?: string;
  harga: string;
  currency: string;
  defaultKoefisien?: string;
  notes?: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const item = await db.bqLibLabor.create({
    data: {
      name: input.name,
      purchase_unit: input.purchaseUnit,
      base_unit: input.baseUnit ?? null,
      harga: input.harga,
      currency: input.currency,
      default_koefisien: requirePositiveCoefficient(input.defaultKoefisien ?? "1"),
      kategori: "UPAH",
      notes: input.notes ?? null,
      created_by: input.actor.userId ?? "system",
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-labor.created",
    entityType: "BqLibLabor",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function updateLibLabor(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name?: string;
  purchaseUnit?: string;
  baseUnit?: string | null;
  harga?: string;
  currency?: string;
  defaultKoefisien?: string;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  if (input.defaultKoefisien !== undefined) requirePositiveCoefficient(input.defaultKoefisien);
  const existing = await db.bqLibLabor.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.lib-labor.not-found", "Library labor not found");
  if (
    fieldUnchanged(input.name, existing.name)
    && fieldUnchanged(input.purchaseUnit, existing.purchase_unit)
    && fieldUnchanged(input.baseUnit, existing.base_unit)
    && decimalFieldUnchanged(input.harga, existing.harga)
    && fieldUnchanged(input.currency, existing.currency)
    && decimalFieldUnchanged(input.defaultKoefisien, existing.default_koefisien)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;
  const item = await db.bqLibLabor.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
      ...(input.baseUnit !== undefined && { base_unit: input.baseUnit }),
      ...(input.harga !== undefined && { harga: input.harga }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-labor.updated",
    entityType: "BqLibLabor",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function deleteLibLabor(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  await db.bqTemplateRecommendation.deleteMany({ where: { lib_labor_id: input.id } });
  await db.bqLibLabor.delete({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-labor.deleted",
    entityType: "BqLibLabor",
    entityId: input.id,
    actor: input.actor,
  });
}

async function createLibMaterialLabor(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  name: string;
  purchaseUnit: string;
  baseUnit?: string;
  harga: string;
  currency: string;
  defaultKoefisien?: string;
  notes?: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const item = await db.bqLibMaterialLabor.create({
    data: {
      name: input.name,
      purchase_unit: input.purchaseUnit,
      base_unit: input.baseUnit ?? null,
      harga: input.harga,
      currency: input.currency,
      default_koefisien: requirePositiveCoefficient(input.defaultKoefisien ?? "1"),
      kategori: "MATERIAL_UPAH",
      notes: input.notes ?? null,
      created_by: input.actor.userId ?? "system",
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-material-labor.created",
    entityType: "BqLibMaterialLabor",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function updateLibMaterialLabor(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name?: string;
  purchaseUnit?: string;
  baseUnit?: string | null;
  harga?: string;
  currency?: string;
  defaultKoefisien?: string;
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  if (input.defaultKoefisien !== undefined) requirePositiveCoefficient(input.defaultKoefisien);
  const existing = await db.bqLibMaterialLabor.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.lib-material-labor.not-found", "Library material+labor not found");
  if (
    fieldUnchanged(input.name, existing.name)
    && fieldUnchanged(input.purchaseUnit, existing.purchase_unit)
    && fieldUnchanged(input.baseUnit, existing.base_unit)
    && decimalFieldUnchanged(input.harga, existing.harga)
    && fieldUnchanged(input.currency, existing.currency)
    && decimalFieldUnchanged(input.defaultKoefisien, existing.default_koefisien)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;
  const item = await db.bqLibMaterialLabor.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
      ...(input.baseUnit !== undefined && { base_unit: input.baseUnit }),
      ...(input.harga !== undefined && { harga: input.harga }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-material-labor.updated",
    entityType: "BqLibMaterialLabor",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function deleteLibMaterialLabor(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  await db.bqTemplateRecommendation.deleteMany({ where: { lib_material_labor_id: input.id } });
  await db.bqLibMaterialLabor.delete({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-material-labor.deleted",
    entityType: "BqLibMaterialLabor",
    entityId: input.id,
    actor: input.actor,
  });
}

async function createLibCustomItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  name: string;
  purchaseUnit: string;
  harga: string;
  currency: string;
  defaultKoefisien?: string;
  kategori: "BIAYA_UMUM" | "TRANSPORTASI_AKOMODASI" | "ALAT";
  notes?: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  const item = await db.bqLibCustomItem.create({
    data: {
      name: input.name,
      purchase_unit: input.purchaseUnit,
      harga: input.harga,
      currency: input.currency,
      default_koefisien: requirePositiveCoefficient(input.defaultKoefisien ?? "1"),
      kategori: requireKategori(input.kategori),
      notes: input.notes ?? null,
      created_by: input.actor.userId ?? "system",
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-custom-item.created",
    entityType: "BqLibCustomItem",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function updateLibCustomItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
  name?: string;
  purchaseUnit?: string;
  harga?: string;
  currency?: string;
  defaultKoefisien?: string;
  kategori?: "BIAYA_UMUM" | "TRANSPORTASI_AKOMODASI" | "ALAT";
  notes?: string | null;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  if (input.defaultKoefisien !== undefined) requirePositiveCoefficient(input.defaultKoefisien);
  const existing = await db.bqLibCustomItem.findUnique({ where: { id: input.id } });
  if (!existing) throw new AppError("NOT_FOUND", "bq.lib-custom-item.not-found", "Custom Library item not found");
  if (
    fieldUnchanged(input.name, existing.name)
    && fieldUnchanged(input.purchaseUnit, existing.purchase_unit)
    && decimalFieldUnchanged(input.harga, existing.harga)
    && fieldUnchanged(input.currency, existing.currency)
    && decimalFieldUnchanged(input.defaultKoefisien, existing.default_koefisien)
    && fieldUnchanged(input.kategori, existing.kategori)
    && fieldUnchanged(input.notes, existing.notes)
  ) return existing;
  const item = await db.bqLibCustomItem.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.purchaseUnit !== undefined && { purchase_unit: input.purchaseUnit }),
      ...(input.harga !== undefined && { harga: input.harga }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.defaultKoefisien !== undefined && { default_koefisien: input.defaultKoefisien }),
      ...(input.kategori !== undefined && { kategori: input.kategori }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-custom-item.updated",
    entityType: "BqLibCustomItem",
    entityId: item.id,
    actor: input.actor,
  });
  return item;
}

async function deleteLibCustomItem(input: {
  grants: PermissionGrants;
  actor: { kind: string; userId?: string; label: string };
  id: string;
}) {
  requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
  await db.bqTemplateRecommendation.deleteMany({ where: { lib_custom_item_id: input.id } });
  await db.bqLibCustomItem.delete({ where: { id: input.id } });
  await auditWriter({
    appId: "bq",
    action: "bq.lib-custom-item.deleted",
    entityType: "BqLibCustomItem",
    entityId: input.id,
    actor: input.actor,
  });
}


  return {
    createLibMaterial,
    updateLibMaterial,
    deleteLibMaterial,
    createLibLabor,
    updateLibLabor,
    deleteLibLabor,
    createLibMaterialLabor,
    updateLibMaterialLabor,
    deleteLibMaterialLabor,
    createLibCustomItem,
    updateLibCustomItem,
    deleteLibCustomItem,
  };
}
