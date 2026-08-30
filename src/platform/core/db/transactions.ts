import { Prisma } from "@/generated/prisma/client";

/**
 * PostgreSQL serializable transaction runner with a small bounded retry.
 * Core identity/access invariants depend on predicate reads (first owner and
 * last administrator), so the default READ COMMITTED isolation is not enough.
 */
export const SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS = 3;

export type InteractiveTransactionClient = {
  $transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: typeof Prisma.TransactionIsolationLevel.Serializable },
  ): Promise<T>;
};

function isRetryableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function runSerializableTransaction<T>(
  client: InteractiveTransactionClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await client.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionConflict(error) || attempt === SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new Error("Unreachable serializable transaction retry state");
}
