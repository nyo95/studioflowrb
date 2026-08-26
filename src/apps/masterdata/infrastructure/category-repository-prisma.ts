import type { TransactionClient } from "@platform/core/db";
import { AppError } from "@platform/core/errors";

import type {
  CategoryCreateInput,
  CategoryListFilter,
  CategoryParentCandidateRecord,
  CategoryRecord,
  CategoryRepository,
  CategoryUpdateInput,
} from "../application/category-repository";
import type { CategoryDeleteReferences, CategoryKind } from "../domain/category-rules";

const CATEGORY_SELECT = {
  id: true,
  kind: true,
  name: true,
  slug: true,
  parent_id: true,
  path: true,
  search_synonyms: true,
  sort_order: true,
  description: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
} as const;

type CategoryRow = {
  id: string;
  kind: CategoryKind;
  name: string;
  slug: string;
  parent_id: string | null;
  path: string | null;
  search_synonyms: string[];
  sort_order: number;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

/// Walking a parent chain beyond this depth means corrupted hierarchy data.
const MAX_PARENT_CHAIN_DEPTH = 1000;

function toCategoryRecord(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    path: row.path,
    searchSynonyms: [...row.search_synonyms],
    sortOrder: row.sort_order,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Prisma adapter for the Category persistence port. Every method executes on
 * the transaction client handed in by the application use case.
 */
export const prismaCategoryRepository: CategoryRepository = {
  async list(tx: TransactionClient, filter: CategoryListFilter): Promise<CategoryRecord[]> {
    const rows = await tx.category.findMany({
      select: CATEGORY_SELECT,
      where: {
        deleted_at: filter.includeDeleted ? undefined : null,
        kind: filter.kind,
        OR: filter.query
          ? [
              { name: { contains: filter.query, mode: "insensitive" } },
              { slug: { contains: filter.query, mode: "insensitive" } },
              { search_synonyms: { has: filter.query } },
            ]
          : undefined,
      },
      orderBy:
        filter.sortBy === "sortOrder"
          ? [{ sort_order: filter.sortDirection ?? "asc" }, { name: "asc" }, { id: "asc" }]
          : [{ name: filter.sortDirection ?? "asc" }, { sort_order: "asc" }, { id: "asc" }],
    });
    return rows.map(toCategoryRecord);
  },

  async findById(tx: TransactionClient, id: string): Promise<CategoryRecord | null> {
    const row = await tx.category.findFirst({ select: CATEGORY_SELECT, where: { id } });
    return row ? toCategoryRecord(row) : null;
  },

  async findLiveByKindAndSlug(tx: TransactionClient, kind: CategoryKind, slug: string): Promise<CategoryRecord | null> {
    const row = await tx.category.findFirst({
      select: CATEGORY_SELECT,
      where: { kind, slug, deleted_at: null },
    });
    return row ? toCategoryRecord(row) : null;
  },

  async loadParentCandidate(
    tx: TransactionClient,
    parentId: string,
  ): Promise<CategoryParentCandidateRecord | null> {
    const candidate = await tx.category.findFirst({ select: CATEGORY_SELECT, where: { id: parentId } });
    if (!candidate) return null;

    const ancestorIds: string[] = [];
    const visited = new Set<string>([candidate.id]);
    let cursor = candidate.parent_id;
    while (cursor !== null) {
      if (visited.has(cursor) || ancestorIds.length >= MAX_PARENT_CHAIN_DEPTH) {
        throw new AppError(
          "INVARIANT",
          "CATEGORY_PARENT_CHAIN_CORRUPT",
          "The category hierarchy contains inconsistent parent data.",
        );
      }
      const ancestor = await tx.category.findFirst({ select: CATEGORY_SELECT, where: { id: cursor } });
      if (!ancestor) {
        throw new AppError(
          "INVARIANT",
          "CATEGORY_PARENT_CHAIN_CORRUPT",
          "The category hierarchy contains inconsistent parent data.",
        );
      }
      visited.add(ancestor.id);
      ancestorIds.push(ancestor.id);
      cursor = ancestor.parent_id;
    }

    return {
      id: candidate.id,
      kind: candidate.kind,
      path: candidate.path,
      deletedAt: candidate.deleted_at,
      ancestorIds,
    };
  },

  async listByPathPrefix(tx: TransactionClient, path: string): Promise<CategoryRecord[]> {
    const rows = await tx.category.findMany({
      select: CATEGORY_SELECT,
      where: { path: { startsWith: `${path}/` } },
      orderBy: [{ path: "asc" }, { id: "asc" }],
    });
    return rows.map(toCategoryRecord);
  },

  async countDeleteReferences(tx: TransactionClient, categoryId: string): Promise<CategoryDeleteReferences> {
    const liveBrandCategories = await tx.brandCategory.count({ where: { category_id: categoryId, brand: { deleted_at: null } } });
    const nonDeletedSkus = await tx.sku.count({ where: { category_id: categoryId, deleted_at: null } });
    const liveWorkPrices = await tx.workPrice.count({ where: { category_id: categoryId, deleted_at: null } });
    const liveChildren = await tx.category.count({ where: { parent_id: categoryId, deleted_at: null } });
    return { liveBrandCategories, nonDeletedSkus, liveWorkPrices, liveChildren };
  },

  async create(tx: TransactionClient, input: CategoryCreateInput): Promise<CategoryRecord> {
    const row = await tx.category.create({
      select: CATEGORY_SELECT,
      data: {
        id: input.id,
        kind: input.kind,
        name: input.name,
        slug: input.slug,
        parent_id: input.parentId,
        path: input.path,
        search_synonyms: input.searchSynonyms,
        sort_order: input.sortOrder,
        description: input.description,
      },
    });
    return toCategoryRecord(row);
  },

  async update(tx: TransactionClient, id: string, input: CategoryUpdateInput): Promise<CategoryRecord> {
    const row = await tx.category.update({
      select: CATEGORY_SELECT,
      where: { id },
      data: {
        name: input.name,
        slug: input.slug,
        parent_id: input.parentId,
        path: input.path,
        search_synonyms: input.searchSynonyms,
        sort_order: input.sortOrder,
        description: input.description,
      },
    });
    return toCategoryRecord(row);
  },

  async updatePath(tx: TransactionClient, id: string, path: string): Promise<void> {
    await tx.category.update({ select: { id: true }, where: { id }, data: { path } });
  },

  async setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<CategoryRecord> {
    const row = await tx.category.update({ select: CATEGORY_SELECT, where: { id }, data: { deleted_at: deletedAt } });
    return toCategoryRecord(row);
  },
};
