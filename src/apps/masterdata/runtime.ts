import { auditWriter, prisma, runTransaction } from "@platform/runtime";

import { createMasterDataService } from "./service";
import { createMasterDataPublicRead } from "./public";

export const masterDataService = createMasterDataService(prisma, { auditWriter, runTransaction });
export const masterDataPublicRead = createMasterDataPublicRead(prisma);
export const masterDataPublicCommands = {
  validatePromotionReference: masterDataService.validatePromotionReference,
};
