import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";
import { SCHEDULE_HIGHLIGHTS } from "@/apps/studioflow/domain/schedule";

type Summary = { projectsPurged: number };
type Actions = {
  runAssetCleanupAction?: (limit?: unknown) => Promise<ActionResult<Summary>>;
  getAssetCleanupPreviewAction?: () => Promise<ActionResult<{ eligibleProjects: number; retentionDays: number }>>;
  setScheduleEntriesHiddenAction?: (input: unknown) => Promise<ActionResult<unknown>>;
  setScheduleEntriesHighlightAction?: (input: unknown) => Promise<ActionResult<unknown>>;
  listScheduleBrandContactsAction?: (input: unknown) => Promise<ActionResult<unknown>>;
};

/** Executes the real StudioFlow action module with only its framework and runtime edges replaced. */
function loadActions(grants = ["studioflow.access", "studioflow.project.manage"]) {
  const source = readFileSync("src/app/(platform)/studioflow/actions.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const cleanupCalls: Array<{ limit: number; userId: string }> = [];
  const previewCalls: string[] = [];
  const retryCalls: number[] = [];
  const markCalls: Array<{ kind: string; input: Record<string, unknown> }> = [];
  const contactCalls: Array<Record<string, unknown>> = [];
  const revalidated: Array<[string, string | undefined]> = [];
  const ctx = { principal: { userId: "user-1", displayName: "Owner" }, grants };
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string, type?: string) => revalidated.push([path, type]) },
    "zod": { z },
    "@platform/core/auth": { requirePrincipalGrants: async () => ctx },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/errors": { AppError },
    "@platform/core/modules": { requireModuleEnabled: async () => undefined },
    "@platform/core/validation": { validationError },
    "@/apps/studioflow/domain/schedule": { SCHEDULE_HIGHLIGHTS },
    "@/apps/studioflow/shared": {
      P: { projectManage: "studioflow.project.manage" },
      requireCommand: (input: { grants: string[] }, permission: string) => {
        if (!input.grants.includes("studioflow.access") || !input.grants.includes(permission)) throw new AppError("FORBIDDEN", "PERMISSION_DENIED", "Permission denied.");
      },
    },
    "@/apps/presentation/public/lifecycle": { purgeArchivedProjectAssets: async () => ({ presentationSlides: 0 }), clearScheduleEntryLink: async () => ({ count: 0 }), retryPresentationAssetCleanup: async (limit: number) => { retryCalls.push(limit); return { attempted: 0, resolved: 0, failed: 0 }; } },
    "@/apps/ideas/public/lifecycle": { removeScheduleOptionUsage: async () => ({ count: 0 }) },
    "@/apps/studioflow/runtime": {
      studioFlow: {
        schedule: {
          setEntriesHidden: async (input: Record<string, unknown>) => { markCalls.push({ kind: "hidden", input }); return { changed: 1 }; },
          setEntriesHighlight: async (input: Record<string, unknown>) => { markCalls.push({ kind: "highlight", input }); return { changed: 1 }; },
          listBrandContactChoices: async (input: Record<string, unknown>) => { contactCalls.push(input); return [{ id: "contact-1", label: "Andi - 0812", vendorName: "Vendor", forBrand: true }]; },
        },
        projects: {
          runAssetCleanup: async (input: { limit: number; userId: string }) => { cleanupCalls.push({ limit: input.limit, userId: input.userId }); return { projectsPurged: 2 }; },
          previewAssetCleanup: async (input: { userId: string }) => { previewCalls.push(input.userId); return { eligibleProjects: 3, retentionDays: 90 }; },
        },
      },
    },
  };
  const exports: Actions = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return { exports, cleanupCalls, previewCalls, retryCalls, markCalls, contactCalls, revalidated };
}

