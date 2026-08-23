import { AppError } from "@platform/core/errors";

/**
 * Pure permission evaluation mechanics (CORE.md §4).
 *
 * Core owns evaluation only — never the app permission vocabulary, never a
 * role catalog, and never a role-to-permission matrix. Grants are composed
 * server-side by the owning app outside this module. Unknown roles and
 * unknown permissions grant nothing; there is no admin bypass. Contextual
 * rules (membership, ownership, approval state) stay app-domain policy
 * evaluated after the base check.
 */

/** Namespaced permission identifier: `<owner>.<resource>.<action>`. */
export type PermissionId = string;

const PERMISSION_ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export function isValidPermissionId(permission: PermissionId): boolean {
  return PERMISSION_ID_PATTERN.test(permission);
}

/** Resolved grants for the current principal, composed server-side by the app. */
export type PermissionGrants = readonly string[];

function grantList(grants: PermissionGrants): readonly string[] {
  return Array.isArray(grants) ? grants : [];
}

export function hasPermission(grants: PermissionGrants, permission: PermissionId): boolean {
  return isValidPermissionId(permission) && grantList(grants).includes(permission);
}

/**
 * All-required semantics: vacuously true for an empty requirement set,
 * false when any required permission is missing or malformed.
 */
export function hasAllPermissions(
  grants: PermissionGrants,
  permissions: readonly PermissionId[],
): boolean {
  const list = grantList(grants);
  return permissions.every((permission) => isValidPermissionId(permission) && list.includes(permission));
}

/**
 * Any-of semantics: explicitly false for an empty requirement set.
 */
export function hasAnyPermission(
  grants: PermissionGrants,
  permissions: readonly PermissionId[],
): boolean {
  const list = grantList(grants);
  return permissions.some((permission) => isValidPermissionId(permission) && list.includes(permission));
}

/** Throws shared `FORBIDDEN` when the base permission is absent. */
export function requirePermission(grants: PermissionGrants, permission: PermissionId): void {
  if (!hasPermission(grants, permission)) {
    throw new AppError(
      "FORBIDDEN",
      "PERMISSION_DENIED",
      "You do not have access to perform this action.",
    );
  }
}
