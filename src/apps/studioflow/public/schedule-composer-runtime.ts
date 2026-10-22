import "server-only";

import { auditWriter, notificationWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createStudioFlowScheduleComposer } from "./schedule-composer";

export const studioFlowScheduleComposer = createStudioFlowScheduleComposer(prisma, {
  auditWriter,
  runTransaction,
  people: peopleDirectory,
  storage: objectStorage,
  notificationWriter,
  masterData: createMasterDataPublicRead(prisma),
});
