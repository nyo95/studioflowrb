import "server-only";

import { purgeArchivedProjectAssets, retryPresentationAssetCleanup } from "@/apps/presentation/public/lifecycle";
import { studioFlow } from "@/apps/studioflow/runtime";

/** Composition-owned retention: optional-module data is maintained even while disabled. */
export async function purgeStudioFlowArchivedAssets(input: { now?: Date; limit?: number } = {}) {
  await retryPresentationAssetCleanup(input.limit);
  return studioFlow.projects.purgeExpiredArchivedAssets(input, purgeArchivedProjectAssets);
}
