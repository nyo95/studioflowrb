import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { prisma, runSerializableTransaction } from "@platform/core/db";

import { createDeveloperAccessService } from "./service";

export const developerAccess = createDeveloperAccessService({
  db: prisma,
  runTransaction: (work) => runSerializableTransaction(prisma, work),
  auditWriter: createAuditEventWriter(),
  sessionSecret: process.env.SESSION_SECRET ?? "",
});
