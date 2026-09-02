import { auditWriter, prisma, runTransaction as platformRunTransaction } from "@platform/runtime";
import type { PrismaClient } from "@/generated/prisma/client";

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
