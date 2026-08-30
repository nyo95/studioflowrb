import type { Prisma } from "@/generated/prisma/client";
import type { TransactionClient } from "@platform/core/db";
import type { MaterialReadRecord, PublicReadRepository, WorkPriceReadRecord } from "../application/public-read";

const materialInclude = {
  brand: true,
  category: true,
  base_unit: true,
  prices: {
    include: { unit: true, supplier: { include: { roles: true } }, source_link: true },
    orderBy: [{ supplier_party_id: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.SkuInclude;
const workInclude = { category: true, unit: true, vendor: { include: { roles: true } } } satisfies Prisma.WorkPriceInclude;
type MaterialRow = Prisma.SkuGetPayload<{ include: typeof materialInclude }>;
type WorkRow = Prisma.WorkPriceGetPayload<{ include: typeof workInclude }>;

function mapMaterial(row: MaterialRow): MaterialReadRecord {
  return {
    id: row.id, code: row.code, name: row.name, kind: row.kind, updatedAt: row.updated_at,
    brand: row.brand ? { id: row.brand.id, name: row.brand.name } : null,
    category: { id: row.category!.id, name: row.category!.name, path: row.category!.path },
    baseUnit: { id: row.base_unit.id, code: row.base_unit.code, label: row.base_unit.label },
    prices: row.prices.map((price) => {
      const supplierValid = !price.supplier || (price.supplier.deleted_at === null && price.supplier.roles.some(({ role }) => role === "MATERIAL_SUPPLIER"));
      const sourceValid = !price.source_link || row.brand_id !== null && price.source_link.brand_id === row.brand_id;
      return {
        id: price.id, amount: price.amount.toFixed(), currency: price.currency,
        unitCode: price.unit.code, supplierPartyId: price.supplier_party_id, supplierName: price.supplier?.name ?? null,
        sourceUrl: price.source_link?.url ?? null, updatedByUserId: price.updated_by_user_id,
        updatedByLabel: price.updated_by_label, updatedAt: price.updated_at,
        provenanceValid: supplierValid && sourceValid,
      };
    }),
  };
}

function mapWork(row: WorkRow): WorkPriceReadRecord {
  return {
    id: row.id, code: row.code, name: row.name, kind: row.kind,
    amount: row.amount.toFixed(), currency: row.currency,
    category: { id: row.category.id, name: row.category.name, path: row.category.path },
    unitCode: row.unit.code, vendorName: row.vendor?.name ?? null, scopeNote: row.scope_note,
    updatedByUserId: row.updated_by_user_id, updatedByLabel: row.updated_by_label, updatedAt: row.updated_at,
  };
}

const liveMaterial = {
  deleted_at: null,
  status: "ACTIVE",
  category: { deleted_at: null, kind: "PRODUCT" },
  AND: [{ OR: [{ brand_id: null }, { brand: { deleted_at: null } }] }],
} satisfies Prisma.SkuWhereInput;

export const prismaPublicReadRepository: PublicReadRepository = {
  async searchMaterials(tx: TransactionClient, query, limit) {
    const rows = await tx.sku.findMany({
      where: { ...liveMaterial, ...(query ? { AND: [...(liveMaterial.AND ?? []), { OR: [{ name: { contains: query, mode: "insensitive" } }, { code: { contains: query, mode: "insensitive" } }] }] } : {}) },
      include: materialInclude, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit,
    });
    return rows.map(mapMaterial);
  },
  async findMaterial(tx: TransactionClient, id) {
    const row = await tx.sku.findFirst({ where: { ...liveMaterial, id }, include: materialInclude });
    return row ? mapMaterial(row) : null;
  },
  async searchWorkPrices(tx: TransactionClient, query, limit) {
    const rows = await tx.workPrice.findMany({
      where: { deleted_at: null, category: { deleted_at: null, kind: "WORK" }, unit: { deleted_at: null }, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { code: { contains: query, mode: "insensitive" } }] } : {}) },
      include: workInclude, orderBy: [{ name: "asc" }, { id: "asc" }], take: limit,
    });
    return rows.filter((row) => !row.vendor || row.vendor.deleted_at === null && row.vendor.roles.some(({ role }) => role === "WORK_VENDOR")).map(mapWork);
  },
  async findWorkPrice(tx: TransactionClient, id) {
    const row = await tx.workPrice.findFirst({ where: { id, deleted_at: null, category: { deleted_at: null, kind: "WORK" }, unit: { deleted_at: null } }, include: workInclude });
    return row && (!row.vendor || row.vendor.deleted_at === null && row.vendor.roles.some(({ role }) => role === "WORK_VENDOR")) ? mapWork(row) : null;
  },
};
