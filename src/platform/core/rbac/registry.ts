import { AppError } from "@platform/core/errors";

import { isValidPermissionId, type PermissionId } from "./index";

/**
 * The one code-owned permission registry (CORE.md §4, Foundation F0 §5/§6).
 *
 * Core owns the platform permission vocabulary and the registry composition
 * mechanics; each app owns and exports its own permission IDs from its public
 * boundary and is REGISTERED into the registry by a composition root outside
 * platform (platform never imports app code). Registration entries carry
 * launcher metadata/routes — never permissions policy.
 *
 * Composition rejects malformed IDs, duplicate IDs, mismatched access
 * permissions, and duplicate app registrations. Unknown persisted grant IDs
 * grant nothing and surface as integrity failures to authorized
 * administrators.
 */

/** Platform-owned permission vocabulary (locked list). */
export const PLATFORM_PERMISSIONS = [
  "platform.settings.read",
  "platform.settings.manage",
  "platform.user.read",
  "platform.user.manage",
  "platform.role.read",
  "platform.role.manage",
  "platform.audit.read",
] as const satisfies readonly PermissionId[];

export const APP_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export type RegisteredApp = {
  appId: string;
  /** Launcher display name. */
  name: string;
  /** App root route, always absolute. */
  rootPath: string;
  /** The `<appId>.access` permission gating app entry. */
  accessPermission: PermissionId;
  permissions: readonly PermissionId[];
};

export type AppPermissionRegistrationInput = {
  appId: string;
  name: string;
  rootPath: string;
  permissions: readonly PermissionId[];
};

export type PermissionRegistry = {
  platformPermissions: readonly PermissionId[];
  apps: readonly RegisteredApp[];
  /** The full code-owned permission vocabulary (platform + registered apps). */
  permissions: readonly PermissionId[];
  /** True only for permissions present in the code-owned registry. */
  has(permission: PermissionId): boolean;
  findAppByAccessPermission(permission: PermissionId): RegisteredApp | undefined;
  findAppById(appId: string): RegisteredApp | undefined;
};

/**
 * Pure composition. Throws `AppError("INVARIANT", ...)` on any malformed,
 * duplicate, or inconsistent registration so bad vocabulary fails loudly at
 * boot instead of silently granting or dropping access.
 */
export function composePermissionRegistry(
  registrations: readonly AppPermissionRegistrationInput[],
): PermissionRegistry {
  const platformSet = new Set<string>(PLATFORM_PERMISSIONS);
  const seenPermissions = new Set<string>(platformSet);
  const seenApps = new Set<string>();
  const apps: RegisteredApp[] = [];

  for (const registration of registrations) {
    const { appId, name, rootPath, permissions } = registration;
    if (!APP_ID_PATTERN.test(appId)) {
      throw new AppError("INVARIANT", "REGISTRY_INVALID_APP_ID", "An app registration is invalid.");
    }
    if (seenApps.has(appId)) {
      throw new AppError("INVARIANT", "REGISTRY_DUPLICATE_APP", "An app is registered twice.");
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new AppError("INVARIANT", "REGISTRY_INVALID_APP_NAME", "An app registration is invalid.");
    }
    if (typeof rootPath !== "string" || !rootPath.startsWith("/") || /\s/.test(rootPath)) {
      throw new AppError("INVARIANT", "REGISTRY_INVALID_APP_PATH", "An app registration is invalid.");
    }
    const accessPermission = `${appId}.access`;
    if (!permissions.includes(accessPermission)) {
      throw new AppError("INVARIANT", "REGISTRY_MISSING_ACCESS_PERMISSION", "An app registration is invalid.");
    }
    for (const permission of permissions) {
      if (!isValidPermissionId(permission)) {
        throw new AppError("INVARIANT", "REGISTRY_MALFORMED_PERMISSION", "An app registration is invalid.");
      }
      if (seenPermissions.has(permission)) {
        throw new AppError("INVARIANT", "REGISTRY_DUPLICATE_PERMISSION", "An app registration is invalid.");
      }
      seenPermissions.add(permission);
    }
    seenApps.add(appId);
    apps.push({
      appId,
      name: name.trim(),
      rootPath,
      accessPermission,
      permissions: Object.freeze([...permissions]),
    });
  }

  // seenPermissions already contains the platform vocabulary plus every app
  // permission, deduplicated by construction.
  const allPermissions = Object.freeze([...seenPermissions]);
  const permissionSet = new Set<string>(allPermissions);

  return Object.freeze({
    platformPermissions: Object.freeze([...PLATFORM_PERMISSIONS]),
    apps: Object.freeze(apps),
    permissions: allPermissions,
    has: (permission: PermissionId) => typeof permission === "string" && permissionSet.has(permission),
    findAppByAccessPermission: (permission: PermissionId) =>
      apps.find((app) => app.accessPermission === permission),
    findAppById: (appId: string) => apps.find((app) => app.appId === appId),
  });
}

/**
 * Process-level registry storage. Backed by `globalThis` because Next.js
 * loads the instrumentation hook and the server runtime as separate module
 * instances (and hot reload re-evaluates modules): the composed registry must
 * be shared process-wide, not per module instance.
 */
const globalForRegistry = globalThis as unknown as {
  __studioflowRebuildPermissionRegistry__?: PermissionRegistry;
};

/**
 * Boot-time registration. Called by the composition root before any
 * registry-dependent code runs; initializing twice with identical
 * registrations is an idempotent no-op, and redefining the vocabulary is
 * refused.
 */
export function initializePermissionRegistry(
  registrations: readonly AppPermissionRegistrationInput[],
): PermissionRegistry {
  const existing = globalForRegistry.__studioflowRebuildPermissionRegistry__;
  const composed = composePermissionRegistry(registrations);
  if (existing) {
    if (JSON.stringify(existing.permissions) === JSON.stringify(composed.permissions)) {
      return existing;
    }
    throw new AppError("INVARIANT", "REGISTRY_ALREADY_INITIALIZED", "The permission registry is already initialized.");
  }
  globalForRegistry.__studioflowRebuildPermissionRegistry__ = composed;
  return composed;
}

/**
 * Fails closed when the registry has not been initialized: grant evaluation
 * refuses to guess the vocabulary.
 */
export function getPermissionRegistry(): PermissionRegistry {
  const registry = globalForRegistry.__studioflowRebuildPermissionRegistry__;
  if (!registry) {
    throw new AppError("INVARIANT", "REGISTRY_NOT_INITIALIZED", "The permission registry is not initialized.");
  }
  return registry;
}

/** Test/process teardown support; not part of the runtime contract. */
export function resetPermissionRegistryForTests(): void {
  globalForRegistry.__studioflowRebuildPermissionRegistry__ = undefined;
}
