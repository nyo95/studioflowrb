/**
 * The locked session principal shape (CORE.md §3).
 *
 * `roleIds` is stable presentation/debug context only — never trusted grants.
 * Effective permissions are resolved server-side from persisted policy on
 * every protected request.
 */

export type SessionPrincipal = {
  userId: string;
  roleIds: readonly string[];
  displayName: string;
  email: string;
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

export function isSessionPrincipal(value: unknown): value is SessionPrincipal {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SessionPrincipal>;
  if (!nonEmptyString(candidate.userId)) return false;
  if (!nonEmptyString(candidate.displayName)) return false;
  if (!nonEmptyString(candidate.email)) return false;
  if (!Array.isArray(candidate.roleIds) || candidate.roleIds.length === 0) return false;
  return candidate.roleIds.every((roleId) => typeof roleId === "string" && roleId.length > 0);
}
