import { AppError } from "@platform/core/errors";

/**
 * Provider-neutral session boundary (CORE.md §3).
 *
 * Core defines the session contract only; authentication-provider details stay
 * behind an injected reader adapter. Missing, malformed, deleted, disabled,
 * and unknown-role identities must be resolved to `null` by the adapter —
 * Core never supplies a fallback role and never persists identity state.
 * Session data is presentation-only; every protected use case performs its own
 * server-side permission check.
 */

export type SessionPrincipal = {
  userId: string;
  roleId: string;
  displayName: string;
  email?: string;
};

/** Unvalidated identity claims as returned by a provider adapter. */
export type RawSessionIdentity = {
  userId?: unknown;
  roleId?: unknown;
  displayName?: unknown;
  email?: unknown;
};

/**
 * Port resolving the current request's raw identity. Returns `null` when no
 * valid identity exists (absent, deleted, disabled, or unknown role).
 * Provider/infrastructure failures throw and are not authentication failures.
 */
export type SessionReader = () => Promise<RawSessionIdentity | null> | RawSessionIdentity | null;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function validatePrincipal(raw: RawSessionIdentity): SessionPrincipal | null {
  if (!nonEmptyString(raw.userId) || !nonEmptyString(raw.roleId) || !nonEmptyString(raw.displayName)) {
    return null;
  }
  if (!("email" in raw) || raw.email === undefined) {
    return { userId: raw.userId, roleId: raw.roleId, displayName: raw.displayName };
  }
  if (!nonEmptyString(raw.email)) return null;
  return {
    userId: raw.userId,
    roleId: raw.roleId,
    displayName: raw.displayName,
    email: raw.email,
  };
}

/** Resolves the current principal, or `null` when unauthenticated or malformed. */
export async function getPrincipal(readSession: SessionReader): Promise<SessionPrincipal | null> {
  const raw = await readSession();
  if (!raw) return null;
  return validatePrincipal(raw);
}

/** Resolves the current principal or throws shared `UNAUTHENTICATED`. */
export async function requirePrincipal(readSession: SessionReader): Promise<SessionPrincipal> {
  const principal = await getPrincipal(readSession);
  if (!principal) {
    throw new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in to continue.");
  }
  return principal;
}
