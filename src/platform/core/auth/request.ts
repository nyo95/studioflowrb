import { cookies } from "next/headers";

import { AppError } from "@platform/core/errors";
import { prisma } from "@platform/core/db";

import { SESSION_COOKIE_NAME } from "./cookie-name";
export { SESSION_COOKIE_NAME } from "./cookie-name";
import {
  DEFAULT_SESSION_WINDOW,
  createSession,
  resolveSession,
  revokeSessionByToken,
  revokeAllUserSessions,
  type CreatedSession,
  type SessionClientMetadata,
} from "./session-service";
import { loadLiveGrants } from "../rbac/services";
import type { SessionPrincipal } from "./principal";

/**
 * Request-bound public identity/session functions (CORE.md §3).
 *
 * `getPrincipal()` and `requirePrincipal()` read the opaque session cookie
 * and resolve live database state on EVERY call — User status, live Role
 * assignments, both expiries, and revocation are never cached in the cookie
 * or any session/JWT store. Dependency injection for tests stays in the
 * service layer; these request functions are the public surface.
 */

export type { SessionPrincipal } from "./principal";

export type PrincipalGrants = {
  principal: SessionPrincipal;
  grants: readonly string[];
};

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  };
}

/** Reads the raw session cookie value, or `null` when absent/malformed. */
export async function getSessionCookieValue(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Persists the session cookie. Callable only inside a Server Function/Route Handler. */
export async function setSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, rawToken, cookieOptions(expiresAt));
}

/** Clears the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", { ...cookieOptions(new Date(0)), expires: new Date(0) });
}

/**
 * Resolves the current principal from the session cookie against live
 * database state, or `null` for any invalid/absent session.
 */
export async function getPrincipal(): Promise<SessionPrincipal | null> {
  const rawToken = await getSessionCookieValue();
  if (!rawToken) return null;
  const resolved = await resolveSession(prisma, rawToken, { window: DEFAULT_SESSION_WINDOW });
  if (!resolved.session) return null;
  const { session } = resolved;
  return {
    userId: session.user.id,
    roleIds: Object.freeze(session.roleIds),
    displayName: session.user.displayName,
    email: session.user.email,
  };
}

/** Resolves the current principal or throws shared `UNAUTHENTICATED`. */
export async function requirePrincipal(): Promise<SessionPrincipal> {
  const principal = await getPrincipal();
  if (!principal) {
    throw new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in to continue.");
  }
  return principal;
}

/**
 * Resolves the principal together with the union of live grants from the
 * database. Unknown persisted permission IDs never appear in `grants`.
 */
export async function getPrincipalGrants(): Promise<PrincipalGrants | null> {
  const rawToken = await getSessionCookieValue();
  if (!rawToken) return null;
  const resolved = await resolveSession(prisma, rawToken, { window: DEFAULT_SESSION_WINDOW });
  if (!resolved.session) return null;
  const { session } = resolved;
  const { grants } = await loadLiveGrants(prisma, session.user.id);
  return {
    principal: {
      userId: session.user.id,
      roleIds: Object.freeze(session.roleIds),
      displayName: session.user.displayName,
      email: session.user.email,
    },
    grants,
  };
}

/** `getPrincipalGrants` or shared `UNAUTHENTICATED`. */
export async function requirePrincipalGrants(): Promise<PrincipalGrants> {
  const result = await getPrincipalGrants();
  if (!result) {
    throw new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in to continue.");
  }
  return result;
}

// ─── Login / logout composition ───────────────────────────────────────────────

export type LoginInput = {
  email: string;
  password: string;
} & SessionClientMetadata;

/**
 * Creates a new database session for an already-verified user and hands back
 * the raw token for the cookie. Callers must invoke this only after a
 * successful credential verification inside the same Server Function.
 */
export async function startSession(userId: string, metadata: SessionClientMetadata): Promise<CreatedSession> {
  return createSession(prisma, { userId, window: DEFAULT_SESSION_WINDOW, ...metadata });
}

/** Revokes the current session row and clears the cookie (ordinary logout). */
export async function logoutCurrentSession(): Promise<void> {
  const rawToken = await getSessionCookieValue();
  if (rawToken) {
    await revokeSessionByToken(prisma, rawToken);
  }
  await clearSessionCookie();
}

/** Revokes every active session of the user ("log out all"). */
export async function logoutAllSessions(userId: string): Promise<void> {
  await revokeAllUserSessions(prisma, userId);
  await clearSessionCookie();
}

/** Session identifier exposed to presentation code only. Never a token. */
export async function currentSessionId(): Promise<string | null> {
  const rawToken = await getSessionCookieValue();
  if (!rawToken) return null;
  const resolved = await resolveSession(prisma, rawToken, { window: DEFAULT_SESSION_WINDOW });
  return resolved.session?.sessionId ?? null;
}
