import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";

import { getModuleRegistry } from "./manifest";

type AccessReader = Pick<PrismaClient, "integrationAccess" | "user">;
type AccessTransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export type IntegrationAccessOverview = {
  modules: ReadonlyArray<{ moduleId: string; name: string; allowed: ReadonlyArray<{ userId: string; displayName: string; email: string; grantedAt: Date }> }>;
  /** Active users the Developer may add. */
  users: ReadonlyArray<{ id: string; displayName: string; email: string }>;
};

function gatedModule(moduleId: string) {
  const manifest = getModuleRegistry().find(moduleId);
  if (!manifest || manifest.kind !== "optional" || !manifest.developerAccess) {
    throw new AppError("NOT_FOUND", "INTEGRATION_ACCESS_MODULE_UNKNOWN", "That module does not use a Developer access list.");
  }
  return manifest;
}

export async function listIntegrationAccess(db: AccessReader): Promise<IntegrationAccessOverview> {
  const gated = getModuleRegistry().modules.filter((manifest) => manifest.kind === "optional" && manifest.developerAccess);
  const [rows, users] = await Promise.all([
    db.integrationAccess.findMany({ where: { module_id: { in: gated.map((manifest) => manifest.id) } }, include: { user: { select: { display_name: true, email: true } } }, orderBy: { granted_at: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, display_name: true, email: true }, orderBy: { display_name: "asc" } }),
  ]);
  return {
    modules: gated.map((manifest) => ({
      moduleId: manifest.id,
      name: manifest.name,
      allowed: rows.filter((row) => row.module_id === manifest.id).map((row) => ({ userId: row.user_id, displayName: row.user.display_name, email: row.user.email, grantedAt: row.granted_at })),
    })),
    users: users.map((user) => ({ id: user.id, displayName: user.display_name, email: user.email })),
  };
}

export async function changeIntegrationAccess(input: {
  moduleId: string;
  userId: string;
  allowed: boolean;
  runTransaction: AccessTransactionRunner;
  auditWriter: AuditWriter;
  now?: () => Date;
  actorLabel?: "developer-cli" | "developer-web";
}): Promise<{ changed: boolean }> {
  const manifest = gatedModule(input.moduleId);
  const actorLabel = input.actorLabel ?? "developer-web";
  return input.runTransaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, status: true, display_name: true } });
    if (!user) throw new AppError("NOT_FOUND", "INTEGRATION_ACCESS_USER_UNKNOWN", "That user does not exist.");
    const key = { module_id_user_id: { module_id: manifest.id, user_id: user.id } };
    const current = await tx.integrationAccess.findUnique({ where: key });
    if (input.allowed === (current !== null)) return { changed: false };
    if (input.allowed) {
      if (user.status !== "ACTIVE") throw new AppError("CONFLICT", "INTEGRATION_ACCESS_USER_INACTIVE", "Only an active user can be allowed.");
      await tx.integrationAccess.create({ data: { module_id: manifest.id, user_id: user.id, granted_by: actorLabel } });
    } else {
      await tx.integrationAccess.delete({ where: key });
    }
    await input.auditWriter.write(prepareAuditEvent({
      appId: "platform",
      action: input.allowed ? "platform.integration-access.granted" : "platform.integration-access.revoked",
      entityType: "integration_access",
      entityId: `${manifest.id}:${user.id}`,
      actor: { kind: "SYSTEM", label: actorLabel },
      metadata: { moduleId: manifest.id, userId: user.id, userName: user.display_name },
    }, { now: input.now }), tx);
    return { changed: true };
  });
}
