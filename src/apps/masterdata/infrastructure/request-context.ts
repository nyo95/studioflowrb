import { AppError } from "@platform/core/errors";
import { isValidPermissionId, type PermissionGrants } from "@platform/core/rbac";
import type { MasterDataExecutionContext } from "../application/execution-context";
import { MASTERDATA_PERMISSIONS } from "../application/masterdata-permissions";

const knownPermissions = new Set<string>(MASTERDATA_PERMISSIONS);
let cached: MasterDataExecutionContext | undefined;

/**
 * Explicit local/operator identity adapter used until the owner selects a
 * persisted identity provider. It has no defaults and grants nothing unless
 * every value is supplied by trusted server configuration.
 *
 * This is deliberately unavailable in production: deploying a process-wide
 * operator identity as end-user authentication would be an admin bypass.
 */
function configuredOperatorContext(): MasterDataExecutionContext {
  if (cached) return cached;
  if (process.env.NODE_ENV === "production") {
    throw new AppError("UNAUTHENTICATED", "IDENTITY_PROVIDER_REQUIRED", "Authentication is not configured for Master Data.");
  }
  const userId = process.env.MASTERDATA_OPERATOR_USER_ID?.trim();
  const label = process.env.MASTERDATA_OPERATOR_LABEL?.trim();
  const rawGrants = process.env.MASTERDATA_OPERATOR_GRANTS?.split(",").map((grant) => grant.trim()).filter(Boolean) ?? [];
  if (!userId || !label || rawGrants.length === 0) {
    throw new AppError("UNAUTHENTICATED", "LOCAL_OPERATOR_NOT_CONFIGURED", "Configure an explicit local Master Data operator before using protected screens.");
  }
  if (rawGrants.some((grant) => !isValidPermissionId(grant) || !knownPermissions.has(grant))) {
    throw new AppError("FORBIDDEN", "LOCAL_OPERATOR_GRANTS_INVALID", "The configured Master Data grants are invalid.");
  }
  cached = Object.freeze({ grants: Object.freeze([...new Set(rawGrants)]) as PermissionGrants, actor: Object.freeze({ kind: "USER" as const, userId, label }) });
  return cached;
}

/** Lazy object keeps build-time module evaluation side-effect free. */
export const MASTER_DATA_REQUEST_CONTEXT: MasterDataExecutionContext = {
  get grants() { return configuredOperatorContext().grants; },
  get actor() { return configuredOperatorContext().actor; },
};
