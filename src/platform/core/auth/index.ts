/**
 * Provider-neutral identity boundary — public barrel (CORE.md §3, §12).
 *
 * Core defines the stable principal/session contract; provider details stay
 * inside `src/platform/core/auth`. Identity resolution is request-bound:
 * `getPrincipal()`/`requirePrincipal()` resolve live database state on every
 * call and never trust cookie/JWT claims for status, roles, or grants.
 * Missing, malformed, expired, revoked, deleted, disabled, and role-less
 * identities resolve to `null` — Core never supplies a fallback role.
 */

export type { SessionPrincipal } from "./principal";
export { isSessionPrincipal } from "./principal";

export {
  SESSION_COOKIE_NAME,
  getPrincipal,
  requirePrincipal,
  getPrincipalGrants,
  requirePrincipalGrants,
  getSessionCookieValue,
  setSessionCookie,
  clearSessionCookie,
  startSession,
  logoutCurrentSession,
  logoutAllSessions,
  currentSessionId,
  type PrincipalGrants,
} from "./request";

/** Password hashing policy — deliberate stable exports. */
export {
  PASSWORD_MIN_CODE_POINTS,
  PASSWORD_MAX_CODE_POINTS,
  countCodePoints,
  isValidPasswordLength,
  hashPassword,
  verifyPassword,
} from "./password";

/** Opaque token primitives. Only the SHA-256 digest ever reaches persistence. */
export { generateSessionToken, hashSessionToken } from "./token";

/** Revocable database session service primitives (injectable for tests/composition). */
export {
  DEFAULT_SESSION_WINDOW,
  createSession,
  resolveSession,
  revokeSessionById,
  revokeSessionByToken,
  revokeAllUserSessions,
  listUserSessions,
  type CreatedSession,
  type SessionListItem,
  type SessionWindowConfig,
} from "./session-service";

/** One-time first-owner bootstrap command (server-side only, never HTTP). */
export { bootstrapFirstOwner, type BootstrapInput, type BootstrapResult } from "./bootstrap";

/** Authenticated login composition (rate limiting + verification + session). */
export { performLogin, type LoginOutcome } from "./login";

/**
 * The single generic login failure. Unknown email, disabled user, malformed
 * input, and wrong password are indistinguishable to the client.
 */
export { loginFailureError } from "./failure";
