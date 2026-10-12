import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { AppError } from "@platform/core/errors";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOTP_SECRET_BYTES = 20;
const TOTP_STEP_SECONDS = 30;
const TOTP_KEY_INFO = "studioflow:developer:totp";

export function encodeBase32(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string): Buffer {
  const normalized = input.trim().toUpperCase().replace(/=+$/u, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new AppError("VALIDATION", "DEVELOPER_TOTP_SECRET_INVALID", "The Developer authenticator secret is invalid.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(TOTP_SECRET_BYTES));
}

export function totpAt(secret: Uint8Array, unixMilliseconds: number, digits = 6): { code: string; step: bigint } {
  const step = BigInt(Math.floor(unixMilliseconds / 1000 / TOTP_STEP_SECONDS));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return { code: String(binary % (10 ** digits)).padStart(digits, "0"), step };
}

export function verifyTotp(input: {
  secret: Uint8Array;
  code: string;
  now: Date;
  lastStep?: bigint | null;
}): bigint | null {
  const code = input.code.trim();
  if (!/^\d{6}$/u.test(code)) return null;
  const supplied = Buffer.from(code, "utf8");
  let matched: bigint | null = null;
  for (const offset of [-1, 0, 1]) {
    const candidateTime = input.now.getTime() + offset * TOTP_STEP_SECONDS * 1000;
    const candidate = totpAt(input.secret, candidateTime);
    const equal = timingSafeEqual(Buffer.from(candidate.code, "utf8"), supplied);
    if (equal && (input.lastStep === null || input.lastStep === undefined || candidate.step > input.lastStep)) {
      matched = candidate.step;
    }
  }
  return matched;
}

function encryptionKey(sessionSecret: string): Buffer {
  if (sessionSecret.length < 32) {
    throw new AppError("INFRASTRUCTURE", "DEVELOPER_ENCRYPTION_UNAVAILABLE", "Developer access is unavailable because the server secret is not configured.");
  }
  return Buffer.from(hkdfSync("sha256", Buffer.from(sessionSecret, "utf8"), Buffer.alloc(0), TOTP_KEY_INFO, 32));
}

export function encryptTotpSecret(secret: string, sessionSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(sessionSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTotpSecret(encrypted: string, sessionSecret: string): string {
  const [version, ivText, tagText, ciphertextText, extra] = encrypted.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText || extra !== undefined) {
    throw new AppError("INVARIANT", "DEVELOPER_TOTP_CIPHERTEXT_INVALID", "The Developer authenticator enrolment is invalid.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(sessionSecret), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INFRASTRUCTURE", "DEVELOPER_TOTP_DECRYPT_FAILED", "Developer access cannot read its authenticator enrolment. Reset it from the server.");
  }
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    return Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/gu, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code), "utf8").digest("hex");
}

export function createDeveloperSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeveloperSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
