import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";

import { getModuleRegistry } from "./manifest";

export type ModuleStateValue = "ENABLED" | "DISABLED";

type ModuleAdminClient = Pick<PrismaClient, "moduleState">;
type ModuleTransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export async function listModuleStates(db: ModuleAdminClient): Promise<Array<{ id: string; name: string; version: string; kind: "core" | "optional"; state: ModuleStateValue; lastVersion: string }>> {
  const rows = await db.moduleState.findMany();
  const byId = new Map(rows.map((row) => [row.module_id, row]));
  return getModuleRegistry().modules.map((module) => ({
    id: module.id,
    name: module.name,
    version: module.version,
    kind: module.kind,
    state: module.kind === "core" ? "ENABLED" : byId.get(module.id)?.state ?? "ENABLED",
    lastVersion: module.kind === "core" ? module.version : byId.get(module.id)?.last_version ?? module.version,
  }));
}

export async function changeModuleState(input: {
  moduleId: string;
  state: ModuleStateValue;
  runTransaction: ModuleTransactionRunner;
  auditWriter: AuditWriter;
  now?: () => Date;
}): Promise<{ changed: boolean; state: ModuleStateValue }> {
  const moduleManifest = getModuleRegistry().find(input.moduleId);
  if (!moduleManifest) throw new AppError("NOT_FOUND", "MODULE_UNKNOWN", "That module is not registered.");
  if (moduleManifest.kind === "core") throw new AppError("CONFLICT", "MODULE_CORE_STATE_REFUSED", "A core module cannot be enabled or disabled.");
  return input.runTransaction(async (tx) => {
    const current = await tx.moduleState.findUnique({ where: { module_id: moduleManifest.id } });
    const previous: ModuleStateValue = current?.state ?? "ENABLED";
    if (previous === input.state) {
      if (current?.last_version !== moduleManifest.version) {
        await tx.moduleState.upsert({
          where: { module_id: moduleManifest.id },
          create: { module_id: moduleManifest.id, state: input.state, last_version: moduleManifest.version, updated_by: "system-owner-cli" },
          update: { last_version: moduleManifest.version },
        });
      }
      return { changed: false, state: input.state };
    }
    await tx.moduleState.upsert({
      where: { module_id: moduleManifest.id },
      create: { module_id: moduleManifest.id, state: input.state, last_version: moduleManifest.version, updated_by: "system-owner-cli" },
      update: { state: input.state, last_version: moduleManifest.version, updated_by: "system-owner-cli" },
    });
    await input.auditWriter.write(prepareAuditEvent({
      appId: "platform",
      action: input.state === "ENABLED" ? "platform.module.enabled" : "platform.module.disabled",
      entityType: "module",
      entityId: moduleManifest.id,
      actor: { kind: "SYSTEM", label: "system-owner-cli" },
      changes: { state: { from: previous, to: input.state } },
      metadata: { version: moduleManifest.version },
    }, { now: input.now }), tx);
    return { changed: true, state: input.state };
  });
}
