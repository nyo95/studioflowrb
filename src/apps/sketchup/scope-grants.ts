import type { IntegrationScopeGrant } from "@platform/core/integrations";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";

export const SKETCHUP_READ_SCOPE = "sketchup:read";
export const SKETCHUP_WRITE_SCOPE = "sketchup:write";

/** Least-privilege token scopes: reading the schedule needs `:read`, creating an item needs `:write`; both need the module grant. */
export const SKETCHUP_SCOPE_GRANTS: readonly IntegrationScopeGrant[] = Object.freeze([
  { scope: SKETCHUP_READ_SCOPE, grant: STUDIOFLOW_PERMISSIONS.sketchupUse },
  { scope: SKETCHUP_WRITE_SCOPE, grant: STUDIOFLOW_PERMISSIONS.sketchupUse },
]);