it("schedule contact action validates IDs, carries the signed-in reader and does not revalidate", async () => {
  const { exports, contactCalls, revalidated } = loadActions();
  const projectId = randomUUID();
  const brandId = randomUUID();
  for (const input of [{ projectId: "bad", brandId }, { projectId, brandId: "bad" }, { projectId, brandId, extra: true }]) {
    assert.equal((await exports.listScheduleBrandContactsAction!(input)).ok, false);
  }
  assert.equal(contactCalls.length, 0);
  assert.deepEqual(await exports.listScheduleBrandContactsAction!({ projectId, brandId }), { ok: true, data: [{ id: "contact-1", label: "Andi - 0812", vendorName: "Vendor", forBrand: true }] });
  assert.deepEqual(contactCalls, [{ grants: ["studioflow.access", "studioflow.project.manage"], actorId: "user-1", projectId, brandId }]);
  assert.deepEqual(revalidated, []);
});

it("schedule mark actions validate selection and palette before calling the service", async () => {
  const { exports, markCalls, revalidated } = loadActions();
  const projectId = randomUUID();
  const entryId = randomUUID();
  for (const entryIds of [[], ["not-a-uuid"], Array.from({ length: 501 }, () => entryId)]) {
    assert.equal((await exports.setScheduleEntriesHiddenAction!({ projectId, entryIds, hidden: true })).ok, false);
  }
  assert.equal((await exports.setScheduleEntriesHighlightAction!({ projectId, entryIds: [entryId], highlight: "orange" })).ok, false);
  assert.equal(markCalls.length, 0);
  assert.deepEqual(await exports.setScheduleEntriesHiddenAction!({ projectId, entryIds: [entryId], hidden: true }), { ok: true, data: { changed: 1 } });
  assert.deepEqual(await exports.setScheduleEntriesHighlightAction!({ projectId, entryIds: [entryId], highlight: null }), { ok: true, data: { changed: 1 } });
  assert.deepEqual(markCalls.map((call) => call.kind), ["hidden", "highlight"]);
  assert.deepEqual(revalidated, [
    [`/studioflow/projects/${projectId}`, "layout"],
    [`/studioflow/projects/${projectId}`, "layout"],
  ]);
});

it("runAssetCleanupAction rejects a limit outside 1 to 100 before touching the service, and defaults to 25", async () => {
  const { exports, cleanupCalls, revalidated } = loadActions();
  for (const bad of [0, 101, -1, 2.5, "10", Number.NaN, null]) {
    const result = await exports.runAssetCleanupAction!(bad);
    assert.equal(result.ok, false, `limit ${String(bad)} must be rejected`);
    if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
  }
  assert.equal(cleanupCalls.length, 0);
  assert.equal(revalidated.length, 0);

  assert.deepEqual(await exports.runAssetCleanupAction!(), { ok: true, data: { projectsPurged: 2 } });
  assert.deepEqual(await exports.runAssetCleanupAction!(100), { ok: true, data: { projectsPurged: 2 } });
  assert.deepEqual(await exports.runAssetCleanupAction!(1), { ok: true, data: { projectsPurged: 2 } });
  assert.deepEqual(cleanupCalls.map((call) => call.limit), [25, 100, 1]);
  assert.ok(cleanupCalls.every((call) => call.userId === "user-1"), "the signed-in user is passed as the actor context");
  assert.ok(revalidated.length >= 3 && revalidated.every(([path, type]) => path === "/studioflow" && type === "layout"), "a run refreshes the StudioFlow layout");
});

it("getAssetCleanupPreviewAction returns the preview for the signed-in user and revalidates nothing", async () => {
  const { exports, previewCalls, revalidated } = loadActions();
  assert.deepEqual(await exports.getAssetCleanupPreviewAction!(), { ok: true, data: { eligibleProjects: 3, retentionDays: 90 } });
  assert.deepEqual(previewCalls, ["user-1"]);
  assert.equal(revalidated.length, 0);
});

it("runAssetCleanupAction checks StudioFlow authority before Presentation cleanup", async () => {
  for (const grants of [[], ["studioflow.access"], ["studioflow.project.manage"]]) {
    const { exports, cleanupCalls, retryCalls, revalidated } = loadActions(grants);
    const result = await exports.runAssetCleanupAction!();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "PERMISSION_DENIED");
    assert.deepEqual(retryCalls, []);
    assert.deepEqual(cleanupCalls, []);
    assert.deepEqual(revalidated, []);
  }
  const authorized = loadActions();
  assert.equal((await authorized.exports.runAssetCleanupAction!()).ok, true);
  assert.deepEqual(authorized.retryCalls, [25]);
});
