import type { ObjectStorage } from "@platform/core/storage";
import type { Db } from "./shared";

const RETRY_LIMIT_DEFAULT = 50;

/**
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

/** Shared by schedule deletes and archive retention. Never remove a still-referenced object. */
export async function removeUnreferenced(db: Db, storage: ObjectStorage, keys: readonly (string | null | undefined)[], retainedSnapshotKeys: ReadonlySet<string> = new Set()) {
  const result = { blobsRemoved: 0, blobsKeptShared: 0, blobFailures: 0 };
  for (const key of new Set(keys.filter((key): key is string => !!key))) {
    if (retainedSnapshotKeys.has(key)) { result.blobsKeptShared++; continue; }
    try {
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
      if (references.some((count) => count > 0)) { result.blobsKeptShared++; continue; }
      await storage.remove(key);
      result.blobsRemoved++;
      await clearCleanupFailure(db, key);
    } catch {
      result.blobFailures++;
      await recordCleanupFailure(db, key);
    }
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
