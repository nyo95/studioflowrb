import { diffAuditChanges, prepareAuditEvent } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";

import {
  assertCategoryCanBeDeleted,
  categorySlug,
  normalizeCategorySynonyms,
  resolveCategoryPlacement,
  rewriteDescendantCategoryPath,
  type CategoryKind,
} from "../domain/category-rules";
import type { CategoryRepository, CategoryRecord } from "./category-repository";
import { runInMasterDataTransaction, type MasterDataExecutionContext, type MasterDataUseCasePorts } from "./execution-context";
import { MASTERDATA_CATEGORY_MANAGE, MASTERDATA_CATEGORY_READ } from "./masterdata-permissions";

export type CategoryListInput = {
  kind?: CategoryKind;
  query?: string;
  includeDeleted?: boolean;
  sortBy?: "name" | "sortOrder";
  sortDirection?: "asc" | "desc";
};

export type CategoryCreateInput = {
  kind: CategoryKind;
  name: string;
  parentId?: string | null;
  searchSynonyms?: readonly string[];
  sortOrder?: number;
  description?: string | null;
};

export type CategoryUpdateInput = {
  id: string;
  name?: string;
  /** Omitted keeps the current parent; explicit null moves a WORK category to the root. */
  parentId?: string | null;
  searchSynonyms?: readonly string[];
  sortOrder?: number;
  description?: string | null;
};

