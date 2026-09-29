import { config as loadEnv } from "dotenv";
import path from "node:path";

const location = process.env.STUDIOFLOW_LOCATION;
const envFile = location === "rumah" ? ".env.rumah" : location === "kantor" ? ".env.kantor" : null;

if (!envFile) {
  throw new Error("Set STUDIOFLOW_LOCATION to rumah or kantor before running messenger cleanup.");
}

// The scheduler is a short-lived local process, so it loads only the selected
// machine's ignored configuration before importing the runtime.
loadEnv({ path: envFile });

const MAX_BATCHES = 10;
const BATCH_SIZE = 200;

async function main(): Promise<void> {
  // This is intentionally a short-lived CLI composition, like bootstrap.ts.
  // Importing the request runtime would pull in Next's server-only marker and
  // make a Windows scheduled task depend on a web-server process.
  const [{ PrismaPg }, { PrismaClient }, { Pool }, { createMessengerService }, { createLocalFilesystemStorage }] = await Promise.all([
    import("@prisma/adapter-pg"),
    import("@/generated/prisma/client"),
    import("pg"),
    import("@platform/core/messenger"),
    import("@platform/infrastructure/storage/filesystem"),
  ]);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const storageRoot = process.env.STUDIOFLOW_STORAGE_ROOT || path.join(process.cwd(), ".storage");
  const messenger = createMessengerService(prisma, createLocalFilesystemStorage(path.join(storageRoot, "private-assets")));
  let purged = 0;
  try {
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const result = await messenger.cleanupExpiredAttachments(BATCH_SIZE);
      purged += result.purged;
      if (result.purged < BATCH_SIZE) break;
    }
    console.log(`Messenger attachment cleanup complete: ${purged} expired attachment${purged === 1 ? "" : "s"} removed.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n")[0] : "Unknown error";
  console.error(`Messenger attachment cleanup failed: ${message}`);
  process.exitCode = 1;
});
