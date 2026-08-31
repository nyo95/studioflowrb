import { auditWriter, prisma, runTransaction } from "@platform/runtime";

import { createMasterDataService } from "./service";

export const masterDataService = createMasterDataService(prisma, { auditWriter, runTransaction });
