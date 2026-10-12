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
  const [{ PrismaClient }, { PrismaPg }, { Pool }, { APP_REGISTRATIONS, MODULE_MANIFESTS }, modules, admin, audit, transactions, developer, qrcode] = await Promise.all([
    import("@/generated/prisma/client"),
    import("@prisma/adapter-pg"),
    import("pg"),
    import("../src/app/app-registrations"),
    import("@platform/core/modules/manifest"),
    import("@platform/core/modules/admin"),
    import("@platform/core/audit/persistence"),
    import("@platform/core/db/transactions"),
    import("@platform/core/developer-access/service"),
    import("qrcode"),
  ]);
  const { initializePermissionRegistry } = await import("@platform/core/rbac/registry");
  const permissionRegistry = initializePermissionRegistry(APP_REGISTRATIONS);
  modules.initializeModuleRegistry(MODULE_MANIFESTS, permissionRegistry.permissions);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const [scope, operation, argument, extra] = process.argv.slice(2);
    const developerAccess = developer.createDeveloperAccessService({
      db: prisma,
      runTransaction: (work) => transactions.runSerializableTransaction(prisma, work),
      auditWriter: audit.createAuditEventWriter(),
      sessionSecret: process.env.SESSION_SECRET ?? "",
    });
    if (scope === "developer" && !argument && !extra && operation === "setup") {
      const enrolled = await developerAccess.enroll();
      console.log(await qrcode.toString(enrolled.authenticatorUri, { type: "terminal", small: true }));
      console.log("Authenticator setup key (shown once):");
      console.log(enrolled.secret);
      console.log("Recovery codes (shown once; store them securely):");
      for (const code of enrolled.recoveryCodes) console.log(code);
      console.log("Rotating SESSION_SECRET requires: developer reset, then developer setup.");
      return;
    }
    if (scope === "developer" && !argument && !extra && operation === "reset") {
      const result = await developerAccess.reset();
      console.log(result.changed ? "Developer access reset." : "Developer access was not enrolled; sessions and recovery codes were cleared.");
      return;
    }
    const moduleId = argument;
    if (scope !== "module" || extra || !["list", "enable", "disable"].includes(operation ?? "") || (operation !== "list" && !moduleId) || (operation === "list" && moduleId)) {
      throw new Error("Usage: npm run studioflow -- developer setup|reset | module list | enable <id> | disable <id>");
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
