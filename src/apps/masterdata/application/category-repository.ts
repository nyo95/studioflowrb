import type { TransactionClient } from "@platform/core/db";

import type { CategoryDeleteReferences, CategoryKind } from "../domain/category-rules";

/** Persisted Category shape as seen by the application layer. */
export type CategoryRecord = {
  id: string;
  kind: CategoryKind;
  name: string;
  slug: string;
  parentId: string | null;
  path: string | null;
  searchSynonyms: string[];
  sortOrder: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/**
 * Candidate parent plus its complete ancestor chain. The service loads this
 * inside the same transaction used for the write and descendant propagation,
 * then hands it to the pure placement rule.
 */
export type CategoryParentCandidateRecord = {
  id: string;
  kind: CategoryKind;
  path: string | null;
  deletedAt: Date | null;
  /** Ancestor IDs of the candidate parent, nearest-first. */
  ancestorIds: string[];
};

export type CategoryListFilter = {
  kind?: CategoryKind;
  query?: string;
  includeDeleted?: boolean;
  sortBy?: "name" | "sortOrder";
  sortDirection?: "asc" | "desc";
};

export type CategoryCreateInput = {
  id: string;
  kind: CategoryKind;
  name: string;
  slug: string;
  parentId: string | null;
  path: string | null;
  searchSynonyms: string[];
  sortOrder: number;
  description: string | null;
};

export type CategoryUpdateInput = {
  name: string;
  slug: string;
  parentId: string | null;
  path: string | null;
  searchSynonyms: string[];
  sortOrder: number;
  description: string | null;
};

/**
 * Category persistence port. Every method runs inside the transaction opened
 * by the calling use case; implementations never open their own transaction.
 */
export interface CategoryRepository {
  list(tx: TransactionClient, filter: CategoryListFilter): Promise<CategoryRecord[]>;
  findById(tx: TransactionClient, id: string): Promise<CategoryRecord | null>;
  findLiveByKindAndSlug(tx: TransactionClient, kind: CategoryKind, slug: string): Promise<CategoryRecord | null>;
  loadParentCandidate(tx: TransactionClient, parentId: string): Promise<CategoryParentCandidateRecord | null>;
  /** All categories whose materialized path sits below `path` (any subtree row). */
  listByPathPrefix(tx: TransactionClient, path: string): Promise<CategoryRecord[]>;
  countDeleteReferences(tx: TransactionClient, categoryId: string): Promise<CategoryDeleteReferences>;
  create(tx: TransactionClient, input: CategoryCreateInput): Promise<CategoryRecord>;
  update(tx: TransactionClient, id: string, input: CategoryUpdateInput): Promise<CategoryRecord>;
  /** Descendant-path propagation target; the service rewrites paths in its own transaction. */
  updatePath(tx: TransactionClient, id: string, path: string): Promise<void>;
  setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<CategoryRecord>;
}
