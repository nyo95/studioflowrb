import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import type { ObjectStorage } from "@platform/core/storage";
import { removeUnreferenced, retryFailedAssetCleanup } from "./asset-cleanup";
import type { Db } from "./shared";

type FailureRow = { id: string; storage_key: string; attempts: number; resolved_at: Date | null };

/** Every owner table reports unreferenced, so removeUnreferenced always attempts the delete. */
function unreferencedDb(failures: Map<string, FailureRow>) {
  const owners = ["sfDeliverable", "sfMomImage", "sfScheduleOption", "sfScheduleTemplateItem", "sfClient"];
  return {
    ...Object.fromEntries(owners.map((name) => [name, { count: async () => 0 }])),
    sfAssetCleanupFailure: {
      upsert: async ({ where, create }: { where: { storage_key: string }; create: { storage_key: string } }) => {
        const existing = failures.get(where.storage_key);
        if (existing) { existing.attempts++; existing.resolved_at = null; return existing; }
        const row = { id: randomUUID(), storage_key: create.storage_key, attempts: 1, resolved_at: null };
        failures.set(where.storage_key, row);
        return row;
      },
      updateMany: async ({ where, data }: { where: { storage_key: string; resolved_at: null }; data: { resolved_at: Date } }) => {
        const existing = failures.get(where.storage_key);
        if (!existing || existing.resolved_at !== null) return { count: 0 };
        existing.resolved_at = data.resolved_at;
        return { count: 1 };
      },
      findMany: async ({ where }: { where: { resolved_at: null } }) => {
        void where;
        return [...failures.values()].filter((row) => row.resolved_at === null);
      },
      update: async ({ where, data }: { where: { id: string }; data: { resolved_at?: Date; attempts?: { increment: number }; last_attempt_at?: Date } }) => {
        const row = [...failures.values()].find((candidate) => candidate.id === where.id)!;
        if (data.resolved_at !== undefined) row.resolved_at = data.resolved_at;
        if (data.attempts !== undefined) row.attempts += data.attempts.increment;
        return row;
      },
    },
  } as unknown as Db;
}

function storageThatFails(failingKeys: ReadonlySet<string>): ObjectStorage {
  return {
    async put() { throw new Error("not used"); },
    async putStream() { throw new Error("not used"); },
    async remove(key: string) { if (failingKeys.has(key)) throw new Error("disk unavailable"); },
    async createSignedReadUrl() { throw new Error("not used"); },
  };
}

it("records a delete failure so it survives the DB row that referenced it, and clears it once a retry succeeds", async () => {
  const failures = new Map<string, FailureRow>();
  const db = unreferencedDb(failures);

  const failing = new Set(["broken-key"]);
  assert.deepEqual(await removeUnreferenced(db, storageThatFails(failing), ["broken-key"]), { blobsRemoved: 0, blobsKeptShared: 0, blobFailures: 1 });
  assert.equal(failures.get("broken-key")?.attempts, 1);
  assert.equal(failures.get("broken-key")?.resolved_at, null);

  failing.delete("broken-key");
  assert.deepEqual(await removeUnreferenced(db, storageThatFails(failing), ["broken-key"]), { blobsRemoved: 1, blobsKeptShared: 0, blobFailures: 0 });
  assert.ok(failures.get("broken-key")?.resolved_at instanceof Date, "a later successful delete clears the earlier failure");
});

it("a bookkeeping failure never masks the real delete outcome", async () => {
  // sfAssetCleanupFailure is entirely absent, so upsert/updateMany throw — the delete result must still be reported.
  const bareDb = Object.fromEntries(["sfDeliverable", "sfMomImage", "sfScheduleOption", "sfScheduleTemplateItem", "sfClient"].map((name) => [name, { count: async () => 0 }])) as unknown as Db;
  assert.deepEqual(await removeUnreferenced(bareDb, storageThatFails(new Set(["x"])), ["x"]), { blobsRemoved: 0, blobsKeptShared: 0, blobFailures: 1 });
  assert.deepEqual(await removeUnreferenced(bareDb, storageThatFails(new Set()), ["y"]), { blobsRemoved: 1, blobsKeptShared: 0, blobFailures: 0 });
});

it("retryFailedAssetCleanup resolves what it can and leaves the rest counted for next time", async () => {
  const failures = new Map<string, FailureRow>([
    ["ok-now", { id: randomUUID(), storage_key: "ok-now", attempts: 1, resolved_at: null }],
    ["still-broken", { id: randomUUID(), storage_key: "still-broken", attempts: 2, resolved_at: null }],
  ]);
  const db = unreferencedDb(failures);

  const result = await retryFailedAssetCleanup(db, storageThatFails(new Set(["still-broken"])));
  assert.deepEqual(result, { retried: 2, resolved: 1, stillFailing: 1 });
  assert.ok(failures.get("ok-now")?.resolved_at instanceof Date);
  assert.equal(failures.get("still-broken")?.resolved_at, null);
  assert.equal(failures.get("still-broken")?.attempts, 3, "a repeat failure is counted, not silently dropped");
});

it("retryFailedAssetCleanup does nothing when there is nothing pending", async () => {
  const db = unreferencedDb(new Map());
  assert.deepEqual(await retryFailedAssetCleanup(db, storageThatFails(new Set())), { retried: 0, resolved: 0, stillFailing: 0 });
});
