import type { ObjectStorage } from "@platform/core/storage";
import type { Db, TxClient } from "./shared";

const RETRY_LIMIT_DEFAULT = 50;

/**
 * Retry ledger (`SfAssetCleanupFailure`): a row is either a delete that failed, or a key enqueued
 * in the same transaction that deleted its owner row and not yet confirmed removed.
 *
 * A delete failure is recorded, never just counted: by the time it fails, the row that
 * referenced the key is already gone, so this is the only remaining record of what leaked.
 * Best-effort — a bookkeeping failure here must never mask or replace the real cleanup error.
 */
async function recordCleanupFailure(db: Db, key: string): Promise<void> {
  try {
    await db.sfAssetCleanupFailure.upsert({
      where: { storage_key: key },
      create: { storage_key: key },
      update: { attempts: { increment: 1 }, last_attempt_at: new Date(), resolved_at: null },
    });
  } catch {
    // Best-effort bookkeeping; the delete outcome itself already surfaced.
  }
}

async function clearCleanupFailure(db: Db, key: string): Promise<void> {
  try {
    await db.sfAssetCleanupFailure.updateMany({ where: { storage_key: key, resolved_at: null }, data: { resolved_at: new Date() } });
  } catch {
    // Best-effort bookkeeping.
  }
}

/** True when any StudioFlow row still points at the key (MOM snapshot JSON is the MOM service's own check). */
async function isReferenced(db: Db | TxClient, key: string): Promise<boolean> {
  const references = await Promise.all([
    db.sfDeliverable.count({ where: { storage_key: key } }),
    db.sfMomImage.count({ where: { storage_key: key } }),
    db.sfScheduleOption.count({ where: { image_key: key } }),
    db.sfScheduleTemplateItem.count({ where: { image_key: key } }),
    db.sfClient.count({ where: { logo_storage_key: key } }),
    // Older isolated storage tests deliberately provide only the pre-Presentation
    // delegate subset. Runtime Prisma always has this delegate after the migration.
    ...(db.sfPresentationSlide ? [db.sfPresentationSlide.count({ where: { image_key: key } })] : []),
  ]);
  return references.some((count) => count > 0);
}

function uniqueKeys(keys: readonly (string | null | undefined)[]): string[] {
  return [...new Set(keys.filter((key): key is string => !!key))];
}

/**
 * Physically removes keys the caller has already decided are unreferenced. Every failure is
 * recorded in the retry ledger; a success resolves any earlier ledger entry for the key.
 * This is the only place a StudioFlow blob is deleted outside the retry sweep.
 */
export async function discardObjects(db: Db, storage: ObjectStorage, keys: readonly (string | null | undefined)[]) {
  const result = { removed: 0, failures: 0 };
  for (const key of uniqueKeys(keys)) {
    try {
      await storage.remove(key);
      result.removed++;
      await clearCleanupFailure(db, key);
    } catch {
      result.failures++;
      await recordCleanupFailure(db, key);
    }
  }
  return result;
}

/**
 * Puts keys into the retry ledger inside the transaction that deletes their last owner row, so the
 * row can never disappear without its blob being tracked — even if the process dies before the
 * post-commit `discardObjects` runs. Only pass keys already known to be unreferenced after the delete.
 */
export async function enqueueObjectCleanup(tx: Db | TxClient, keys: readonly (string | null | undefined)[]): Promise<string[]> {
  const unique = uniqueKeys(keys);
  for (const key of unique) {
    await tx.sfAssetCleanupFailure.upsert({
      where: { storage_key: key },
      create: { storage_key: key, attempts: 0 },
      update: { resolved_at: null },
    });
  }
  return unique;
}

/**
 * In-transaction variant for rows deleted by the caller: keeps only keys no row references any
 * more (after the caller's deletes), enqueues them, and returns them for `discardObjects`.
 */
export async function enqueueUnreferencedCleanup(tx: Db | TxClient, keys: readonly (string | null | undefined)[]): Promise<string[]> {
  const orphaned: string[] = [];
  for (const key of uniqueKeys(keys)) if (!(await isReferenced(tx, key))) orphaned.push(key);
  return enqueueObjectCleanup(tx, orphaned);
}

/** Shared by schedule/presentation deletes and archive retention. Never remove a still-referenced object. */
export async function removeUnreferenced(db: Db, storage: ObjectStorage, keys: readonly (string | null | undefined)[], retainedSnapshotKeys: ReadonlySet<string> = new Set()) {
  const result = { blobsRemoved: 0, blobsKeptShared: 0, blobFailures: 0 };
  for (const key of uniqueKeys(keys)) {
    if (retainedSnapshotKeys.has(key)) { result.blobsKeptShared++; continue; }
    let referenced: boolean;
    try {
      referenced = await isReferenced(db, key);
    } catch {
      result.blobFailures++;
      await recordCleanupFailure(db, key);
      continue;
    }
    if (referenced) { result.blobsKeptShared++; continue; }
    const discarded = await discardObjects(db, storage, [key]);
    result.blobsRemoved += discarded.removed;
    result.blobFailures += discarded.failures;
  }
  return result;
}

/**
 * Retries storage deletes that previously failed (network hiccup, disk momentarily
 * unavailable, permission blip). The owning DB row was already gone when a key first
 * failed, so there is nothing left to re-check for "still unreferenced" — only the
 * storage side can have changed between attempts.
 */
export async function retryFailedAssetCleanup(db: Db, storage: ObjectStorage, limit = RETRY_LIMIT_DEFAULT): Promise<{ retried: number; resolved: number; stillFailing: number }> {
  const pending = await db.sfAssetCleanupFailure.findMany({
    where: { resolved_at: null },
    orderBy: { first_failed_at: "asc" },
    take: limit,
  });
  let resolved = 0;
  for (const failure of pending) {
    try {
      await storage.remove(failure.storage_key);
      await db.sfAssetCleanupFailure.update({ where: { id: failure.id }, data: { resolved_at: new Date() } });
      resolved++;
    } catch {
      await db.sfAssetCleanupFailure.update({ where: { id: failure.id }, data: { attempts: { increment: 1 }, last_attempt_at: new Date() } }).catch(() => {});
    }
  }
  return { retried: pending.length, resolved, stillFailing: pending.length - resolved };
}
