import { createPromotionCoordinator } from "@/application/promotion-coordinator";
import { bqPublicCommands } from "@/apps/bq/runtime";
import { masterDataPublicCommands } from "@/apps/masterdata/runtime";

export const promotionCoordinator = createPromotionCoordinator({
  bq: bqPublicCommands,
  masterData: masterDataPublicCommands,
});
