import "server-only";

import { AppError } from "@platform/core/errors";
import { createIntegrationRouteHandler } from "@platform/core/integrations";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { studioFlowScheduleComposer as scheduleComposer } from "@/apps/studioflow/public/schedule-composer-runtime";

import { ApplyRequestSchema, PreviewRequestSchema, SCHEDULE_ASSISTANT_BODY_LIMIT_BYTES, SearchQuerySchema, SectionQuerySchema } from "./contract";
import { SCHEDULE_ASSISTANT_READ_SCOPE, SCHEDULE_ASSISTANT_WRITE_SCOPE } from "./scope-grants";

/**
 * The six Schedule Assistant integration routes (WO-SCHEDULE-ASSISTANT-01). Each builds the platform kit handler per
 * request so it can read the URL; the kit authenticates the token, checks scope and grant, and (for apply) holds the
 * idempotency record in the same transaction as the schedule writes. Route files only re-export these.
 */

const GRANT = STUDIOFLOW_PERMISSIONS.scheduleAssistantUse;
type RouteContext = { params: Promise<{ projectId: string }> };
type Principal = { userId: string; displayName: string; grants: readonly string[] };

function contextOf(principal: Principal) {
  return { grants: principal.grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName } };
}

function query<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown, name: string): T {
  const parsed = schema.safeParse(value ?? undefined);
  if (!parsed.success) throw new AppError("VALIDATION", "INTEGRATION_QUERY_INVALID", `The ${name} query parameter is invalid.`);
  return parsed.data;
}

export const listProjects = createIntegrationRouteHandler({
  scope: SCHEDULE_ASSISTANT_READ_SCOPE,
  grant: GRANT,
  handle: ({ principal }) => scheduleComposer.listProjects(contextOf(principal)),
});

export async function readContext(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  return createIntegrationRouteHandler({
    scope: SCHEDULE_ASSISTANT_READ_SCOPE,
    grant: GRANT,
    handle: ({ principal }) => scheduleComposer.readContext({ ...contextOf(principal), projectId }),
  })(request);
}

export async function searchBrands(request: Request) {
  const params = new URL(request.url).searchParams;
  return createIntegrationRouteHandler({
    scope: SCHEDULE_ASSISTANT_READ_SCOPE,
    grant: GRANT,
    handle: ({ principal }) => scheduleComposer.searchBrands({ ...contextOf(principal), query: query(SearchQuerySchema, params.get("q"), "q") }),
  })(request);
}

export async function searchReusableOptions(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const search = new URL(request.url).searchParams;
  return createIntegrationRouteHandler({
    scope: SCHEDULE_ASSISTANT_READ_SCOPE,
    grant: GRANT,
    handle: ({ principal }) => scheduleComposer.searchReusableOptions({
      ...contextOf(principal),
      projectId,
      query: query(SearchQuerySchema, search.get("q"), "q"),
      section: query(SectionQuerySchema, search.get("section"), "section"),
    }),
  })(request);
}

export async function previewBatch(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  return createIntegrationRouteHandler({
    scope: SCHEDULE_ASSISTANT_READ_SCOPE,
    grant: GRANT,
    body: PreviewRequestSchema,
    bodyLimitBytes: SCHEDULE_ASSISTANT_BODY_LIMIT_BYTES,
    handle: ({ principal, body }) => scheduleComposer.previewBatch({ ...contextOf(principal), projectId, operations: body.operations }),
  })(request);
}

export async function applyBatch(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  return createIntegrationRouteHandler({
    scope: SCHEDULE_ASSISTANT_WRITE_SCOPE,
    grant: GRANT,
    body: ApplyRequestSchema,
    bodyLimitBytes: SCHEDULE_ASSISTANT_BODY_LIMIT_BYTES,
    write: true,
    handle: ({ principal, body, transaction }) => {
      if (!transaction) throw new AppError("INVARIANT", "INTEGRATION_TRANSACTION_MISSING", "The write transaction is missing.");
      return scheduleComposer.applyBatch(transaction, { ...contextOf(principal), projectId, ...body });
    },
  })(request);
}
