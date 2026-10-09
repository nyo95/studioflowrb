import "server-only";

import { cache } from "react";

import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { prisma } from "@platform/core/db";

import { getModuleRegistry, type ModuleKind, type ModuleManifest } from "./manifest";

type ModuleStateReader = Pick<PrismaClient, "moduleState">;
type StoredStates = ReadonlyMap<string, "ENABLED" | "DISABLED">;

export type ModuleOverview = {
  id: string;
  name: string;
  version: string;
  kind: ModuleKind;
  parent: string | null;
  /** The module's own switch: core modules are always ENABLED. */
  state: "ENABLED" | "DISABLED";
  /** False when the module or anything it needs is switched off. */
  enabled: boolean;
};

async function readStoredStates(db: ModuleStateReader): Promise<StoredStates> {
  const rows = await db.moduleState.findMany({ select: { module_id: true, state: true } });
  return new Map(rows.map((row) => [row.module_id, row.state]));
}

/** One read per request on the served app; React clears it for the next request. */
const readStoredStatesForRequest = cache(() => readStoredStates(prisma));

function statesFrom(db: ModuleStateReader | undefined): Promise<StoredStates> {
  return db ? readStoredStates(db) : readStoredStatesForRequest();
}

function manifestOf(id: string): ModuleManifest {
  const manifest = getModuleRegistry().find(id);
  if (!manifest) throw new AppError("INVARIANT", "MODULE_UNKNOWN", "The requested module is not registered.");
  return manifest;
}

function enabled(manifest: ModuleManifest, states: StoredStates, seen: Set<string>): boolean {
  if (manifest.kind === "core") return true;
  if (seen.has(manifest.id)) throw new AppError("INVARIANT", "MODULE_DEPENDENCY_CYCLE", "The module dependency graph contains a cycle.");
  if (states.get(manifest.id) === "DISABLED") return false;
  seen.add(manifest.id);
  const result = [...manifest.requires, ...(manifest.parent ? [manifest.parent] : [])]
    .every((dependencyId) => enabled(manifestOf(dependencyId), states, seen));
  seen.delete(manifest.id);
  return result;
}

export async function isModuleEnabled(id: string, db?: ModuleStateReader): Promise<boolean> {
  const manifest = manifestOf(id);
  return enabled(manifest, await statesFrom(db), new Set());
}

export async function requireModuleEnabled(id: string, db?: ModuleStateReader): Promise<void> {
  if (!(await isModuleEnabled(id, db))) {
    throw new AppError("FORBIDDEN", "MODULE_DISABLED", "This module is disabled.", { details: { moduleId: id } });
  }
}

export async function enabledModuleIds(db?: ModuleStateReader): Promise<readonly string[]> {
  const states = await statesFrom(db);
  return Object.freeze(getModuleRegistry().modules.filter((moduleManifest) => enabled(moduleManifest, states, new Set())).map((moduleManifest) => moduleManifest.id));
}

/** Read-only view of every registered module for display; changing state is the System Owner command only. */
export async function listModuleOverview(db?: ModuleStateReader): Promise<readonly ModuleOverview[]> {
  const states = await statesFrom(db);
  return getModuleRegistry().modules.map((moduleManifest) => ({
    id: moduleManifest.id,
    name: moduleManifest.name,
    version: moduleManifest.version,
    kind: moduleManifest.kind,
    parent: moduleManifest.parent ?? null,
    state: moduleManifest.kind === "core" ? "ENABLED" : states.get(moduleManifest.id) ?? "ENABLED",
    enabled: enabled(moduleManifest, states, new Set()),
  }));
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
