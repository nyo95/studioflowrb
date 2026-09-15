import { auditWriter, objectStorage, peopleDirectory, prisma, runTransaction } from "@platform/runtime";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createStudioFlowService } from "./service";

export const studioFlow = createStudioFlowService(prisma, { auditWriter, runTransaction, people: peopleDirectory, storage: objectStorage, masterData: createMasterDataPublicRead(prisma) });
