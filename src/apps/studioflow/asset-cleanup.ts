import type { ObjectStorage } from "@platform/core/storage";
import type { Db } from "./shared";

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
      ]);
      if (references.some((count) => count > 0)) { result.blobsKeptShared++; continue; }
      await storage.remove(key);
      result.blobsRemoved++;
    } catch {
      result.blobFailures++;
    }
  }
  return result;
}
