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
    /** Defaults to the assembly's name, quantity 1 and unit "ls" when the caller does not choose them. */
    name?: string;
    qty?: string;
    unit?: string;
  }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    const assembly = await ctx.db.bqAssemblyTemplate.findUnique({ where: { id: input.assemblyId } });
    if (!assembly) throw new AppError("NOT_FOUND", "bq.assembly.not-found", "Assembly template not found");

    const item = await projectTree.addItem({
      grants: input.grants,
      actor: input.actor,
      sectionId: input.sectionId,
      subsectionId: input.subsectionId,
      name: input.name?.trim() || assembly.name,
      qty: input.qty ?? "1",
      unit: input.unit?.trim() || "ls",
    });
    // The assembly's lines go straight under the new Work Item: a Component Group named like the Work Item would
    // only repeat it, and its quantity per Work Item is always 1 here.
    await assemblies.applyAssemblyTemplate({
      grants: input.grants,
      actor: input.actor,
      itemId: item.id,
      assemblyId: input.assemblyId,
      placement: "direct",
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
  const automaticSortOperations = new Set<string>([
    "addTemplateSection",
    "addTemplateRecommendation",
    "addAssemblyCustomLine",
    "addSection",
    "addSubsection",
    "addItem",
    "addSubObject",
    "addLineItem",
  ]);

  return Object.fromEntries(
    Object.entries(operations).map(([name, operation]) => [
      name,
      readOnlyOperations.has(name)
        ? operation
        : (...args: unknown[]) => {
          const firstArgument = args[0];
          const shouldRetryAutomaticSort = automaticSortOperations.has(name)
            && typeof firstArgument === "object"
            && firstArgument !== null
            && (firstArgument as { sortOrder?: unknown }).sortOrder === undefined;
          const execute = () => (operation as (...values: unknown[]) => Promise<unknown>)(...args);
          return shouldRetryAutomaticSort ? ctx.runAutomaticSortTransaction(execute) : ctx.runTransaction(execute);
        },
    ]),
  ) as typeof operations;
}
