import type { getPermissionRegistry } from "@platform/core/rbac/registry";

type Registry = ReturnType<typeof getPermissionRegistry>;

/**
 * A Role is not inherently scoped to one app (e.g. "Platform Owner" spans
 * several), so the group a role's checkbox sits under is derived from what
 * it actually grants — the apps its permission IDs belong to, against the
 * registered app list — never guessed from the role's name text.
 */
export function appGroupOf(appIds: readonly string[], registry: Registry): string {
  if (appIds.length === 0) return "No permissions yet";
  if (appIds.length > 1) return "Multiple apps";
  const [appId] = appIds;
  if (appId === "platform") return "Platform";
  return registry.findAppById(appId)?.name ?? appId;
}

/** Platform first, then each registered app in registry order, cross-app and empty roles last. */
export function groupPriority(group: string, registry: Registry): number {
  if (group === "Platform") return 0;
  const appIndex = registry.apps.findIndex((app) => app.name === group);
  if (appIndex >= 0) return appIndex + 1;
  if (group === "Multiple apps") return 900;
  return 999; // "No permissions yet"
}

export type RoleWithApps = { id: string; code: string; name: string; appIds: readonly string[] };
export type GroupedRole = { id: string; code: string; name: string; appGroup: string };

/** Assigns each role its app group and orders the list for display (used by the Create User roles picker). */
export function groupAndOrderRoles(roles: readonly RoleWithApps[], registry: Registry): GroupedRole[] {
  return roles
    .map((role) => ({ id: role.id, code: role.code, name: role.name, appGroup: appGroupOf(role.appIds, registry) }))
    .sort((a, b) => groupPriority(a.appGroup, registry) - groupPriority(b.appGroup, registry) || a.name.localeCompare(b.name));
}
