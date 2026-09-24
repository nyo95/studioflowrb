import { auditWriter, prisma, runTransaction as platformRunTransaction } from "@platform/runtime";
import type { PrismaClient } from "@/generated/prisma/client";

import { createMasterDataPublicRead } from "@/apps/masterdata/public";

import { createBqService } from "./service";
import { createBqPublicRead } from "./public";

function wrapRunTransaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return platformRunTransaction(async (tx) => fn(tx as unknown as PrismaClient));
}

export const bqService = createBqService(prisma, {
  auditWriter,
  runTransaction: wrapRunTransaction,
});
export const bqPublicRead = createBqPublicRead(prisma);
export const bqPublicCommands = {
  listPromotionRequests: bqService.listPromotionRequests,
  approvePromotion: bqService.approvePromotion,
  revokeStalePromotionApproval: bqService.revokeStalePromotionApproval,
  rejectPromotion: bqService.rejectPromotion,
};

/**
 * Master Data is read one way only, through its published contract. BQ never
 * touches Master Data tables, services, or internals — a snapshot taken here is
 * a copy of a fact, not a link to it.
 */
export const masterDataRead = createMasterDataPublicRead(prisma);
