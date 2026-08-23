import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { TransactionClient } from "./index";

type Expect<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

type _exportedTypeIsPrismaNamespaceTransactionClient = Expect<
  Equal<TransactionClient, Prisma.TransactionClient>
>;

async function firstCategoryId(tx: TransactionClient): Promise<string | null> {
  const rows = await tx.category.findMany({ select: { id: true }, take: 1 });
  return rows[0]?.id ?? null;
}

// Type-proves the shared client accepts functions written against the shared
// TransactionClient with no casts or app-local aliases. Never executed here.
function acceptSharedTransaction(client: PrismaClient): void {
  void client.$transaction((tx) => firstCategoryId(tx));
}

describe("core db type contracts", () => {
  it("holds under typecheck; recorded in the unit-test run", () => {
    void acceptSharedTransaction;
    assert.ok(true);
  });
});
