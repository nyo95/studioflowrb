import { auditWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";

import { createStudioFlowService } from "./service";

export const studioFlow = createStudioFlowService(prisma, { auditWriter, runTransaction, people: peopleDirectory, storage: objectStorage });
