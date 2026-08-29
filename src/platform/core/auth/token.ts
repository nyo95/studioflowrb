import { createHash, randomBytes } from "node:crypto";

/**
 * Session token primitives (Foundation F0 locked identity decision).
 *
 * - Raw browser tokens are 32 random bytes from `crypto.randomBytes`,
 *   encoded base64url — opaque, high-entropy, never persisted.
 * - The database verifier is the lowercase hex SHA-256 digest of the raw
 *   token; only the digest is stored or compared.
 */

const TOKEN_BYTES = 32;

/** Generates an opaque session token for the browser cookie. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** One-way database verifier for a raw session token (lowercase hex SHA-256). */
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
