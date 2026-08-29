import { randomUUID } from "node:crypto";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { prisma } from "@platform/core/db";
import { createPlatformAccessService } from "@platform/core/rbac/services";
import { createPlatformSettingsService } from "@platform/core/settings";
import { createPlatformAccountService } from "@platform/core/auth/account";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Server-side composition of the platform Core services (CORE.md §12).
 * This is the ONLY place that binds Core factories to the shared Prisma
 * client and transaction runner — routes and actions consume the composed
 * singletons below.
 */

export const runTransaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
  prisma.$transaction(work);

const commonPorts = {
  runTransaction,
  auditWriter: createAuditEventWriter(),
  now: () => new Date(),
  generateId: randomUUID,
};

export const platformAccess = createPlatformAccessService({
  db: prisma,
  ...commonPorts,
});

export const platformSettings = createPlatformSettingsService({
  db: prisma,
  ...commonPorts,
});

export const platformAccount = createPlatformAccountService({
  db: prisma,
  ...commonPorts,
});
