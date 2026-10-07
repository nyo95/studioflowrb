import { auditWriter, notificationWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createStudioFlowService } from "./service";
import { createStudioFlowSampleRequestRead } from "./public/sample-request-read";
import { createStudioFlowSampleRequestCommand } from "./public/sample-request-command";
import { createSampleRequestNotifier } from "./sample-request-notifier";
import { startAssetSweep } from "./asset-sweep";
import { startDeliverableExpirySweep } from "./deliverable-sweep";

export const studioFlow = createStudioFlowService(prisma, {
  auditWriter,
  runTransaction,
  people: peopleDirectory,
  storage: objectStorage,
  notificationWriter,
  masterData: createMasterDataPublicRead(prisma),
  sampleRequestNotifier: createSampleRequestNotifier({ writer: notificationWriter, people: peopleDirectory }),
});

/** Read-only sample-request contract for other apps; the shell hands it to the sample-request coordinator. */
export const studioFlowSampleRequestRead = createStudioFlowSampleRequestRead(prisma);
export const studioFlowSampleRequestCommand = createStudioFlowSampleRequestCommand(prisma, { auditWriter, runTransaction, people: peopleDirectory, storage: objectStorage, notificationWriter, masterData: createMasterDataPublicRead(prisma) });

const ASSET_SWEEP_BATCH = 25;

export function startStudioFlowAssetSweep() {
  const stopAssets = startAssetSweep(() => studioFlow.projects.purgeExpiredArchivedAssets({ limit: ASSET_SWEEP_BATCH }), process.env, ASSET_SWEEP_BATCH);
  const stopDeliverables = startDeliverableExpirySweep(() => studioFlow.phases.sweepDeliverableExpiry(), process.env);
  return () => { stopAssets?.(); stopDeliverables?.(); };
}
