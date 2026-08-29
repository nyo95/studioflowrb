import { config as loadEnv } from "dotenv";
// Local development convention: .env.local first, .env as fallback. Existing
// environment variables always win.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
import { readFileSync } from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "@/generated/prisma/client";
import { bootstrapFirstOwner } from "@platform/core/auth/bootstrap";
import { createAuditEventWriter } from "@platform/core/audit/persistence";

/**
 * One-time first-owner bootstrap CLI (Foundation F0 §6; CORE.md §3).
 *
 * Usage:
 *   npx tsx scripts/bootstrap.ts <email> <display-name>
 *   (the password is read from STDIN and is never printed or logged)
 *
 * The command refuses while any ACTIVE user exists, creates the
 * `platform-owner` system role with explicit registry grants, the owner
 * account, the assignment, and the audit event in one transaction. It is a
 * server-side command only — there is no HTTP route.
 *
 * Script-only client construction: this CLI is a short-lived operator tool
 * (mirroring the disposable-DB test support), not part of the served app,
 * so it does not import the request-bound `@platform/core/db` runtime.
 */

async function readPassword(): Promise<string> {
  const stdin = readFileSync(0, "utf8");
  const password = stdin.replace(/\r?\n$/, "");
  if (password.length === 0) {
    console.error("No password received on STDIN. Bootstrap aborted.");
    process.exit(1);
  }
  return password;
}

async function main(): Promise<void> {
  const [email, displayName] = process.argv.slice(2);
  if (!email || !displayName) {
    console.error("Usage: npx tsx scripts/bootstrap.ts <email> <display-name>  (password via STDIN)");
    process.exit(1);
  }
  const password = await readPassword();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await bootstrapFirstOwner(
      {
        runTransaction: (work) => prisma.$transaction(work),
        auditWriter: createAuditEventWriter(),
        now: () => new Date(),
        generateId: () => crypto.randomUUID(),
      },
      { email, displayName, password },
    );
    console.log(`Bootstrap complete: owner ${result.email} created with role platform-owner (${result.roleId}).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n")[0] : "unknown error";
  console.error(`Bootstrap failed: ${message}`);
  process.exitCode = 1;
});
