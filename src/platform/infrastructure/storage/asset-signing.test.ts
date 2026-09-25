import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import { AppError } from "@platform/core/errors";

import {
  assertAssetSigningConfigured,
  signAssetRead,
  verifyAssetRead,
} from "./asset-signing";

/**
 * The private read route authorizes on this HMAC alone, so the cases that matter
 * are: no usable key is ever silently substituted, and a signature is bound to
 * both the object key and its expiry.
 */

const original = process.env.SESSION_SECRET;

function withSecret(value: string | undefined): void {
  if (value === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = value;
}

afterEach(() => {
  withSecret(original);
});

describe("private asset signing", () => {
  it("refuses to sign when SESSION_SECRET is absent, rather than using a default", () => {
    withSecret(undefined);
    assert.throws(
      () => signAssetRead("mom/1/photo.png", 1_800_000_000),
      (error: unknown) =>
        error instanceof AppError && error.code === "storage.asset-signing-unconfigured",
    );
  });

  it("refuses a key shorter than 32 characters", () => {
    withSecret("too-short");
    assert.throws(() => signAssetRead("mom/1/photo.png", 1_800_000_000), AppError);
  });

  it("reports unconfigured at boot validation", () => {
    withSecret(undefined);
    assert.throws(() => assertAssetSigningConfigured(), AppError);
    withSecret("a".repeat(32));
    assert.doesNotThrow(() => assertAssetSigningConfigured());
  });

  it("accepts its own signature and rejects a tampered one", () => {
    withSecret("k".repeat(48));
    const token = signAssetRead("mom/1/photo.png", 1_800_000_000);
    assert.equal(verifyAssetRead("mom/1/photo.png", 1_800_000_000, token), true);
    assert.equal(verifyAssetRead("mom/1/photo.png", 1_800_000_001, token), false);
  });

  it("binds the signature to the object key, not just the expiry", () => {
    withSecret("k".repeat(48));
    const token = signAssetRead("mom/1/photo.png", 1_800_000_000);
    assert.equal(verifyAssetRead("mom/2/other.png", 1_800_000_000, token), false);
  });

  it("rejects a token signed under a different key", () => {
    withSecret("k".repeat(48));
    const token = signAssetRead("mom/1/photo.png", 1_800_000_000);
    withSecret("j".repeat(48));
    assert.equal(verifyAssetRead("mom/1/photo.png", 1_800_000_000, token), false);
  });

  it("rejects the historical hardcoded fallback key and forgeries made with it", () => {
    // The literal that used to be the silent default is too short to configure,
    // so it can never be reintroduced as a working key by accident.
    withSecret("local-storage-secret");
    assert.throws(() => assertAssetSigningConfigured(), AppError);

    // And a token forged with the old public constant must not validate now.
    const forged = createHmac("sha256", "local-storage-secret")
      .update("mom/1/photo.png:1800000000")
      .digest("hex");
    withSecret("k".repeat(48));
    assert.equal(verifyAssetRead("mom/1/photo.png", 1_800_000_000, forged), false);
  });
});
