import { auditWriter, prisma, runTransaction as platformRunTransaction } from "@platform/runtime";
import type { PrismaClient } from "@/generated/prisma/client";

import { createStudioFlowService } from "./service";

function wrapRunTransaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return platformRunTransaction(async (tx) => fn(tx as unknown as PrismaClient));
}

export const studioFlowService = createStudioFlowService(prisma, {
  auditWriter,
  runTransaction: wrapRunTransaction,
});
