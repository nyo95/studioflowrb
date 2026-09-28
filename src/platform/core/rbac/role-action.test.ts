import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { runSafeAction, type ActionResult } from "../actions";
import { validationError } from "../validation";

it("archiveRoleAction rejects malformed ids before calling the service and passes valid ids through", async () => {
  // Execute the actual server-action module with only its framework/runtime edges replaced.
  const source = readFileSync("src/app/(platform)/settings/access/roles/actions.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: string[] = [];
  const revalidated: string[] = [];
  const dependencies: Record<string, unknown> = {
    "zod": { z },
    "next/cache": { revalidatePath: (path: string) => revalidated.push(path) },
    "@platform/core/auth": { requirePrincipalGrants: async () => ({ principal: { userId: "u", displayName: "User" }, grants: ["platform.role.manage"] }) },
    "@platform/runtime": { platformAccess: { archiveRole: async ({ roleId }: { roleId: string }) => { calls.push(roleId); return { changed: true }; } } },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/validation": { validationError },
  };
  const exports: { archiveRoleAction?: (id: string) => Promise<ActionResult<{ changed: boolean }>> } = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  for (const id of ["", "garbage", "123"]) {
    const result = await exports.archiveRoleAction!(id);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(revalidated, []);
  const id = "7d2162d0-d4af-4dfa-92eb-ceea0c582531";
  assert.deepEqual(await exports.archiveRoleAction!(id), { ok: true, data: { changed: true } });
  assert.deepEqual(calls, [id]);
  assert.deepEqual(revalidated, ["/settings/access/roles", "/settings/access/users"]);
});
