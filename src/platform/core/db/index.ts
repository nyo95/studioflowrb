import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";

import { readDbPoolSettings } from "./pool-settings";

/**
 * Platform Core DB — the only module that constructs the shared Prisma client,
 * the PostgreSQL adapter, or the process-level pg pool (CORE.md §2).
 *
 * - One pool per process; limits come from non-secret environment settings
 *   with conservative defaults (see ./pool-settings).
 * - Constructing the runtime does not open connections; the pool and client
 *   connect only when Prisma performs work.
 * - In development the client/pool are cached on `globalThis` so Next.js hot
 *   reload reuses one instance. Production keeps a single module-scope
 *   instance and never caches duplicates on `globalThis`.
 */
export type TransactionClient = Prisma.TransactionClient;

type DbRuntime = {
  readonly prisma: PrismaClient;
  readonly pool: Pool;
};

const globalForCoreDb = globalThis as unknown as {
  __studioflowRebuildCoreDb__?: DbRuntime;
};

const cacheAcrossHotReload = process.env.NODE_ENV !== "production";

let currentRuntime: DbRuntime | undefined;

function createDbRuntime(): DbRuntime {
  const settings = readDbPoolSettings({
    DATABASE_URL: process.env.DATABASE_URL,
    DB_POOL_MAX: process.env.DB_POOL_MAX,
    DB_POOL_IDLE_TIMEOUT_MS: process.env.DB_POOL_IDLE_TIMEOUT_MS,
    DB_POOL_CONNECTION_TIMEOUT_MS: process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
  });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: settings.max,
    idleTimeoutMillis: settings.idleTimeoutMillis,
    connectionTimeoutMillis: settings.connectionTimeoutMillis,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

function getDbRuntime(): DbRuntime {
  if (currentRuntime) return currentRuntime;
  const cached = cacheAcrossHotReload ? globalForCoreDb.__studioflowRebuildCoreDb__ : undefined;
  if (cached) {
    currentRuntime = cached;
    return currentRuntime;
  }
  const runtime = createDbRuntime();
  currentRuntime = runtime;
  if (cacheAcrossHotReload) globalForCoreDb.__studioflowRebuildCoreDb__ = runtime;
  return runtime;
}

export const prisma: PrismaClient = getDbRuntime().prisma;

/**
 * The one process-level PostgreSQL pool. Shared infrastructure adapters that
 * need raw pool access (e.g. the PostgreSQL login limiter) consume this —
 * they must never construct their own pool.
 */
export const pool: Pool = getDbRuntime().pool;

/**
 * Closes the shared client and pool for short-lived scripts and tests.
 * Server processes must not call this. After closing, the current runtime is
 * discarded so a later import rebuilds instead of handing out closed handles.
 */
export async function closePrismaConnection(): Promise<void> {
  const runtime = currentRuntime;
  currentRuntime = undefined;
  if (runtime && globalForCoreDb.__studioflowRebuildCoreDb__ === runtime) {
    globalForCoreDb.__studioflowRebuildCoreDb__ = undefined;
  }
  if (!runtime) return;
  await runtime.prisma.$disconnect();
  await runtime.pool.end();
}
