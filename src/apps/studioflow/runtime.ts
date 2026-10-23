import { auditWriter, notificationWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createStudioFlowService } from "./service";
import { createStudioFlowSampleRequestRead } from "./public/sample-request-read";
import { createStudioFlowSampleRequestCommand } from "./public/sample-request-command";
import { createSampleRequestNotifier } from "./sample-request-notifier";

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
export const studioFlowSampleRequestRead = createStudioFlowSampleRequestRead(prisma, { storage: objectStorage });
export const studioFlowSampleRequestCommand = createStudioFlowSampleRequestCommand(prisma, { auditWriter, runTransaction, people: peopleDirectory, storage: objectStorage, notificationWriter, masterData: createMasterDataPublicRead(prisma) });
