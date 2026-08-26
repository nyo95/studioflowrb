import type { PrismaClient } from "@/generated/prisma/client";

import type { TransactionRunner } from "../application/execution-context";

/**
 * Builds the application transaction runner around whichever Prisma client
 * the composition root supplies (the shared server client in routes, a
 * disposable client in tests). Transactions open only here, at the
 * application boundary, per CORE.md §2.
 */
export function createTransactionRunner(client: Pick<PrismaClient, "$transaction">): TransactionRunner {
  return (work) => client.$transaction((tx) => work(tx));
}
