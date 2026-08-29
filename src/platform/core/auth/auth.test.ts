import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAppError, toSafeErrorPayload } from "@platform/core/errors";

import { isSessionPrincipal } from "./principal";
import {
  countCodePoints,
  hashPassword,
  isValidPasswordLength,
  verifyPassword,
} from "./password";
import { generateSessionToken, hashSessionToken } from "./token";
import {
  DEFAULT_SESSION_WINDOW,
  type SessionWindowConfig,
} from "./session-service";

describe("session principal shape", () => {
  it("accepts the locked multi-role principal shape", () => {
    assert.equal(
      isSessionPrincipal({
        userId: "user-1",
        roleIds: ["role-1", "role-2"],
        displayName: "Designer One",
        email: "designer@example.com",
      }),
      true,
    );
  });

  it("rejects malformed principals", () => {
    const malformed = [
      null,
      {},
      { userId: "", roleIds: ["r"], displayName: "x", email: "a@b.co" },
      { userId: "u", roleIds: [], displayName: "x", email: "a@b.co" },
      { userId: "u", roleIds: ["r"], displayName: "", email: "a@b.co" },
      { userId: "u", roleIds: ["r"], displayName: "x", email: "" },
      { userId: "u", roleIds: "r", displayName: "x", email: "a@b.co" },
      { userId: 42, roleIds: ["r"], displayName: "x", email: "a@b.co" },
    ];
    for (const candidate of malformed) {
      assert.equal(isSessionPrincipal(candidate), false, JSON.stringify(candidate));
    }
  });
});

describe("password policy", () => {
  it("counts Unicode code points, not UTF-16 units", () => {
    assert.equal(countCodePoints("a\u00E9".repeat(6)), 12);
    assert.equal(countCodePoints("\u{1F600}".repeat(12)), 12);
  });

  it("accepts 12–128 code points without trimming or normalizing", () => {
    assert.equal(isValidPasswordLength("a".repeat(12)), true);
    assert.equal(isValidPasswordLength("a".repeat(128)), true);
    assert.equal(isValidPasswordLength(" a".repeat(6) + "      "), true);
    assert.equal(isValidPasswordLength("a".repeat(11)), false);
    assert.equal(isValidPasswordLength("a".repeat(129)), false);
    assert.equal(isValidPasswordLength(""), false);
  });

  it("hashes and verifies with encoded Argon2id PHC strings", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    assert.match(encoded, /^\$argon2id\$/);
    assert.equal(await verifyPassword(encoded, "correct horse battery staple"), true);
    assert.equal(await verifyPassword(encoded, "wrong password indeed"), false);
  });

  it("never returns plaintext from hashing", async () => {
    const password = "plaintext-must-not-leak-1234";
    const encoded = await hashPassword(password);
    assert.equal(encoded.includes(password), false);
  });
});

describe("opaque session tokens", () => {
  it("generates 32 random bytes encoded base64url", () => {
    const token = generateSessionToken();
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(token, generateSessionToken());
  });

  it("hashes tokens to a deterministic lowercase hex SHA-256 digest", () => {
    const token = generateSessionToken();
    const digest = hashSessionToken(token);
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.equal(hashSessionToken(token), digest);
    assert.equal(digest.includes(token), false);
  });
});

describe("session window defaults", () => {
  it("locks the 12h idle / 7d absolute / 15min touch intervals", () => {
    const window: SessionWindowConfig = DEFAULT_SESSION_WINDOW;
    assert.equal(window.idleMs, 12 * 60 * 60 * 1000);
    assert.equal(window.absoluteMs, 7 * 24 * 60 * 60 * 1000);
    assert.equal(window.touchIntervalMs, 15 * 60 * 1000);
  });
});
