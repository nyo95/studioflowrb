import { randomUUID } from "node:crypto";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { createNotificationCenter, createNotificationRetention, createNotificationWriter } from "@platform/core/notifications/persistence";
import { createMessengerService } from "@platform/core/messenger";
import { prisma, runSerializableTransaction } from "@platform/core/db";
import { createPlatformAccessService } from "@platform/core/rbac/services";
import { createPeopleDirectory } from "@platform/core/rbac/people";
import { createPlatformSettingsService } from "@platform/core/settings";
import { createPlatformAccountService } from "@platform/core/auth/account";
import { createStorageUsageService, createUserPreferencesService } from "@platform/core/preferences";
import path from "node:path";
import { resolveStorageRoot } from "@platform/infrastructure/storage/storage-root";
import { createLocalFilesystemStorage, createLocalPublicFilesystemStorage } from "@platform/infrastructure/storage/filesystem";
import { createStorageUsageReader } from "@platform/infrastructure/storage/usage";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Server-side composition of the platform Core services (CORE.md §12).
 * This is the ONLY place that binds Core factories to the shared Prisma
 * client and transaction runner — routes and actions consume the composed
 * singletons below.
 */

export const runTransaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
  runSerializableTransaction(prisma, work);

export { prisma };

const commonPorts = {
  runTransaction,
  auditWriter: createAuditEventWriter(),
  now: () => new Date(),
  generateId: randomUUID,
};

export const auditWriter = commonPorts.auditWriter;

/** Apps write notifications inside their own transaction; people read their own inbox through the center. */
export const notificationWriter = createNotificationWriter();
export const notificationCenter = createNotificationCenter(prisma);
export const notificationRetention = createNotificationRetention(prisma);
const storageRoot = resolveStorageRoot();
const privateRootDir = path.join(storageRoot, "private-assets");
const publicRootDir = path.join(storageRoot, "public-assets");

/** Private objects (including MOM) always use signed read URLs. */
export const objectStorage = createLocalFilesystemStorage(privateRootDir);
/** Public Brand marks use a separate storage root; mutation remains server-only. */
export const brandMarkStorage = createLocalPublicFilesystemStorage(publicRootDir);

export const messenger = createMessengerService(prisma, objectStorage);

export const platformAccess = createPlatformAccessService({
  db: prisma,
  ...commonPorts,
});

export const platformSettings = createPlatformSettingsService({
  db: prisma,
  objectStorage: brandMarkStorage,
  resolveBrandMarkUrl: (key) => brandMarkStorage.createPublicReadUrl(key),
  ...commonPorts,
});

export const platformAccount = createPlatformAccountService({
  db: prisma,
  ...commonPorts,
});
export const userPreferences = createUserPreferencesService(prisma);
export const storageUsage = createStorageUsageService(createStorageUsageReader(storageRoot));

/** Name/eligibility lookup for app assignment pickers (no admin data). */
export const peopleDirectory = createPeopleDirectory(prisma);
