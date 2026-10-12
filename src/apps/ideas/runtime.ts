import "server-only";

import { auditWriter, objectStorage, prisma, runTransaction } from "@platform/runtime";
import { studioFlowIdeasBridge } from "@/apps/studioflow/public/ideas-bridge-runtime";

import { createIdeaService } from "./service";

export const ideas = createIdeaService(prisma, {
  auditWriter,
  storage: objectStorage,
  runTransaction,
  studioFlow: studioFlowIdeasBridge,
});
