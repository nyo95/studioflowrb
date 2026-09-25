import crypto from "node:crypto";

import { AppError } from "@platform/core/errors";

/**
 * Signing for private asset read URLs.
 *
 * The signature is the ONLY thing authorizing a private read: the route that
 * serves the object checks a valid session, then accepts the request purely on
 * a correct HMAC over `<key>:<expires>`. A forgeable signature therefore means
 * every private object is readable by any authenticated user, so the key is
 * mandatory and there is deliberately no fallback value.
 *
 * Despite the name, `SESSION_SECRET` is not used for session tokens - those are
 * 32 random bytes from `crypto.randomBytes` in `core/auth/token.ts` and need no
 * secret. It is read here and only here.
 */

const MIN_SECRET_LENGTH = 32;

function assetSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new AppError(
      "INFRASTRUCTURE",
      "storage.asset-signing-unconfigured",
      "Private asset storage is unavailable: SESSION_SECRET is not configured.",
    );
  }
  return secret;
}

/**
 * Validate the signing key at boot so a misconfigured deployment fails on start
 * rather than serving private assets behind a guessable signature. Called from
 * the instrumentation `register()` hook.
 */
export function assertAssetSigningConfigured(): void {
  assetSigningSecret();
}

function signatureFor(key: string, expiresAt: number): string {
  return crypto
    .createHmac("sha256", assetSigningSecret())
    .update(`${key}:${expiresAt}`)
    .digest("hex");
}

export function signAssetRead(key: string, expiresAtSeconds: number): string {
  return signatureFor(key, expiresAtSeconds);
}

/**
 * Constant-time comparison: a byte-by-byte `!==` on an HMAC leaks how much of a
 * forged digest was correct, which is enough to recover a valid one token at a
 * time.
 */
export function verifyAssetRead(key: string, expiresAtSeconds: number, token: string): boolean {
  const expected = Buffer.from(signatureFor(key, expiresAtSeconds), "utf8");
  const provided = Buffer.from(token, "utf8");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
