import { auditWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createStudioFlowService } from "./service";
import { createStudioFlowSampleRequestRead } from "./public/sample-request-read";
import { startAssetSweep } from "./asset-sweep";

export const studioFlow = createStudioFlowService(prisma, { auditWriter, runTransaction, people: peopleDirectory, storage: objectStorage, masterData: createMasterDataPublicRead(prisma) });

/** Read-only sample-request contract for other apps; the shell hands it to the sample-request coordinator. */
export const studioFlowSampleRequestRead = createStudioFlowSampleRequestRead(prisma);

const ASSET_SWEEP_BATCH = 25;

export function startStudioFlowAssetSweep() {
  return startAssetSweep(() => studioFlow.projects.purgeExpiredArchivedAssets({ limit: ASSET_SWEEP_BATCH }), process.env, ASSET_SWEEP_BATCH);
}
