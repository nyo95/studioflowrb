import { createIntegrationRouteHandler, INTEGRATION_PING_GRANT, INTEGRATION_PING_SCOPE } from "@platform/core/integrations";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = createIntegrationRouteHandler({
  scope: INTEGRATION_PING_SCOPE,
  grant: INTEGRATION_PING_GRANT,
  handle: ({ principal }) => ({ userId: principal.userId, displayName: principal.displayName, scopes: principal.scopes, serverTime: new Date().toISOString(), apiVersion: "v1" }),
});

export const POST = createIntegrationRouteHandler({
  scope: INTEGRATION_PING_SCOPE,
  grant: INTEGRATION_PING_GRANT,
  write: true,
  body: z.object({ value: z.string().max(80).optional() }).strict(),
  handle: ({ body }) => ({ echoed: body.value ?? null, apiVersion: "v1" }),
});
