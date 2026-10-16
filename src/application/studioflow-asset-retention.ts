import "server-only";

import { purgeArchivedProjectAssets, reconcilePresentationScheduleLinks, retryPresentationAssetCleanup } from "@/apps/presentation/public/lifecycle";
import { studioFlow } from "@/apps/studioflow/runtime";

/** Composition-owned retention: optional-module data is maintained even while disabled. */
export async function purgeStudioFlowArchivedAssets(input: { now?: Date; limit?: number } = {}) {
  await retryPresentationAssetCleanup(input.limit);
  await reconcilePresentationScheduleLinks(input.limit).catch(() => {
    console.error("Presentation Schedule-link reconciliation failed.");
  });
  return studioFlow.projects.purgeExpiredArchivedAssets(input, purgeArchivedProjectAssets);
}
