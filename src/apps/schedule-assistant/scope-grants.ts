import type { IntegrationScopeGrant } from "@platform/core/integrations";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";

export const SCHEDULE_ASSISTANT_READ_SCOPE = "schedule-assistant:read";
export const SCHEDULE_ASSISTANT_WRITE_SCOPE = "schedule-assistant:write";

/** Least-privilege token scopes: reading and preview need `:read`, apply needs `:write`; both need the module grant. */
export const SCHEDULE_ASSISTANT_SCOPE_GRANTS: readonly IntegrationScopeGrant[] = Object.freeze([
  { scope: SCHEDULE_ASSISTANT_READ_SCOPE, grant: STUDIOFLOW_PERMISSIONS.scheduleAssistantUse },
  { scope: SCHEDULE_ASSISTANT_WRITE_SCOPE, grant: STUDIOFLOW_PERMISSIONS.scheduleAssistantUse },
]);
