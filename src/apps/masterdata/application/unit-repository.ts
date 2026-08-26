import type { TransactionClient } from "@platform/core/db";

import type { UnitDeleteReferences, UnitUsage } from "../domain/unit-rules";

/** Persisted Unit shape as seen by the application layer. */
export type UnitRecord = {
  id: string;
  code: string;
  label: string;
  symbol: string | null;
  aliases: string[];
  usages: UnitUsage[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type UnitListFilter = {
  query?: string;
  includeDeleted?: boolean;
};

export type UnitCreateInput = {
  id: string;
  code: string;
  label: string;
  symbol: string | null;
  aliases: string[];
  usages: UnitUsage[];
  sortOrder: number;
};

export type UnitUpdateInput = {
  label: string;
  symbol: string | null;
  aliases: string[];
  usages: UnitUsage[];
  sortOrder: number;
};

/**
 * Unit persistence port. Methods run inside the use-case transaction;
 * implementations never open their own transaction.
 */
export interface UnitRepository {
  list(tx: TransactionClient, filter: UnitListFilter): Promise<UnitRecord[]>;
  findById(tx: TransactionClient, id: string): Promise<UnitRecord | null>;
  /** Code lookup across live and soft-deleted rows (codes stay globally unique). */
  findByCode(tx: TransactionClient, code: string): Promise<UnitRecord | null>;
  countDeleteReferences(tx: TransactionClient, unitId: string): Promise<UnitDeleteReferences>;
  create(tx: TransactionClient, input: UnitCreateInput): Promise<UnitRecord>;
  update(tx: TransactionClient, id: string, input: UnitUpdateInput): Promise<UnitRecord>;
  setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<UnitRecord>;
}
