import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";

import { runSafeAction, type ActionResult } from "@platform/core/actions";
import { AppError } from "@platform/core/errors";
import { validationError } from "@platform/core/validation";
import { PRESENTATION_LAYOUTS } from "./layouts";

const projectId = randomUUID();
const annotationId = randomUUID();

/** Execute the actual action boundary without importing the database runtime. */
function loadAction(failure?: AppError) {
  const compiled = ts.transpileModule(readFileSync("src/apps/presentation/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const calls: Record<string, unknown>[] = [];
  const refreshed: string[] = [];
  let signedIn = true;
  let enabled = true;
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string) => refreshed.push(path) },
    zod: { z },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/errors": { AppError },
    "@platform/core/validation": { validationError },
    "@platform/core/auth": { requirePrincipalGrants: async () => {
      if (!signedIn) throw new AppError("UNAUTHENTICATED", "ACTOR_REQUIRED", "Sign in first.");
      return { principal: { userId: "actor", displayName: "Designer" }, grants: ["presentation.manage"] };
    } },
    "@platform/core/modules": { requireModuleEnabled: async () => {
      if (!enabled) throw new AppError("CONFLICT", "MODULE_DISABLED", "Presentation is disabled.");
    } },
    "./runtime": { presentation: { updateAnnotation: async (input: Record<string, unknown>) => {
      calls.push(input);
      if (failure) throw failure;
    } } },
    "./layouts": { PRESENTATION_LAYOUTS },
    "@/apps/studioflow/public/presentation-bridge-runtime": {},
  };
  const actions = {} as { updatePresentationAnnotationAction: (input: unknown) => Promise<ActionResult<unknown>> };
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
    return dependencies[id];
  }, actions);
  return { save: actions.updatePresentationAnnotationAction, calls, refreshed, signOut: () => { signedIn = false; }, disable: () => { enabled = false; } };
}

it("pin action rejects out-of-range, non-numeric and unknown input before dispatch", async () => {
  const test = loadAction();
  for (const axis of ["pinX", "pinY"]) {
    for (const value of [-0.01, 100.01, Number.NaN, Infinity, "50", null]) {
      const result = await test.save({ projectId, annotationId, [axis]: value });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
    }
  }
  assert.equal((await test.save({ projectId, annotationId, sortOrder: 9 })).ok, false);
  assert.equal(test.calls.length, 0);
  assert.equal(test.refreshed.length, 0);
});

it("pin action accepts inclusive bounds and leaves omitted metadata undefined", async () => {
  const test = loadAction();
  for (const position of [{ pinX: 0, pinY: 100 }, { pinX: 100, pinY: 0 }, { pinX: 42.5, pinY: 33.25 }]) {
    assert.equal((await test.save({ projectId, annotationId, ...position })).ok, true);
    const call = test.calls.at(-1)!;
    assert.equal(call.projectId, projectId);
    assert.equal(call.annotationId, annotationId);
    assert.deepEqual([call.pinX, call.pinY], [position.pinX, position.pinY]);
    for (const field of ["note", "labelSide", "scheduleEntryId", "sortOrder"]) assert.equal(call[field], undefined);
  }
  assert.equal(test.refreshed.length, 3);
});

it("pin action preserves safe service refusals and authenticates without refreshing failures", async () => {
  const refused = loadAction(new AppError("FORBIDDEN", "PERMISSION_DENIED", "Safe refusal"));
  const result = await refused.save({ projectId, annotationId, pinX: 50, pinY: 50 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.safeMessage, "Safe refusal");
  assert.equal(refused.refreshed.length, 0);
  const signedOut = loadAction(); signedOut.signOut();
  const disabled = loadAction(); disabled.disable();
  for (const test of [signedOut, disabled]) {
    assert.equal((await test.save({ projectId, annotationId, pinX: 50, pinY: 50 })).ok, false);
    assert.equal(test.calls.length, 0);
    assert.equal(test.refreshed.length, 0);
  }
});
