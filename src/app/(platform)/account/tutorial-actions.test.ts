import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";

import { AppError } from "@platform/core/errors";
import { runSafeAction } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

type Result = { ok: true; data: unknown } | { ok: false; error: { kind: string } };
type Actions = {
  recordTutorialAction?: (input: unknown) => Promise<Result>;
  clearTutorialAction?: (input: unknown) => Promise<Result>;
};

function load(signedIn = true) {
  const source = readFileSync("src/app/(platform)/account/actions.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: Array<[string, unknown]> = [];
  const revalidated: Array<[string, string | undefined]> = [];
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string, type?: string) => revalidated.push([path, type]) },
    zod: { z },
    "@platform/core/errors": { AppError },
    "@platform/core/auth": {
      requirePrincipal: async () => {
        if (!signedIn) throw Object.assign(new Error("not signed in"), { kind: "UNAUTHENTICATED" });
        return { userId: "user-1", displayName: "Alice" };
      },
      requirePrincipalGrants: async () => ({ principal: { userId: "user-1", displayName: "Alice" }, grants: [] }),
      revokeSessionById: async () => false,
      setSessionCookie: async () => {},
      displayNameSchema: z.string(),
      passwordSchema: z.string(),
    },
    "@platform/core/db": { prisma: { session: { findUnique: async () => null } } },
    "@platform/core/integrations": { integrationTokens: {} },
    "@platform/runtime": {
      platformAccount: {}, storageUsage: {}, userPreferences: {},
      userTutorials: {
        record: async (input: unknown) => { calls.push(["record", input]); return { ...(input as object), updatedAt: new Date() }; },
        clear: async (input: unknown) => { calls.push(["clear", input]); },
      },
    },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/validation": { validationError },
  };
  const exports: Actions = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return { exports, calls, revalidated };
}

it("records and clears only the authenticated person's tutorial state", async () => {
  const { exports, calls, revalidated } = load();
  assert.equal((await exports.recordTutorialAction!({ tourKey: "studioflow", version: 1, state: "dismissed" })).ok, true);
  assert.deepEqual(await exports.clearTutorialAction!({ tourKey: "studioflow" }), { ok: true, data: { cleared: true } });
  assert.deepEqual(calls, [
    ["record", { userId: "user-1", tourKey: "studioflow", version: 1, state: "dismissed" }],
    ["clear", { userId: "user-1", tourKey: "studioflow" }],
  ]);
  assert.deepEqual(revalidated, [["/", "layout"], ["/", "layout"]]);
});

it("rejects malformed input and anonymous callers before reaching tutorial storage", async () => {
  const malformed = load();
  for (const input of [{ tourKey: "studioflow", version: 0, state: "completed" }, { tourKey: "studioflow", version: 1, state: "later" }, { tourKey: 1 }]) {
    assert.equal((await malformed.exports.recordTutorialAction!(input)).ok, false);
  }
  assert.equal((await malformed.exports.clearTutorialAction!({ tourKey: 1 })).ok, false);
  assert.equal(malformed.calls.length, 0);

  const anonymous = load(false);
  assert.equal((await anonymous.exports.recordTutorialAction!({ tourKey: "studioflow", version: 1, state: "completed" })).ok, false);
  assert.equal((await anonymous.exports.clearTutorialAction!({ tourKey: "studioflow" })).ok, false);
  assert.equal(anonymous.calls.length, 0);
});
