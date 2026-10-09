import { config as loadEnv } from "dotenv";

const location = process.env.STUDIOFLOW_LOCATION;
if (location !== "rumah" && location !== "kantor") {
  console.error("Set STUDIOFLOW_LOCATION to rumah or kantor.");
  process.exit(1);
}
loadEnv({ path: `.env.${location}` });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function main(): Promise<void> {
  const [{ PrismaClient }, { PrismaPg }, { Pool }, { APP_REGISTRATIONS, MODULE_MANIFESTS }, modules, admin, audit, transactions] = await Promise.all([
    import("@/generated/prisma/client"),
    import("@prisma/adapter-pg"),
    import("pg"),
    import("../src/app/app-registrations"),
    import("@platform/core/modules/manifest"),
    import("@platform/core/modules/admin"),
    import("@platform/core/audit/persistence"),
    import("@platform/core/db/transactions"),
  ]);
  const { initializePermissionRegistry } = await import("@platform/core/rbac/registry");
  initializePermissionRegistry(APP_REGISTRATIONS);
  modules.initializeModuleRegistry(MODULE_MANIFESTS);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const [scope, operation, moduleId, extra] = process.argv.slice(2);
    if (scope !== "module" || extra || !["list", "enable", "disable"].includes(operation ?? "") || (operation !== "list" && !moduleId) || (operation === "list" && moduleId)) {
      throw new Error("Usage: npm run studioflow -- module list | enable <id> | disable <id>");
    }
    if (operation === "list") {
      const states = await admin.listModuleStates(prisma);
      console.table(states.map(({ id, version, kind, state, lastVersion }) => ({ id, version, kind, state, lastVersion })));
      return;
    }
    const result = await admin.changeModuleState({
      moduleId: moduleId!,
      state: operation === "enable" ? "ENABLED" : "DISABLED",
      runTransaction: (work) => transactions.runSerializableTransaction(prisma, work),
      auditWriter: audit.createAuditEventWriter(),
    });
    console.log(`${moduleId}: ${result.state}${result.changed ? "" : " (no change)"}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message.split("\n")[0] : "StudioFlow command failed.");
  process.exitCode = 1;
});
