import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeBase32, decryptTotpSecret, encodeBase32, encryptTotpSecret, totpAt, verifyTotp } from "./crypto";

describe("Developer authenticator crypto", () => {
  it("matches the RFC 6238 SHA-1 vectors", () => {
    const secret = Buffer.from("12345678901234567890", "ascii");
    const vectors = [
      [59_000, "94287082"],
      [1_111_111_109_000, "07081804"],
      [1_111_111_111_000, "14050471"],
      [1_234_567_890_000, "89005924"],
      [2_000_000_000_000, "69279037"],
      [20_000_000_000_000, "65353130"],
    ] as const;
    for (const [time, expected] of vectors) assert.equal(totpAt(secret, time, 8).code, expected);
  });

  it("accepts a six-digit code in the adjacent window and refuses replay", () => {
    const secret = Buffer.from("12345678901234567890", "ascii");
    const now = new Date("2026-10-11T12:00:00.000Z");
    const previous = totpAt(secret, now.getTime() - 30_000);
    assert.equal(verifyTotp({ secret, code: previous.code, now }), previous.step);
    assert.equal(verifyTotp({ secret, code: previous.code, now, lastStep: previous.step }), null);
  });

  it("round-trips Base32 without padding", () => {
    const value = Buffer.from("12345678901234567890", "ascii");
    assert.deepEqual(decodeBase32(encodeBase32(value)), value);
  });

  it("encrypts at rest and fails closed under a different key", () => {
    const encrypted = encryptTotpSecret("JBSWY3DPEHPK3PXP", "a".repeat(32));
    assert.equal(decryptTotpSecret(encrypted, "a".repeat(32)), "JBSWY3DPEHPK3PXP");
    assert.throws(() => decryptTotpSecret(encrypted, "b".repeat(32)), /reset it from the server/i);
  });
});
