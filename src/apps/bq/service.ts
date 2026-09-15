import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import type { PermissionGrants } from "@platform/core/rbac";
import { requirePermission } from "@platform/core/rbac";

import { BQ_PERMISSIONS, createBqServiceContext, type BqServiceDeps } from "./services/context";
import { createAssemblyService } from "./services/assemblies";
import { createLibraryItemService } from "./services/library-items";
import { createProjectLifecycleService } from "./services/projects";
import { createProjectTreeService } from "./services/project-tree";
import { createPromotionService } from "./services/promotions";
import { createTemplateService } from "./services/templates";

export { BQ_PERMISSIONS };
export type { BqKategori, BqServiceDeps } from "./services/context";

export function createBqService(rootDb: PrismaClient, deps: BqServiceDeps) {
  const ctx = createBqServiceContext(rootDb, deps);
  const libraryItems = createLibraryItemService(ctx);
  const templates = createTemplateService(ctx);
  const projects = createProjectLifecycleService(ctx);
  const projectTree = createProjectTreeService(ctx);
  const promotions = createPromotionService(ctx);
  const assemblies = createAssemblyService(ctx);

  /** Creates an L1 named after the selected template, then snapshots that template into it. */
  async function addItemAndApplyAssembly(input: {
    grants: PermissionGrants;
    actor: { kind: string; userId?: string; label: string };
    sectionId?: string;
    subsectionId?: string;
    assemblyId: string;
    qtyPerL1?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const assembly = await ctx.db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");

    const item = await projectTree.addItem({
      grants: input.grants,
      actor: input.actor,
      sectionId: input.sectionId,
      subsectionId: input.subsectionId,
      name: assembly.name,
      qty: "1",
      unit: "ls",
    });
    await assemblies.applyAssemblyTemplate({
      grants: input.grants,
      actor: input.actor,
      itemId: item.id,
      assemblyId: input.assemblyId,
      qtyPerL1: input.qtyPerL1,
    });
    return item;
  }

  const operations = {
    ...libraryItems,
    ...templates,
    ...projects,
    ...projectTree,
    ...promotions,
    ...assemblies,
    addItemAndApplyAssembly,
  };

  // CORE.md §2: a command that writes records plus its audit event runs in one
  // transaction; simple independent reads do not open one.
  const readOnlyOperations = new Set<string>(["getTemplateWithSections", "listPromotionRequests", "listProjectDeletionRequests"]);

  return Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => [
      name,
      readOnlyOperations.has(name)
        ? operation
        : (...args: unknown[]) => ctx.runTransaction(() => (operation as (...values: unknown[]) => Promise<unknown>)(...args)),
    ]),
  ) as typeof operations;
}
