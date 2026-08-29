import { createHash } from "node:crypto";

/**
 * Login rate-limiting policy (Foundation F0 locked decision).
 *
 * - Both buckets consume BEFORE credential verification.
 * - Normalized-email key: SHA-256 of the normalized email — never the raw
 *   email or any secret material — 5 attempts / 15 minutes, 30-minute block.
 * - Network key: 25 attempts / 15 minutes, 30-minute block. Forwarded
 *   client-IP headers are trusted only when the explicit server configuration
 *   AUTH_TRUST_PROXY_CLIENT_IP enables them; otherwise every request shares
 *   one non-spoofable deployment-local fallback bucket. This limitation is
 *   recorded in `.env.example` operational configuration.
 * - A limiter infrastructure failure fails login CLOSED with
 *   `INFRASTRUCTURE` — never an authentication guess, never an in-memory
 *   multi-process fallback.
 * - Successful login clears the normalized-email failure bucket only.
 *
 * This module owns POLICY ONLY. The PostgreSQL adapter lives in
 * `./limiter-postgres` (server infrastructure) and is injected at
 * composition, so the flow stays testable.
 */

export const LOGIN_EMAIL_POINTS = 5;
export const LOGIN_NETWORK_POINTS = 25;
export const LOGIN_DURATION_SECONDS = 15 * 60;
export const LOGIN_BLOCK_SECONDS = 30 * 60;

export const TRUST_PROXY_CLIENT_IP_ENV = "AUTH_TRUST_PROXY_CLIENT_IP";
/** Deployment-local fallback bucket used when forwarded IP headers are not trusted. */
export const LOGIN_NETWORK_FALLBACK_KEY = "deployment-local";

export const EMAIL_LIMITER_KEY_PREFIX = "login-email";
export const NETWORK_LIMITER_KEY_PREFIX = "login-network";

export type LoginLimitKeys = { emailKey: string; networkKey: string };

export type LoginNetworkKeySource = {
  /** The value of the forwarded client-IP header, when the deployment provides one. */
  forwardedClientIp?: string | null;
};

export type LoginLimitOutcome = {
  allowed: boolean;
  /** Seconds until the blocking limiter resets; present only when blocked. */
  retryAfterSeconds?: number;
  /** Which bucket blocked the attempt, for sanitized security-event logging only. */
  blockedBy?: "email" | "network";
};

/**
 * The limiter port. Implementations MUST be atomic across processes (a
 * shared PostgreSQL store) and MUST throw an
 * `AppError("INFRASTRUCTURE", ...)` when the store is unavailable — login
 * fails closed.
 */
export interface LoginLimiter {
  consume(keys: LoginLimitKeys): Promise<LoginLimitOutcome>;
  resetEmailBucket(emailKey: string): Promise<void>;
}

/** True only when an explicit server configuration enables forwarded IP trust. */
export function forwardedClientIpTrusted(config: Record<string, string | undefined> = process.env): boolean {
  const value = config[TRUST_PROXY_CLIENT_IP_ENV]?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/** SHA-256 hex digest — raw emails/addresses never become limiter keys. */
export function hashLimiterKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Normalized-email bucket key: SHA-256 of the already-normalized email. */
export function deriveLoginEmailKey(normalizedEmail: string): string {
  return hashLimiterKey(normalizedEmail);
}

/**
 * Network bucket key: the first forwarded client-IP entry when forwarded
 * headers are trusted, otherwise the shared deployment-local fallback.
 */
export function deriveLoginNetworkKey(
  source: { forwardedClientIp?: string | null },
  config: Record<string, string | undefined> = process.env,
): string {
  const forwarded = source.forwardedClientIp?.split(",")[0]?.trim();
  const candidate = forwardedClientIpTrusted(config) && forwarded ? forwarded : LOGIN_NETWORK_FALLBACK_KEY;
  return hashLimiterKey(candidate);
}
