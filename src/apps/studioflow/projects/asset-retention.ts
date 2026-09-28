import type { Prisma } from "@/generated/prisma/client";
import { momSnapshotImageKeys, parseMomSnapshot } from "../domain/mom";
import { removeUnreferenced } from "../asset-cleanup";
import { invalid, nowOf, P, requireCommand, writeAudit, type CommandContext, type Db, type StudioFlowPorts } from "../shared";

export function createAssetRetentionService(db: Db, ports: StudioFlowPorts) {
  /** The one definition of "ready for cleanup", shared by the purge and the preview so they cannot disagree. */
  async function eligibility(now: Date) {
    const settings = await db.sfSettings.findUnique({ where: { id: "studio" } });
    const retentionDays = settings?.archive_retention_days ?? 90;
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const eligible: Prisma.SfProjectWhereInput = { archived_at: { lt: cutoff }, assets_purged_at: null };
    return { retentionDays, eligible };
  }

  async function purgeExpiredArchivedAssets(input: { now?: Date; limit?: number } = {}) {
    const now = input.now ?? nowOf(ports);
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1) throw invalid("PURGE_LIMIT_INVALID", "Cleanup limit must be a positive whole number.");
    const { eligible } = await eligibility(now);
    const projects = await db.sfProject.findMany({ where: eligible, orderBy: { archived_at: "asc" }, take: limit, select: { id: true } });
    const summary = { projectsPurged: 0, deliverables: 0, momImages: 0, momSnapshotImages: 0, optionPhotos: 0, blobsRemoved: 0, blobsKeptShared: 0, blobFailures: 0, unparseableRevisions: 0 };
    const actor = { kind: "SYSTEM" as const, label: "StudioFlow asset retention" };
    for (const project of projects) {
      const claimed = await ports.runTransaction(async (tx) => {
        // Re-check archive eligibility in the claim, including a concurrent restore.
        const claim = await tx.sfProject.updateMany({ where: { id: project.id, ...eligible }, data: { assets_purged_at: now } });
        if (claim.count === 0) return null;
        const [deliverables, images, options, revisions] = await Promise.all([
          tx.sfDeliverable.findMany({ where: { project_id: project.id }, select: { storage_key: true } }),
          tx.sfMomImage.findMany({ where: { item: { document: { project_id: project.id } } }, select: { storage_key: true } }),
          tx.sfScheduleOption.findMany({ where: { entry: { project_id: project.id }, image_key: { not: null } }, select: { image_key: true } }),
          tx.sfMomRevision.findMany({ where: { document: { project_id: project.id } }, select: { id: true, snapshot: true } }),
        ]);
        const keys = new Set([...deliverables.map((row) => row.storage_key), ...images.map((row) => row.storage_key), ...options.map((row) => row.image_key!)]);
        let momSnapshotImages = 0;
        let unparseableRevisions = 0;
        const unreadableSnapshots: string[] = [];
        for (const revision of revisions) {
          const parsed = parseMomSnapshot(revision.snapshot);
          if (!parsed) {
            unparseableRevisions++;
            unreadableSnapshots.push(JSON.stringify(revision.snapshot));
            continue;
          }
          const imageKeys = momSnapshotImageKeys(parsed);
          momSnapshotImages += imageKeys.length;
          for (const key of imageKeys) keys.add(key);
          // Keep even legacy snapshot text/extra fields byte-for-byte in JSON values.
          const original = revision.snapshot as Prisma.JsonObject;
          const items = original.items as Prisma.JsonObject[];
          await tx.sfMomRevision.update({ where: { id: revision.id }, data: {
            snapshot: { ...original, items: items.map((item) => ({ ...item, images: [] })) } as Prisma.InputJsonValue,
          } });
        }
        await tx.sfDeliverable.deleteMany({ where: { project_id: project.id } });
        await tx.sfMomImage.deleteMany({ where: { item: { document: { project_id: project.id } } } });
        await tx.sfScheduleOption.updateMany({ where: { entry: { project_id: project.id }, image_key: { not: null } }, data: { image_key: null } });
        const counts = { deliverables: deliverables.length, momImages: images.length, momSnapshotImages, optionPhotos: options.length, unparseableRevisions };
        await writeAudit(ports, tx, { action: "studioflow.project.assets_purged", entityType: "project", entityId: project.id, actor, metadata: { projectId: project.id, ...counts, keysCollected: keys.size } });
        // An unreadable retained snapshot may still contain a known candidate key.
        // Preserve that object rather than leave its untouched reference dangling.
        const retainedSnapshotKeys = new Set([...keys].filter((key) => unreadableSnapshots.some((snapshot) => snapshot.includes(JSON.stringify(key)))));
        return { counts, keys: [...keys], retainedSnapshotKeys };
      });
      if (!claimed) continue;
      const blobs = await removeUnreferenced(db, ports.storage, claimed.keys, claimed.retainedSnapshotKeys);
      summary.projectsPurged++;
      for (const key of Object.keys(claimed.counts) as Array<keyof typeof claimed.counts>) summary[key] += claimed.counts[key];
      summary.blobsRemoved += blobs.blobsRemoved;
      summary.blobsKeptShared += blobs.blobsKeptShared;
      summary.blobFailures += blobs.blobFailures;
      try {
        await ports.runTransaction((tx) => writeAudit(ports, tx, { action: "studioflow.project.assets_purge_completed", entityType: "project", entityId: project.id, actor, metadata: { projectId: project.id, ...blobs } }));
      } catch {
        console.error("StudioFlow asset cleanup completion audit failed.");
      }
    }
    return summary;
  }

  return {
    purgeExpiredArchivedAssets,
    async runAssetCleanup(input: CommandContext & { now?: Date; limit?: number }) {
      requireCommand(input, P.projectManage);
      return purgeExpiredArchivedAssets(input);
    },
    /** How many archived projects the next cleanup would purge right now. Reads only; deletes and writes nothing. */
    async previewAssetCleanup(input: CommandContext & { now?: Date }) {
      requireCommand(input, P.projectManage);
      const { retentionDays, eligible } = await eligibility(input.now ?? nowOf(ports));
      return { eligibleProjects: await db.sfProject.count({ where: eligible }), retentionDays };
    },
  };
}
