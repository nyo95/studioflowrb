import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it, mock } from "node:test";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@platform/core/errors";
import { createPlatformAccessService } from "../rbac/services";
import { bootstrapFirstOwner } from "./bootstrap";
import { createPlatformAccountService } from "./account";
import { performLogin } from "./login";
import { verifyPassword } from "./password";

const actor = { kind: "USER" as const, userId: "user", label: "User" };
const password = "correct horse battery staple";
const argon = createRequire(import.meta.url)("@node-rs/argon2");

describe("password boundaries", () => {
  it("finishes hashing before each transaction and does no hashing on invalid non-transactional inputs", async () => {
    let hashes = 0;
    const spy = mock.method(argon, "hash", async () => { hashes++; return "encoded"; });
    const stopped = new Error("transaction entry");
    let transactions = 0;
    const ports = {
      db: {} as PrismaClient,
      runTransaction: async <T,>(_work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
        transactions++;
        assert.equal(hashes, transactions, "one completed hash before opening each transaction");
        throw stopped;
      },
      auditWriter: { write: async () => undefined }, now: () => new Date(), generateId: () => "id",
    };
    try {
      const access = createPlatformAccessService(ports);
      const account = createPlatformAccountService(ports);
      const user = { actor, grants: ["platform.user.manage"], email: "user@example.com", displayName: "User", password };
      const bootstrap = { email: user.email, displayName: user.displayName, password, permissionIds: ["platform.user.manage"] };
      for (const call of [
        () => access.createUser(user),
        () => access.setUserPassword({ ...user, userId: "user" }),
        () => account.changeOwnPassword({ userId: "user", currentPassword: password, newPassword: password }),
        () => bootstrapFirstOwner(ports, bootstrap),
      ]) await assert.rejects(call(), (error) => error === stopped);
      assert.equal(hashes, 4);
      for (const call of [
        () => access.createUser({ ...user, grants: [], password: "short" }),
        () => access.createUser({ ...user, email: "bad" }),
        () => access.createUser({ ...user, displayName: "" }),
        () => access.createUser({ ...user, password: "short" }),
        () => access.setUserPassword({ ...user, userId: "user", grants: [] }),
        () => access.setUserPassword({ ...user, userId: "user", password: "short" }),
        () => account.changeOwnPassword({ userId: "user", currentPassword: password, newPassword: "short" }),
        () => bootstrapFirstOwner(ports, { ...bootstrap, permissionIds: [] }),
        () => bootstrapFirstOwner(ports, { ...bootstrap, password: "short" }),
      ]) await assert.rejects(call(), (error) => error instanceof AppError);
      assert.equal(hashes, 4);
      assert.equal(transactions, 4);
    } finally { spy.mock.restore(); }
  });

  it("treats malformed PHC hashes as failed verification and generic login failure", async () => {
    for (const hash of ["", "corrupt", "$argon2id$broken"]) assert.equal(await verifyPassword(hash, password), false);
    let resets = 0;
    const db = { user: { findUnique: async () => ({ id: "u", email: "user@example.com", status: "ACTIVE", password_hash: "corrupt" }) } } as unknown as PrismaClient;
    await assert.rejects(performLogin({ db, limiter: {
      consume: async () => ({ allowed: true }), resetEmailBucket: async () => { resets++; },
    } }, { email: "user@example.com", password, networkKeySource: {} }), (error) => error instanceof AppError && error.code === "LOGIN_FAILED");
    assert.equal(resets, 0);
  });

  it("keeps the current-password check inside the transaction and rejects a corrupt hash before writes", async () => {
    const tx = { user: { findUnique: async () => ({ id: "user", status: "ACTIVE", password_hash: "corrupt" }) } } as unknown as Prisma.TransactionClient;
    let transactions = 0;
    const account = createPlatformAccountService({
      db: {} as PrismaClient,
      runTransaction: async (work) => { transactions++; return work(tx); },
      auditWriter: { write: async () => assert.fail("no audit on failure") },
      now: () => new Date(), generateId: () => "id",
    });
    await assert.rejects(account.changeOwnPassword({ userId: "user", currentPassword: password, newPassword: password }),
      (error) => error instanceof AppError && error.code === "CURRENT_PASSWORD_INCORRECT");
    assert.equal(transactions, 1);
  });
});
