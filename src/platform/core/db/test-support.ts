import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Shared runtime support for Foundation F0 platform schema/service contract
 * tests. These tests prove race-safe database constraints and transactional
 * behavior, so they require a real disposable PostgreSQL database.
 *
 * The guard fails closed unless DATABASE_URL and PLATFORM_TEST_DATABASE_URL
 * are both set and identical, so these tests can never truncate an ordinary
 * development database.
 */
type TestDatabaseEnvironment = {
  DATABASE_URL?: string;
  PLATFORM_TEST_DATABASE_URL?: string;
};

export function requireDisposableTestDatabaseUrl(
  environment: TestDatabaseEnvironment = process.env as TestDatabaseEnvironment,
): string {
  const databaseUrl = environment.DATABASE_URL;
  const disposableUrl = environment.PLATFORM_TEST_DATABASE_URL;
  if (!databaseUrl || !disposableUrl) {
    throw new Error(
      "Platform contract tests require a disposable database: set both DATABASE_URL and PLATFORM_TEST_DATABASE_URL to the same disposable PostgreSQL URL.",
    );
  }
  if (databaseUrl !== disposableUrl) {
    throw new Error(
      "Platform contract tests refuse to run: DATABASE_URL does not equal PLATFORM_TEST_DATABASE_URL. Point both at the disposable test database.",
    );
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  } catch {
    throw new Error("Platform contract tests refuse to run: the disposable PostgreSQL URL is invalid.");
  }
  if (!/(^|[_-])(test|testing)([_-]|$)/i.test(databaseName)) {
    throw new Error(
      "Platform contract tests refuse to run: the database name must explicitly contain a test marker (for example studioflow_rebuild_test).",
    );
  }
  return databaseUrl;
}

export type TestDb = {
  prisma: PrismaClient;
  pool: Pool;
  /// Dedicated connection holding the file-level advisory lock so all
  /// Foundation disposable-DB test files serialize against the same database.
  lockClient: PoolClient;
};

const PLATFORM_TEST_LOCK_KEY = 0x4d443031;

export async function createTestDb(databaseUrl: string): Promise<TestDb> {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const lockClient = await pool.connect();
  await lockClient.query("SELECT pg_advisory_lock($1)", [PLATFORM_TEST_LOCK_KEY]);
  return { prisma, pool, lockClient };
}

const PLATFORM_TABLES = [
  "User",
  "Role",
  "UserRole",
  "RolePermission",
  "Session",
  "PlatformGeneralSettings",
  "LoginRateLimit",
].map((table) => `"platform"."${table}"`);

const AUDIT_TABLES = [`"platform"."AuditEvent"`];

/// Removes every platform row so each fixture starts clean.
export async function truncatePlatformTables(db: TestDb): Promise<void> {
  await db.pool.query(`TRUNCATE TABLE ${[...PLATFORM_TABLES, ...AUDIT_TABLES].join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeTestDb(db: TestDb): Promise<void> {
  try {
    await db.lockClient.query("SELECT pg_advisory_unlock($1)", [PLATFORM_TEST_LOCK_KEY]);
  } finally {
    db.lockClient.release();
    await db.prisma.$disconnect();
    await db.pool.end();
  }
}
