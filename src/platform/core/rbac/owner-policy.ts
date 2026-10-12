import type { PermissionRegistry } from "./registry";

/** The one locked business-owner role. Developer authority remains separate. */
export const PLATFORM_OWNER_ROLE_CODE = "platform-owner";

export function isPlatformOwnerOnlyPermission(permissionId: string): boolean {
  return permissionId.startsWith("platform.");
}

/**
 * Platform Owner receives every Developer-enabled capability, but never job
 * positions such as Designer/Drafter. Positions describe who a person is in
 * an app; they are not administrative authority.
 */
export function platformOwnerEffectivePermissionIds(
  registry: PermissionRegistry,
  enabledPermissionIds: readonly string[],
): readonly string[] {
  const positionIds = new Set(registry.apps.flatMap((app) => app.positions.map((position) => position.permission)));
  return Object.freeze(enabledPermissionIds.filter((permissionId) => registry.has(permissionId) && !positionIds.has(permissionId)));
}
