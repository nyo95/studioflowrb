import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Shared runtime support for the MD-01 focused schema/seed contract tests.
 *
 * These tests prove race-safe database constraints, so they require a real
 * PostgreSQL database. Per the Master Data work order they may only ever run
 * against the disposable database explicitly provided via
 * MASTERDATA_TEST_DATABASE_URL. The guard below fails closed unless
 * DATABASE_URL and MASTERDATA_TEST_DATABASE_URL are both set and identical,
 * so the focused suite can never truncate an ordinary development database.
 */
export function requireDisposableTestDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  const disposableUrl = process.env.MASTERDATA_TEST_DATABASE_URL;
  if (!databaseUrl || !disposableUrl) {
    throw new Error(
      "MD-01 contract tests require a disposable database: set both DATABASE_URL and MASTERDATA_TEST_DATABASE_URL to the same disposable PostgreSQL URL.",
    );
  }
  if (databaseUrl !== disposableUrl) {
    throw new Error(
      "MD-01 contract tests refuse to run: DATABASE_URL does not equal MASTERDATA_TEST_DATABASE_URL. Point both at the disposable test database.",
    );
  }
  return databaseUrl;
}

export type TestDb = {
  prisma: PrismaClient;
  pool: Pool;
  /// Dedicated connection holding the file-level advisory lock. The lock
  /// serializes DB-backed test files across node --test worker processes so
  /// their truncates/fixtures cannot interleave on the shared disposable DB.
  lockClient: PoolClient;
};

/// Constant advisory-lock key ("MD01"). Session-scoped: PostgreSQL releases it
/// automatically if the process dies while holding it.
const MD01_TEST_LOCK_KEY = 0x4d443031;

export async function createTestDb(databaseUrl: string): Promise<TestDb> {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const lockClient = await pool.connect();
  await lockClient.query("SELECT pg_advisory_lock($1)", [MD01_TEST_LOCK_KEY]);
  return { prisma, pool, lockClient };
}

const ALL_TABLES = [
  ...[
    "Unit",
    "BusinessType",
    "Party",
    "PartyRole",
    "PartyBusinessType",
    "PartyContact",
    "PartyLink",
    "Brand",
    "BrandLink",
    "BrandSupplier",
    "Category",
    "BrandCategory",
    "Sku",
    "SkuMedia",
    "SkuPrice",
    "WorkPrice",
  ].map((table) => `"master_data"."${table}"`),
  `"platform"."AuditEvent"`,
];

/// Removes every Master Data/platform row so each fixture starts clean.
export async function truncateAllTables(db: TestDb): Promise<void> {
  await db.pool.query(`TRUNCATE TABLE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeTestDb(db: TestDb): Promise<void> {
  try {
    await db.lockClient.query("SELECT pg_advisory_unlock($1)", [MD01_TEST_LOCK_KEY]);
  } finally {
    db.lockClient.release();
    await db.prisma.$disconnect();
    await db.pool.end();
  }
}