function categoryAuditShape(record: CategoryRecord): Record<string, unknown> {
  return {
    kind: record.kind,
    name: record.name,
    slug: record.slug,
    parentId: record.parentId,
    path: record.path,
    searchSynonyms: record.searchSynonyms,
    sortOrder: record.sortOrder,
    description: record.description,
  };
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

/**
 * Category dictionary use cases (MD-00 §6, docs/06 §Category). Every mutation
 * checks permissions, runs in one application transaction, and writes its
 * audit event inside the same transaction; no-op updates emit nothing.
 */
export class CategoryService {
  constructor(
    private readonly ports: MasterDataUseCasePorts & { categories: CategoryRepository },
  ) {}

  list(context: MasterDataExecutionContext, input: CategoryListInput = {}): Promise<CategoryRecord[]> {
    requirePermission(context.grants, MASTERDATA_CATEGORY_READ);
    const query = normalizeText(input.query ?? "");
    return runInMasterDataTransaction(context, this.ports.runTransaction, (tx) =>
      this.ports.categories.list(tx, {
        kind: input.kind,
        query: query ? query : undefined,
        includeDeleted: input.includeDeleted ?? false,
        sortBy: input.sortBy ?? "name",
        sortDirection: input.sortDirection ?? "asc",
      }),
    );
  }

  create(context: MasterDataExecutionContext, input: CategoryCreateInput): Promise<CategoryRecord> {
    requirePermission(context.grants, MASTERDATA_CATEGORY_MANAGE);
    const name = normalizeText(input.name ?? "");
    if (!name) {
      throw new AppError("VALIDATION", "CATEGORY_NAME_REQUIRED", "Category name is required.");
    }
    const slug = categorySlug(name);
    if (!slug) {
      throw new AppError(
        "VALIDATION",
        "CATEGORY_NAME_NOT_SLUGGABLE",
        "Category name must contain letters or digits.",
      );
    }
    const searchSynonyms = normalizeCategorySynonyms(input.searchSynonyms ?? []);
    const sortOrder = input.sortOrder ?? 0;
    const description = normalizeDescription(input.description ?? null);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const parent =
        input.parentId === undefined || input.parentId === null
          ? null
          : await this.ports.categories.loadParentCandidate(tx, input.parentId);
      if (input.parentId !== undefined && input.parentId !== null && parent === null) {
        throw new AppError(
          "NOT_FOUND",
          "CATEGORY_PARENT_NOT_FOUND",
          "The selected parent category does not exist.",
        );
      }

      const placement = resolveCategoryPlacement({ kind: input.kind, name, parent });

      const slugConflict = await this.ports.categories.findLiveByKindAndSlug(tx, input.kind, slug);
      if (slugConflict) {
        throw new AppError(
          "CONFLICT",
          "CATEGORY_SLUG_TAKEN",
          "A live category with this name already exists.",
        );
      }

      const record = await this.ports.categories.create(tx, {
        id: this.ports.generateId(),
        kind: input.kind,
        name,
        slug,
        parentId: placement.parentId,
        path: placement.path,
        searchSynonyms,
        sortOrder,
        description,
      });

      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "category.created",
          entityType: "category",
          entityId: record.id,
          actor: context.actor,
          changes: diffAuditChanges({}, categoryAuditShape(record)),
          occurredAt: this.ports.now(),
        }),
        tx,
      );
      return record;
    });
  }

  update(context: MasterDataExecutionContext, input: CategoryUpdateInput): Promise<CategoryRecord> {
    requirePermission(context.grants, MASTERDATA_CATEGORY_MANAGE);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.categories.findById(tx, input.id);
      if (!current || current.deletedAt !== null) {
        throw new AppError("NOT_FOUND", "CATEGORY_NOT_FOUND", "This category no longer exists.");
      }

      const name = input.name === undefined ? current.name : normalizeText(input.name);
      if (!name) {
        throw new AppError("VALIDATION", "CATEGORY_NAME_REQUIRED", "Category name is required.");
      }
      const slug = categorySlug(name);
      if (!slug) {
        throw new AppError(
          "VALIDATION",
          "CATEGORY_NAME_NOT_SLUGGABLE",
          "Category name must contain letters or digits.",
        );
      }
      const nextParentId = input.parentId === undefined ? current.parentId : input.parentId;
      const searchSynonyms =
        input.searchSynonyms === undefined
          ? current.searchSynonyms
          : normalizeCategorySynonyms(input.searchSynonyms);
      const sortOrder = input.sortOrder ?? current.sortOrder;
      const description =
        input.description === undefined ? current.description : normalizeDescription(input.description);

      const placementChanged = name !== current.name || nextParentId !== current.parentId;
      let nextPath = current.path;
      if (placementChanged) {
        const parent =
          nextParentId === null
            ? null
            : await this.ports.categories.loadParentCandidate(tx, nextParentId);
        if (nextParentId !== null && parent === null) {
          throw new AppError(
            "NOT_FOUND",
            "CATEGORY_PARENT_NOT_FOUND",
            "The selected parent category does not exist.",
          );
        }
        const placement = resolveCategoryPlacement({
          categoryId: current.id,
          kind: current.kind,
          name,
          parent,
        });
        nextPath = placement.path;
      }

      if (slug !== current.slug) {
        const slugConflict = await this.ports.categories.findLiveByKindAndSlug(tx, current.kind, slug);
        if (slugConflict && slugConflict.id !== current.id) {
          throw new AppError(
            "CONFLICT",
            "CATEGORY_SLUG_TAKEN",
            "A live category with this name already exists.",
          );
        }
      }

      const nextShape: Record<string, unknown> = {
        kind: current.kind,
        name,
        slug,
        parentId: placementChanged
          ? nextParentId
          : current.parentId,
        path: nextPath,
        searchSynonyms,
        sortOrder,
        description,
      };
      const changes = diffAuditChanges(categoryAuditShape(current), nextShape);
      if (Object.keys(changes).length === 0) return current;

      const updated = await this.ports.categories.update(tx, current.id, {
        name,
        slug,
        parentId: (nextShape.parentId as string | null) ?? null,
        path: nextPath,
        searchSynonyms,
        sortOrder,
        description,
      });

      if (current.kind === "WORK" && current.path !== null && nextPath !== null && current.path !== nextPath) {
        const descendants = await this.ports.categories.listByPathPrefix(tx, current.path);
        for (const descendant of descendants) {
          await this.ports.categories.updatePath(
            tx,
            descendant.id,
            rewriteDescendantCategoryPath(descendant.path!, current.path, nextPath),
          );
        }
      }

      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "category.updated",
          entityType: "category",
          entityId: current.id,
          actor: context.actor,
          changes,
          occurredAt: this.ports.now(),
        }),
        tx,
      );
      return updated;
    });
  }

  softDelete(context: MasterDataExecutionContext, id: string): Promise<CategoryRecord> {
    requirePermission(context.grants, MASTERDATA_CATEGORY_MANAGE);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.categories.findById(tx, id);
      if (!current || current.deletedAt !== null) {
        throw new AppError("NOT_FOUND", "CATEGORY_NOT_FOUND", "This category no longer exists.");
      }

      const references = await this.ports.categories.countDeleteReferences(tx, current.id);
      assertCategoryCanBeDeleted(references);

      const deletedAt = this.ports.now();
      const updated = await this.ports.categories.setDeletedAt(tx, current.id, deletedAt);
      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "category.deleted",
          entityType: "category",
          entityId: current.id,
          actor: context.actor,
          changes: { deletedAt: { from: null, to: deletedAt } },
          occurredAt: deletedAt,
        }),
        tx,
      );
      return updated;
    });
  }

  restore(context: MasterDataExecutionContext, id: string): Promise<CategoryRecord> {
    requirePermission(context.grants, MASTERDATA_CATEGORY_MANAGE);

    return runInMasterDataTransaction(context, this.ports.runTransaction, async (tx) => {
      const current = await this.ports.categories.findById(tx, id);
      if (!current) {
        throw new AppError("NOT_FOUND", "CATEGORY_NOT_FOUND", "This category no longer exists.");
      }
      if (current.deletedAt === null) {
        throw new AppError(
          "CONFLICT",
          "CATEGORY_NOT_DELETED",
          "Only soft-deleted categories can be restored.",
        );
      }

      const slugConflict = await this.ports.categories.findLiveByKindAndSlug(tx, current.kind, current.slug);
      if (slugConflict && slugConflict.id !== current.id) {
        throw new AppError(
          "CONFLICT",
          "CATEGORY_SLUG_TAKEN",
          "The category name is already used by a live category.",
        );
      }

      let nextPath = current.path;
      if (current.kind === "WORK") {
        const parent =
          current.parentId === null
            ? null
            : await this.ports.categories.loadParentCandidate(tx, current.parentId);
        if (current.parentId !== null && parent === null) {
          throw new AppError(
            "NOT_FOUND",
            "CATEGORY_PARENT_NOT_FOUND",
            "The parent category of this category no longer exists.",
          );
        }
        const placement = resolveCategoryPlacement({
          categoryId: current.id,
          kind: current.kind,
          name: current.name,
          parent,
        });
        nextPath = placement.path;
      }

      const updated = await this.ports.categories.update(tx, current.id, {
        name: current.name,
        slug: current.slug,
        parentId: current.parentId,
        path: nextPath,
        searchSynonyms: current.searchSynonyms,
        sortOrder: current.sortOrder,
        description: current.description,
      });
      const restored = await this.ports.categories.setDeletedAt(tx, current.id, null);

      await this.ports.auditWriter.write(
        prepareAuditEvent({
          appId: "masterdata",
          action: "category.restored",
          entityType: "category",
          entityId: current.id,
          actor: context.actor,
          changes: { deletedAt: { from: current.deletedAt, to: null } },
          occurredAt: this.ports.now(),
        }),
        tx,
      );
      return restored;
    });
  }
}
