import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAppError, toSafeErrorPayload } from "@platform/core/errors";

import { getPrincipal, requirePrincipal, type RawSessionIdentity, type SessionReader } from "./index";

const VALID: RawSessionIdentity = {
  userId: "user-1",
  roleId: "role-1",
  displayName: "Designer One",
};

function readerReturning(raw: RawSessionIdentity | null): SessionReader {
  return () => raw;
}

describe("getPrincipal", () => {
  it("returns a principal for a well-formed identity", async () => {
    const principal = await getPrincipal(readerReturning(VALID));
    assert.deepEqual(principal, {
      userId: "user-1",
      roleId: "role-1",
      displayName: "Designer One",
    });
  });

  it("keeps an optional well-formed email and drops undefined", async () => {
    const withEmail = await getPrincipal(readerReturning({ ...VALID, email: "a@b.co" }));
    assert.equal(withEmail?.email, "a@b.co");

    const withoutEmail = await getPrincipal(readerReturning({ ...VALID, email: undefined }));
    assert.equal("email" in (withoutEmail ?? {}), false);
  });

  it("rejects absent identities without inventing a fallback role", async () => {
    assert.equal(await getPrincipal(readerReturning(null)), null);
    assert.equal(await getPrincipal(readerReturning(undefined as unknown as null)), null);
  });

  it("fails closed on malformed identities", async () => {
    const malformed: RawSessionIdentity[] = [
      {},
      { userId: "", roleId: "role-1", displayName: "x" },
      { userId: "user-1", roleId: "", displayName: "x" },
      { userId: "user-1", roleId: "role-1", displayName: "" },
      { userId: 42, roleId: "role-1", displayName: "x" },
      { userId: "user-1", roleId: null, displayName: "x" },
      { userId: "user-1", roleId: "role-1", displayName: "x", email: "" },
      { userId: "user-1", roleId: "role-1", displayName: "x", email: 7 },
      { userId: " ", roleId: "role-1", displayName: "x" },
      { userId: "user-1", roleId: " role-1", displayName: "x" },
    ];
    for (const raw of malformed) {
      assert.equal(await getPrincipal(readerReturning(raw)), null);
    }
  });

  it("propagates provider failures instead of misclassifying them as unauthenticated", async () => {
    const failingReader: SessionReader = () => {
      throw new Error("provider exploded");
    };
    await assert.rejects(() => getPrincipal(failingReader), /provider exploded/);
  });
});

describe("requirePrincipal", () => {
  it("returns the principal when authenticated", async () => {
    const principal = await requirePrincipal(readerReturning(VALID));
    assert.equal(principal.userId, "user-1");
  });

  it("throws the shared UNAUTHENTICATED error when no session resolves", async () => {
    try {
      await requirePrincipal(readerReturning(null));
      assert.fail("expected UNAUTHENTICATED");
    } catch (error) {
      assert.ok(isAppError(error));
      const payload = toSafeErrorPayload(error);
      assert.equal(payload.kind, "UNAUTHENTICATED");
      assert.equal(payload.code, "NO_SESSION");
    }
  });

  it("keeps UNAUTHENTICATED distinct from FORBIDDEN", async () => {
    try {
      await requirePrincipal(readerReturning(null));
    } catch (error) {
      assert.equal(toSafeErrorPayload(error).kind, "UNAUTHENTICATED");
      assert.notEqual(toSafeErrorPayload(error).kind, "FORBIDDEN");
    }
  });
});
