import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";

type Summary = { projectsPurged: number };
type Actions = {
  runAssetCleanupAction?: (limit?: unknown) => Promise<ActionResult<Summary>>;
  getAssetCleanupPreviewAction?: () => Promise<ActionResult<{ eligibleProjects: number; retentionDays: number }>>;
};

/** Executes the real StudioFlow action module with only its framework and runtime edges replaced. */
function loadActions() {
  const source = readFileSync("src/app/(platform)/studioflow/actions.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const cleanupCalls: Array<{ limit: number; userId: string }> = [];
  const previewCalls: string[] = [];
  const revalidated: Array<[string, string | undefined]> = [];
  const ctx = { principal: { userId: "user-1", displayName: "Owner" }, grants: ["studioflow.project.manage"] };
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string, type?: string) => revalidated.push([path, type]) },
    "zod": { z },
    "@platform/core/auth": { requirePrincipalGrants: async () => ctx },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/errors": { AppError },
    "@platform/core/validation": { validationError },
    "@/apps/studioflow/runtime": {
      studioFlow: {
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
  return { exports, cleanupCalls, previewCalls, revalidated };
}

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
