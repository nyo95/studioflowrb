import "server-only";

import { auditWriter, objectStorage, prisma, runTransaction } from "@platform/runtime";
import { studioFlowPresentationBridge } from "@/apps/studioflow/public/presentation-bridge-runtime";
import { createPresentationService } from "./service";

export const presentation = createPresentationService(prisma, {
  auditWriter,
  storage: objectStorage,
  runTransaction,
  studioFlow: studioFlowPresentationBridge,
});
