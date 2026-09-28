import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { runSerializableTransaction, SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS, type InteractiveTransactionClient } from "./transactions";

const tx = {} as Prisma.TransactionClient;
const conflict = () => new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });

describe("serializable transaction runner", () => {
  it("commits and returns the callback value with serializable isolation", async () => {
    const value = { committed: true };
    const client: InteractiveTransactionClient = { async $transaction(work, options) {
      assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
      return work(tx);
    } };
    assert.equal(await runSerializableTransaction(client, async (received) => { assert.equal(received, tx); return value; }), value);
  });

  it("propagates a throwing callback without retry", async () => {
    let attempts = 0;
    const error = new Error("callback failed");
    const client: InteractiveTransactionClient = { async $transaction(work) { attempts++; return work(tx); } };
    await assert.rejects(runSerializableTransaction(client, async () => { throw error; }), (actual) => actual === error);
    assert.equal(attempts, 1);
  });

  it("retries P2034 and succeeds on the final allowed attempt", async () => {
    let attempts = 0;
    const client: InteractiveTransactionClient = { async $transaction(work) {
      if (++attempts < SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS) throw conflict();
      return work(tx);
    } };
    assert.equal(await runSerializableTransaction(client, async () => "committed"), "committed");
    assert.equal(attempts, SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS);
  });

  it("rethrows the last P2034 after exhausting attempts", async () => {
    const errors: Error[] = [];
    const client: InteractiveTransactionClient = { async $transaction() { const error = conflict(); errors.push(error); throw error; } };
    await assert.rejects(runSerializableTransaction(client, async () => null), (actual) => actual === errors.at(-1));
    assert.equal(errors.length, SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS);
  });

  it("never retries a non-P2034 database error", async () => {
    let attempts = 0;
    const error = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    const client: InteractiveTransactionClient = { async $transaction() { attempts++; throw error; } };
    await assert.rejects(runSerializableTransaction(client, async () => null), (actual) => actual === error);
    assert.equal(attempts, 1);
  });
});
