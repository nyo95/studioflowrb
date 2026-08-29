import { hash as argon2Hash, verify as argon2Verify, type Algorithm, type Options } from "@node-rs/argon2";

/**
 * Password hashing policy (Foundation F0 locked identity decision).
 *
 * Argon2id with memoryCost 19456, timeCost 2, parallelism 1, outputLen 32.
 * Passwords are 12–128 Unicode code points; plaintext is never trimmed,
 * normalized, logged, audited, returned, or persisted — only the encoded PHC
 * hash is stored.
 */

export const PASSWORD_MIN_CODE_POINTS = 12;
export const PASSWORD_MAX_CODE_POINTS = 128;

const ARGON2_OPTIONS: Options = {
  // Algorithm.Argon2id === 2; the const enum cannot be dereferenced under
  // isolatedModules, so the locked numeric value is asserted here.
  algorithm: 2 as Algorithm,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

/** Counts Unicode code points — the locked password length unit. */
export function countCodePoints(value: string): number {
  return [...value].length;
}

/** Password policy: 12–128 Unicode code points, no trimming or normalization. */
export function isValidPasswordLength(value: string): boolean {
  const length = countCodePoints(value);
  return length >= PASSWORD_MIN_CODE_POINTS && length <= PASSWORD_MAX_CODE_POINTS;
}

/** Produces the encoded Argon2id PHC hash string for storage. */
export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

/** Verifies a candidate password against an encoded PHC hash. */
export function verifyPassword(encodedHash: string, password: string): Promise<boolean> {
  return argon2Verify(encodedHash, password, ARGON2_OPTIONS);
}

/**
 * A valid non-user dummy hash. Unknown email, malformed credentials, and
 * wrong password all perform one equivalent Argon2 verification against this
 * hash so every failure path costs the same time and leaks nothing.
 */
let dummyHashPromise: Promise<string> | undefined;

export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("T\u00A0\u200B".repeat(PASSWORD_MIN_CODE_POINTS + 4) + Math.random());
  return dummyHashPromise;
}
