import "server-only";

import { auditWriter, notificationWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createStudioFlowIdeasBridge } from "./ideas-bridge";

export const studioFlowIdeasBridge = createStudioFlowIdeasBridge(prisma, {
  auditWriter,
  runTransaction,
  people: peopleDirectory,
  storage: objectStorage,
  notificationWriter,
  masterData: createMasterDataPublicRead(prisma),
});
