import type { TransactionClient } from "@platform/core/db";
import { requirePermission } from "@platform/core/rbac";

import type { MasterDataExecutionContext, TransactionRunner } from "./execution-context";
import { MASTERDATA_PRICE_READ, MASTERDATA_SKU_READ } from "./masterdata-permissions";

export type MaterialReadRecord = {
  id: string;
  code: string | null;
  name: string;
  kind: string;
  updatedAt: Date;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string; path: string | null };
  baseUnit: { id: string; code: string; label: string };
  price: null | {
    id: string;
    amount: string;
    currency: string;
    unitCode: string;
    supplierName: string | null;
    sourceUrl: string | null;
    updatedByUserId: string | null;
    updatedByLabel: string;
    updatedAt: Date;
    provenanceValid: boolean;
  };
};

export type WorkPriceReadRecord = {
  id: string;
  code: string;
  name: string;
  kind: string;
  amount: string;
  currency: string;
  category: { id: string; name: string; path: string | null };
  unitCode: string;
  vendorName: string | null;
  scopeNote: string | null;
  updatedByUserId: string | null;
  updatedByLabel: string;
  updatedAt: Date;
};

export interface PublicReadRepository {
  searchMaterials(tx: TransactionClient, query: string, limit: number): Promise<MaterialReadRecord[]>;
  findMaterial(tx: TransactionClient, id: string): Promise<MaterialReadRecord | null>;
  searchWorkPrices(tx: TransactionClient, query: string, limit: number): Promise<WorkPriceReadRecord[]>;
  findWorkPrice(tx: TransactionClient, id: string): Promise<WorkPriceReadRecord | null>;
}

function materialDto(record: MaterialReadRecord) {
  const notReadyReasons = !record.price
    ? ["MISSING_CANONICAL_PRICE"]
    : record.price.provenanceValid ? [] : ["INVALID_PRICE_PROVENANCE"];
  return Object.freeze({
    id: record.id,
    code: record.code,
    name: record.name,
    kind: record.kind,
    brand: record.brand ? Object.freeze({ ...record.brand }) : null,
    category: Object.freeze({ ...record.category }),
    baseUnit: Object.freeze({ ...record.baseUnit }),
    price: record.price && record.price.provenanceValid ? Object.freeze({
      id: record.price.id,
      amount: record.price.amount,
      currency: record.price.currency,
      unitCode: record.price.unitCode,
      supplierName: record.price.supplierName,
      sourceUrl: record.price.sourceUrl,
      updatedByUserId: record.price.updatedByUserId,
      updatedByLabel: record.price.updatedByLabel,
      updatedAt: record.price.updatedAt.toISOString(),
    }) : null,
    ready: notReadyReasons.length === 0,
    notReadyReasons: Object.freeze(notReadyReasons),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function workPriceDto(record: WorkPriceReadRecord) {
  return Object.freeze({
    ...record,
    category: Object.freeze({ ...record.category }),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export class PublicReadService {
  constructor(private readonly ports: { runTransaction: TransactionRunner; reads: PublicReadRepository }) {}

  async searchMaterials(context: MasterDataExecutionContext, input: { query?: string; limit?: number } = {}) {
    requirePermission(context.grants, MASTERDATA_SKU_READ);
    requirePermission(context.grants, MASTERDATA_PRICE_READ);
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    return (await this.ports.runTransaction((tx) => this.ports.reads.searchMaterials(tx, input.query?.trim() ?? "", limit))).map(materialDto);
  }

  async getMaterial(context: MasterDataExecutionContext, id: string) {
    requirePermission(context.grants, MASTERDATA_SKU_READ);
    requirePermission(context.grants, MASTERDATA_PRICE_READ);
    const record = await this.ports.runTransaction((tx) => this.ports.reads.findMaterial(tx, id));
    return record ? materialDto(record) : null;
  }

  async searchWorkPrices(context: MasterDataExecutionContext, input: { query?: string; limit?: number } = {}) {
    requirePermission(context.grants, MASTERDATA_PRICE_READ);
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    return (await this.ports.runTransaction((tx) => this.ports.reads.searchWorkPrices(tx, input.query?.trim() ?? "", limit))).map(workPriceDto);
  }

  async getWorkPrice(context: MasterDataExecutionContext, id: string) {
    requirePermission(context.grants, MASTERDATA_PRICE_READ);
    const record = await this.ports.runTransaction((tx) => this.ports.reads.findWorkPrice(tx, id));
    return record ? workPriceDto(record) : null;
  }
}
