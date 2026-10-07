import { auditWriter, notificationWriter, prisma, runTransaction } from "@platform/runtime";

import { createMasterDataService } from "./service";
import { createMasterDataPublicRead } from "./public";
import { createSampleRequestResolvedNotifier } from "./sample-request-notifier";

export const masterDataService = createMasterDataService(prisma, {
  auditWriter,
  runTransaction,
  sampleRequestNotifier: createSampleRequestResolvedNotifier({ writer: notificationWriter }),
});
export const masterDataPublicRead = createMasterDataPublicRead(prisma);
export const masterDataPublicCommands = {
  startSampleRequestIntake: masterDataService.startSampleRequestIntake,
  recordSampleQuote: masterDataService.recordSampleQuote,
  markSampleRequestPriced: masterDataService.markSampleRequestPriced,
  syncSampleQuoteToPrice: masterDataService.syncSampleQuoteToPrice,
  declineSampleRequest: masterDataService.declineSampleRequest,
  listSampleRequestIntakes: masterDataService.listSampleRequestIntakes,
  shelveSampleFromIntake: masterDataService.shelveSampleFromIntake,
  setSampleStatus: masterDataService.setSampleStatus,
  listPromotionReferences: masterDataService.listPromotionReferences,
  validatePromotionReference: masterDataService.validatePromotionReference,
};
