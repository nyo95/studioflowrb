import { randomUUID } from "node:crypto";

import { type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { BULK_PRICE_ROW_LIMIT, type createPricingService } from "./pricing.service";
import { type createSkuService } from "./sku.service";
import { MASTERDATA_PERMISSIONS, actorIsUsable, resolveSkuIdentity, type MasterDataServicePorts, writeAudit } from "./shared";

type ExistingSkuRow = {
  kind: "existing";
  skuId: string;
  vendorId: string;
  amount: string;
  notes?: string | null;
};

type NewSkuRow = {
  kind: "new";
  name?: string | null;
  code?: string | null;
  brandId?: string | null;
  baseUnitId: string;
  purchaseUnitId?: string | null;
  dimensionLength?: string | null;
  dimensionWidth?: string | null;
  dimensionThickness?: string | null;
  dimensionUnitId?: string | null;
  categoryId: string;
  vendorId: string;
  amount: string;
  notes?: string | null;
};

export type MaterialSkuPriceBulkRow = ExistingSkuRow | NewSkuRow;
export type MaterialSkuPriceBulkRejection = { index: number; code: string; message: string; details?: Record<string, unknown> };

type SkuService = Pick<ReturnType<typeof createSkuService>, "createSku">;
type PricingService = Pick<ReturnType<typeof createPricingService>, "createMaterialPriceRows">;

type NewSkuDefinition = {
  identity: ReturnType<typeof resolveSkuIdentity>;
  name?: string | null;
  code?: string | null;
  brandId: string | null;
  baseUnitId: string;
  purchaseUnitId: string | null;
  dimensionLength: string | null;
  dimensionWidth: string | null;
  dimensionThickness: string | null;
  dimensionUnitId: string | null;
  categoryId: string;
};

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function definition(row: NewSkuRow): NewSkuDefinition {
  return {
    identity: resolveSkuIdentity(row.name, row.code),
    name: row.name,
    code: row.code,
    brandId: optionalText(row.brandId),
    baseUnitId: row.baseUnitId,
    purchaseUnitId: optionalText(row.purchaseUnitId),
    dimensionLength: optionalText(row.dimensionLength),
    dimensionWidth: optionalText(row.dimensionWidth),
    dimensionThickness: optionalText(row.dimensionThickness),
    dimensionUnitId: optionalText(row.dimensionUnitId),
    categoryId: row.categoryId,
  };
}

// A new SKU's identity is (brand, slug), matching the live unique index, so the same
// product name under two brands is two SKUs, not one disagreeing group.
function groupKey(value: NewSkuDefinition): string {
  return JSON.stringify([value.brandId, value.identity.slug]);
}

function definitionKey(value: NewSkuDefinition): string {
  return JSON.stringify({
    identity: value.identity.slug,
    code: value.identity.code,
    brandId: value.brandId,
    baseUnitId: value.baseUnitId,
    purchaseUnitId: value.purchaseUnitId,
    dimensionLength: value.dimensionLength,
    dimensionWidth: value.dimensionWidth,
    dimensionThickness: value.dimensionThickness,
    dimensionUnitId: value.dimensionUnitId,
    categoryId: value.categoryId,
  });
}

function rejection(index: number, error: unknown): MaterialSkuPriceBulkRejection {
  if (error instanceof AppError) return { index, code: error.code, message: error.safeMessage, ...(error.details ? { details: error.details } : {}) };
  return { index, code: "PRICE_SAVE_FAILED", message: "This row could not be saved." };
}

export function createMaterialSkuPriceBulkService(
  db: PrismaClient,
  ports: MasterDataServicePorts,
  skuService: SkuService,
  pricingService: PricingService,
) {
  return {
    async createMaterialSkuPricesBulk(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      currency: string;
      rows: MaterialSkuPriceBulkRow[];
      onInvalid?: "save-valid";
    }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      if (input.rows.some((row) => row.kind === "new")) requirePermission(input.grants, MASTERDATA_PERMISSIONS.skuManage);
      actorIsUsable(input.actor);
      if (input.rows.length === 0) throw new AppError("VALIDATION", "BULK_EMPTY", "Add at least one row.");
      if (input.rows.length > BULK_PRICE_ROW_LIMIT) throw new AppError("VALIDATION", "BULK_TOO_MANY_ROWS", `A batch holds at most ${BULK_PRICE_ROW_LIMIT} rows.`);

      const batchId = randomUUID();
      const ids: string[] = [];
      const createdSkuIds: string[] = [];
      const rejected: MaterialSkuPriceBulkRejection[] = [];
      const groups = new Map<string, { firstIndex: number; definition: NewSkuDefinition; key: string; skuId?: string; existingSkuId?: string }>();

      for (const [index, row] of input.rows.entries()) {
        if (row.kind !== "new") continue;
        try {
          const rowDefinition = definition(row);
          const key = groupKey(rowDefinition);
          if (!groups.has(key)) groups.set(key, { firstIndex: index, definition: rowDefinition, key: definitionKey(rowDefinition) });
        } catch (error) {
          rejected.push(rejection(index, error));
        }
      }

      const initiallyRejected = new Set(rejected.map((row) => row.index));
      for (const [index, row] of input.rows.entries()) {
        if (initiallyRejected.has(index)) continue;
        if (row.kind === "existing") {
          try {
            const result = await pricingService.createMaterialPriceRows({ grants: input.grants, actor: input.actor, currency: input.currency, onInvalid: "save-valid", writeBatchAudit: false, rows: [{ skuId: row.skuId, vendorId: row.vendorId, amount: row.amount, notes: row.notes }] });
            ids.push(...result.ids);
          } catch (error) {
            const rows = error instanceof AppError && error.code === "BULK_ROWS_INVALID" ? (error.details?.rows as Array<{ code: string; message: string }> | undefined) : undefined;
            rejected.push(rows?.[0] ? { index, code: rows[0].code, message: rows[0].message } : rejection(index, error));
          }
          continue;
        }

        const rowDefinition = definition(row);
        const group = groups.get(groupKey(rowDefinition))!;
        if (definitionKey(rowDefinition) !== group.key) {
          rejected.push({ index, code: "NEW_SKU_DETAILS_CONFLICT", message: `This row disagrees with row ${group.firstIndex + 1} about the new SKU details.`, details: { firstIndex: group.firstIndex } });
          continue;
        }

        if (!group.skuId && !group.existingSkuId) {
          const existing = await db.sku.findFirst({ where: { brand_id: group.definition.brandId, slug: group.definition.identity.slug, deleted_at: null }, select: { id: true } });
          if (existing) group.existingSkuId = existing.id;
        }
        if (group.existingSkuId) {
          rejected.push({ index, code: "NEW_SKU_ALREADY_EXISTS", message: "A live SKU already uses this identity. Use the existing SKU instead.", details: { existingSkuId: group.existingSkuId } });
          continue;
        }

        try {
          if (!group.skuId) {
            const created = await skuService.createSku({
              grants: input.grants,
              actor: input.actor,
              name: group.definition.name,
              code: group.definition.code,
              brandId: group.definition.brandId,
              baseUnitId: group.definition.baseUnitId,
              purchaseUnitId: group.definition.purchaseUnitId ?? undefined,
              dimensionLength: group.definition.dimensionLength ?? undefined,
              dimensionWidth: group.definition.dimensionWidth ?? undefined,
              dimensionThickness: group.definition.dimensionThickness ?? undefined,
              dimensionUnitId: group.definition.dimensionUnitId ?? undefined,
              categoryId: group.definition.categoryId,
              priceMaterials: [{ supplierVendorId: row.vendorId, amount: row.amount, currency: input.currency, notes: row.notes ?? undefined }],
            });
            group.skuId = created.skuId;
            createdSkuIds.push(created.skuId);
            ids.push(...created.priceMaterialIds);
          } else {
            const result = await pricingService.createMaterialPriceRows({ grants: input.grants, actor: input.actor, currency: input.currency, onInvalid: "save-valid", writeBatchAudit: false, rows: [{ skuId: group.skuId, vendorId: row.vendorId, amount: row.amount, notes: row.notes }] });
            ids.push(...result.ids);
          }
        } catch (error) {
          if (error instanceof AppError && (error.code === "P2002" || error.code === "SKU_IDENTITY_CONFLICT")) {
            const existing = await db.sku.findFirst({ where: { brand_id: group.definition.brandId, slug: group.definition.identity.slug, deleted_at: null }, select: { id: true } });
            if (existing) {
              group.existingSkuId = existing.id;
              rejected.push({ index, code: "NEW_SKU_ALREADY_EXISTS", message: "A live SKU already uses this identity. Use the existing SKU instead.", details: { existingSkuId: existing.id } });
              continue;
            }
          }
          const rows = error instanceof AppError && error.code === "BULK_ROWS_INVALID" ? (error.details?.rows as Array<{ code: string; message: string }> | undefined) : undefined;
          rejected.push(rows?.[0] ? { index, code: rows[0].code, message: rows[0].message } : rejection(index, error));
        }
      }

      rejected.sort((a, b) => a.index - b.index);
      if (ids.length === 0) throw new AppError("VALIDATION", "BULK_ROWS_INVALID", `${rejected.length} row(s) need fixing. Nothing was saved.`, { details: { rows: rejected } });
      await ports.runTransaction((tx) => writeAudit(ports, tx, { action: "price-sku-bulk.created", entityType: "price_batch", entityId: batchId, actor: input.actor, metadata: { batch_id: batchId, count: ids.length, created_skus: createdSkuIds.length, rejected_count: rejected.length } }));
      return { batchId, ids, createdSkuIds, ...(rejected.length > 0 ? { rejected } : {}) };
    },
  };
}
