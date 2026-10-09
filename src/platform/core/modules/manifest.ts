import { AppError } from "@platform/core/errors";
import { APP_ID_PATTERN } from "@platform/core/rbac/registry";

export type ModuleKind = "core" | "optional";

export type ModuleManifest = {
  id: string;
  name: string;
  version: string;
  kind: ModuleKind;
  parent?: string;
  requires: readonly string[];
};

export type ModuleRegistry = {
  modules: readonly ModuleManifest[];
  find(id: string): ModuleManifest | undefined;
};

export const PLATFORM_MODULE_MANIFEST: ModuleManifest = Object.freeze({
  id: "platform",
  name: "Platform",
  version: "1.0.0",
  kind: "core",
  requires: Object.freeze([]),
});

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function composeModuleRegistry(manifests: readonly ModuleManifest[]): ModuleRegistry {
  const modules = [PLATFORM_MODULE_MANIFEST, ...manifests].map((manifest) => Object.freeze({
    ...manifest,
    name: manifest.name.trim(),
    requires: Object.freeze([...manifest.requires]),
  }));
  const byId = new Map<string, ModuleManifest>();
  for (const moduleManifest of modules) {
    if (!APP_ID_PATTERN.test(moduleManifest.id)) throw new AppError("INVARIANT", "MODULE_INVALID_ID", "A module manifest has an invalid id.");
    if (byId.has(moduleManifest.id)) throw new AppError("INVARIANT", "MODULE_DUPLICATE_ID", "A module is registered twice.");
    if (!moduleManifest.name) throw new AppError("INVARIANT", "MODULE_INVALID_NAME", "A module manifest has an invalid name.");
    if (!SEMVER_PATTERN.test(moduleManifest.version)) throw new AppError("INVARIANT", "MODULE_INVALID_VERSION", "A module manifest has an invalid version.");
    if (moduleManifest.kind !== "core" && moduleManifest.kind !== "optional") throw new AppError("INVARIANT", "MODULE_INVALID_KIND", "A module manifest has an invalid kind.");
    if (moduleManifest.kind === "core" && moduleManifest.parent !== undefined) throw new AppError("INVARIANT", "MODULE_CORE_PARENT", "A core module cannot have a parent.");
    if (new Set(moduleManifest.requires).size !== moduleManifest.requires.length || moduleManifest.requires.some((id) => !APP_ID_PATTERN.test(id))) {
      throw new AppError("INVARIANT", "MODULE_INVALID_REQUIRES", "A module manifest has invalid requirements.");
    }
    byId.set(moduleManifest.id, moduleManifest);
  }
  for (const moduleManifest of modules) {
    if (moduleManifest.parent !== undefined && !byId.has(moduleManifest.parent)) throw new AppError("INVARIANT", "MODULE_UNKNOWN_PARENT", "A module manifest names an unknown parent.");
    for (const required of moduleManifest.requires) {
      if (!byId.has(required)) throw new AppError("INVARIANT", "MODULE_UNKNOWN_REQUIREMENT", "A module manifest names an unknown requirement.");
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new AppError("INVARIANT", "MODULE_DEPENDENCY_CYCLE", "The module dependency graph contains a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    const moduleManifest = byId.get(id)!;
    for (const next of [...moduleManifest.requires, ...(moduleManifest.parent ? [moduleManifest.parent] : [])]) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const moduleManifest of modules) visit(moduleManifest.id);
  const frozen = Object.freeze(modules);
  return Object.freeze({ modules: frozen, find: (id: string) => byId.get(id) });
}

const globalForModules = globalThis as unknown as { __studioflowModuleRegistry__?: ModuleRegistry };

export function initializeModuleRegistry(manifests: readonly ModuleManifest[]): ModuleRegistry {
  const composed = composeModuleRegistry(manifests);
  const existing = globalForModules.__studioflowModuleRegistry__;
  if (existing) {
    if (JSON.stringify(existing.modules) === JSON.stringify(composed.modules)) return existing;
    throw new AppError("INVARIANT", "MODULE_REGISTRY_ALREADY_INITIALIZED", "The module registry is already initialized.");
  }
  globalForModules.__studioflowModuleRegistry__ = composed;
  return composed;
}

export function getModuleRegistry(): ModuleRegistry {
  const registry = globalForModules.__studioflowModuleRegistry__;
  if (!registry) throw new AppError("INVARIANT", "MODULE_REGISTRY_NOT_INITIALIZED", "The module registry is not initialized.");
  return registry;
}

export function resetModuleRegistryForTests(): void {
  globalForModules.__studioflowModuleRegistry__ = undefined;
}
