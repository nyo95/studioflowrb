import type { TransactionClient } from "@platform/core/db";

import type {
  UnitCreateInput,
  UnitListFilter,
  UnitRecord,
  UnitRepository,
  UnitUpdateInput,
} from "../application/unit-repository";
import type { UnitDeleteReferences, UnitUsage } from "../domain/unit-rules";

const UNIT_SELECT = {
  id: true,
  code: true,
  label: true,
  symbol: true,
  aliases: true,
  usages: true,
  sort_order: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
} as const;

type UnitRow = {
  id: string;
  code: string;
  label: string;
  symbol: string | null;
  aliases: string[];
  usages: UnitUsage[];
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function toUnitRecord(row: UnitRow): UnitRecord {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    symbol: row.symbol,
    aliases: [...row.aliases],
    usages: [...row.usages],
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Prisma adapter for the Unit persistence port. Codes are globally unique
 * including soft-deleted rows, so lookups never filter on deleted_at.
 */
export const prismaUnitRepository: UnitRepository = {
  async list(tx: TransactionClient, filter: UnitListFilter): Promise<UnitRecord[]> {
    const rows = await tx.unit.findMany({
      select: UNIT_SELECT,
      where: {
        deleted_at: filter.includeDeleted ? undefined : null,
        OR: filter.query
          ? [
              { code: { contains: filter.query, mode: "insensitive" } },
              { label: { contains: filter.query, mode: "insensitive" } },
              { aliases: { has: filter.query } },
            ]
          : undefined,
      },
      orderBy: [{ sort_order: "asc" }, { code: "asc" }],
    });
    return rows.map(toUnitRecord);
  },

  async findById(tx: TransactionClient, id: string): Promise<UnitRecord | null> {
    const row = await tx.unit.findFirst({ select: UNIT_SELECT, where: { id } });
    return row ? toUnitRecord(row) : null;
  },

  async findByCode(tx: TransactionClient, code: string): Promise<UnitRecord | null> {
    const row = await tx.unit.findFirst({ select: UNIT_SELECT, where: { code } });
    return row ? toUnitRecord(row) : null;
  },

  async countDeleteReferences(tx: TransactionClient, unitId: string): Promise<UnitDeleteReferences> {
    const liveBaseUnitSkus = await tx.sku.count({ where: { base_unit_id: unitId, deleted_at: null } });
    const livePurchaseUnitSkus = await tx.sku.count({ where: { purchase_unit_id: unitId, deleted_at: null } });
    const liveDimensionUnitSkus = await tx.sku.count({ where: { dim_unit_id: unitId, deleted_at: null } });
    const liveSkuPrices = await tx.skuPrice.count({ where: { unit_id: unitId, sku: { deleted_at: null } } });
    const liveWorkPrices = await tx.workPrice.count({ where: { unit_id: unitId, deleted_at: null } });
    return { liveBaseUnitSkus, livePurchaseUnitSkus, liveDimensionUnitSkus, liveSkuPrices, liveWorkPrices };
  },

  async create(tx: TransactionClient, input: UnitCreateInput): Promise<UnitRecord> {
    const row = await tx.unit.create({
      select: UNIT_SELECT,
      data: {
        id: input.id,
        code: input.code,
        label: input.label,
        symbol: input.symbol,
        aliases: input.aliases,
        usages: input.usages,
        sort_order: input.sortOrder,
      },
    });
    return toUnitRecord(row);
  },

  async update(tx: TransactionClient, id: string, input: UnitUpdateInput): Promise<UnitRecord> {
    const row = await tx.unit.update({
      select: UNIT_SELECT,
      where: { id },
      data: {
        label: input.label,
        symbol: input.symbol,
        aliases: input.aliases,
        usages: input.usages,
        sort_order: input.sortOrder,
      },
    });
    return toUnitRecord(row);
  },

  async setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<UnitRecord> {
    const row = await tx.unit.update({ select: UNIT_SELECT, where: { id }, data: { deleted_at: deletedAt } });
    return toUnitRecord(row);
  },
};
