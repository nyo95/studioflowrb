import { requirePrincipalGrants } from "@platform/core/auth";
import { requirePermission } from "@platform/core/rbac";
import type { MasterDataExecutionContext } from "../application/execution-context";
import { MASTERDATA_ACCESS } from "../application/masterdata-permissions";

/**
 * Request-scoped execution context for every existing Master Data page,
 * action, and import/export handler (Foundation F0 §9).
 *
 * Identity resolves from the Core session/principal port on EVERY request:
 * opaque session cookie → live database session → active User → live Roles →
 * live registered grants. The previous environment-configured operator
 * adapter (MASTERDATA_OPERATOR_*) was removed with Foundation F0 — there is
 * no development bypass and no process-wide operator identity.
 *
 * App entry requires `masterdata.access`; each application service keeps its
 * own use-case permission checks on top of these base grants.
 */
export async function requireMasterDataRequestContext(): Promise<MasterDataExecutionContext> {
  const { principal, grants } = await requirePrincipalGrants();
  requirePermission(grants, MASTERDATA_ACCESS);
  return {
    grants,
    actor: {
      kind: "USER",
      userId: principal.userId,
      label: principal.displayName,
    },
  };
}
