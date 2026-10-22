import type { IntegrationScopeGrant } from "@platform/core/integrations";

export const SCHEDULE_ASSISTANT_READ_SCOPE = "schedule-assistant:read";
export const SCHEDULE_ASSISTANT_WRITE_SCOPE = "schedule-assistant:write";

/** Least-privilege token scopes: reading and preview need `:read`, apply needs `:write`; both need the Developer-granted module access. */
export const SCHEDULE_ASSISTANT_SCOPE_GRANTS: readonly IntegrationScopeGrant[] = Object.freeze([
  { scope: SCHEDULE_ASSISTANT_READ_SCOPE, module: "schedule-assistant" },
  { scope: SCHEDULE_ASSISTANT_WRITE_SCOPE, module: "schedule-assistant" },
]);
