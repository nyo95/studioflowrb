import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { prisma } from "@platform/core/db";

import { getModuleRegistry, type ModuleManifest } from "./manifest";

type ModuleStateReader = Pick<PrismaClient, "moduleState">;

function manifestOf(id: string): ModuleManifest {
  const manifest = getModuleRegistry().find(id);
  if (!manifest) throw new AppError("INVARIANT", "MODULE_UNKNOWN", "The requested module is not registered.");
  return manifest;
}

async function enabled(manifest: ModuleManifest, db: ModuleStateReader, seen: Set<string>): Promise<boolean> {
  if (seen.has(manifest.id)) throw new AppError("INVARIANT", "MODULE_DEPENDENCY_CYCLE", "The module dependency graph contains a cycle.");
  if (manifest.kind === "core") return true;
  seen.add(manifest.id);
  const row = await db.moduleState.findUnique({ where: { module_id: manifest.id }, select: { state: true } });
  if (row?.state === "DISABLED") return false;
  for (const dependencyId of [...manifest.requires, ...(manifest.parent ? [manifest.parent] : [])]) {
    if (!(await enabled(manifestOf(dependencyId), db, seen))) return false;
  }
  seen.delete(manifest.id);
  return true;
}

export async function isModuleEnabled(id: string, db: ModuleStateReader = prisma): Promise<boolean> {
  return enabled(manifestOf(id), db, new Set());
}

export async function requireModuleEnabled(id: string, db: ModuleStateReader = prisma): Promise<void> {
  if (!(await isModuleEnabled(id, db))) {
    throw new AppError("FORBIDDEN", "MODULE_DISABLED", "This module is disabled.", { details: { moduleId: id } });
  }
}

export async function enabledModuleIds(db: ModuleStateReader = prisma): Promise<readonly string[]> {
  const ids: string[] = [];
  for (const moduleManifest of getModuleRegistry().modules) if (await isModuleEnabled(moduleManifest.id, db)) ids.push(moduleManifest.id);
  return Object.freeze(ids);
}

export async function synchronizeModuleVersions(db: ModuleStateReader = prisma): Promise<void> {
  const rows = await db.moduleState.findMany({ select: { module_id: true, last_version: true } });
  const byId = new Map(rows.map((row) => [row.module_id, row]));
  for (const moduleManifest of getModuleRegistry().modules) {
    if (moduleManifest.kind !== "optional") continue;
    const row = byId.get(moduleManifest.id);
    if (!row) {
      await db.moduleState.upsert({
        where: { module_id: moduleManifest.id },
        create: { module_id: moduleManifest.id, state: "ENABLED", last_version: moduleManifest.version, updated_by: "system-boot" },
        update: { last_version: moduleManifest.version },
      });
    } else if (row.last_version !== moduleManifest.version) {
      await db.moduleState.update({ where: { module_id: moduleManifest.id }, data: { last_version: moduleManifest.version } });
    }
  }
}
