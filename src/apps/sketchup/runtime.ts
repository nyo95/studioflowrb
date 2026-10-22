import "server-only";

import { randomUUID } from "node:crypto";

import { AppError } from "@platform/core/errors";
import { createIntegrationRouteHandler } from "@platform/core/integrations";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/public";
import { studioFlowScheduleComposer as scheduleComposer } from "@/apps/studioflow/public/schedule-composer-runtime";

import { CreateEntryRequestSchema, ResolveRequestSchema, SKETCHUP_BODY_LIMIT_BYTES } from "./contract";
import { SKETCHUP_READ_SCOPE, SKETCHUP_WRITE_SCOPE } from "./scope-grants";

/**
 * The four SketchUp integration routes (WO-SKETCHUP-01 rev 2, Stage 1a). The plugin reads a project's schedule, asks
 * StudioFlow for a new item's code, and resolves the items its materials are linked to. StudioFlow is reached only
 * through the schedule composer door, so access, codes, look-alike categories and audit are the Schedule's own.
 */

const GRANT = STUDIOFLOW_PERMISSIONS.sketchupUse;
const VIA = "sketchup";
type RouteContext = { params: Promise<{ projectId: string }> };
type Principal = { userId: string; displayName: string; grants: readonly string[] };
type ContextOption = { label: string; isFinal: boolean; brandName: string | null; productName: string | null };

function contextOf(principal: Principal) {
  return { grants: principal.grants, actor: { kind: "USER" as const, userId: principal.userId, label: principal.displayName } };
}

/** What the plugin shows for an item: the final option, else the first (A); Brand then product. */
export function scheduleTitle(options: readonly ContextOption[]): string {
  const chosen = options.find((option) => option.isFinal) ?? options[0];
  if (!chosen) return "";
  return [chosen.brandName, chosen.productName].filter((part) => part && part.trim() !== "").join(" ");
}

export const listProjects = createIntegrationRouteHandler({
  scope: SKETCHUP_READ_SCOPE,
  grant: GRANT,
  handle: ({ principal }) => scheduleComposer.listProjects(contextOf(principal)),
});

export async function readSchedule(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  return createIntegrationRouteHandler({
    scope: SKETCHUP_READ_SCOPE,
    grant: GRANT,
    handle: async ({ principal }) => {
      const context = await scheduleComposer.readContext({ ...contextOf(principal), projectId });
      return {
        project: context.project,
        entries: context.entries.map((entry) => ({ id: entry.id, code: entry.code, section: entry.section, category: entry.category, prefix: entry.prefix, title: scheduleTitle(entry.options) })),
        categoryChoices: context.categoryChoices,
      };
    },
  })(request);
}

export async function resolveEntries(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  return createIntegrationRouteHandler({
    scope: SKETCHUP_READ_SCOPE,
    grant: GRANT,
    body: ResolveRequestSchema,
    bodyLimitBytes: SKETCHUP_BODY_LIMIT_BYTES,
    handle: async ({ principal, body }) => {
      const context = await scheduleComposer.readContext({ ...contextOf(principal), projectId });
      // An item of another project, or one deleted since, resolves to null: the plugin marks that material "not linked".
      const codes = new Map(context.entries.map((entry) => [entry.id, entry.code] as const));
      return [...new Set(body.entryIds)].map((entryId) => ({ entryId, code: codes.get(entryId) ?? null }));
    },
  })(request);
}

export async function createEntry(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  return createIntegrationRouteHandler({
    scope: SKETCHUP_WRITE_SCOPE,
    grant: GRANT,
    body: CreateEntryRequestSchema,
    bodyLimitBytes: SKETCHUP_BODY_LIMIT_BYTES,
    write: true,
    handle: async ({ principal, body, transaction }) => {
      if (!transaction) throw new AppError("INVARIANT", "INTEGRATION_TRANSACTION_MISSING", "The write transaction is missing.");
      const ctx = { ...contextOf(principal), projectId, via: VIA };
      const operations = [{ op: "create_entry" as const, section: body.section, category: body.category }];
      // The composer's dry run gives the digest and the look-alike check; apply then runs in the kit's transaction.
      const preview = await scheduleComposer.previewBatch({ ...ctx, operations });
      if (!preview.valid) {
        const [first] = preview.issues;
        throw new AppError("VALIDATION", first.code, first.message);
      }
      const similar = preview.warnings.find((warning) => warning.code === "SCHEDULE_CATEGORY_SIMILAR");
      if (similar && !body.confirmNewCategory) {
        const names = similar.suggestions.map((choice) => `${choice.category}${choice.prefix ? ` (${choice.prefix})` : ""}`).join(" or ");
        throw new AppError("VALIDATION", "SKETCHUP_CATEGORY_SIMILAR", `"${body.category}" is a new category that looks like ${names}. Choose the studio category, or send confirmNewCategory to create it anyway.`);
      }
      const applied = await scheduleComposer.applyBatch(transaction, { ...ctx, operationId: randomUUID(), digest: preview.digest, operations });
      const [created] = applied.operations;
      return { entryId: created.entryId, code: created.entryCode, category: created.category, prefix: created.prefix };
    },
  })(request);
}
