import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { runSafeAction } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

type Result = { ok: true; data: unknown } | { ok: false; error: { kind: string } };
type Actions = {
  getUnreadNotificationCountAction?: () => Promise<Result>;
  listNotificationsAction?: (limit?: unknown) => Promise<Result>;
  markNotificationsReadAction?: (ids: unknown) => Promise<Result>;
  markAllNotificationsReadAction?: () => Promise<Result>;
};

/** Runs the real action module with only its runtime edges replaced. */
function load(signedIn = true) {
  const source = readFileSync("src/app/(platform)/notifications/actions.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: Array<[string, unknown]> = [];
  const dependencies: Record<string, unknown> = {
    zod: { z },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/validation": { validationError },
    "@platform/core/auth": {
      requirePrincipal: async () => {
        if (!signedIn) throw Object.assign(new Error("not signed in"), { kind: "UNAUTHENTICATED" });
        return { userId: "user-1", displayName: "Alice" };
      },
    },
    "@platform/runtime": {
      notificationCenter: {
        countUnread: async (input: unknown) => { calls.push(["count", input]); return 3; },
        list: async (input: unknown) => { calls.push(["list", input]); return []; },
        markRead: async (input: unknown) => { calls.push(["markRead", input]); return 2; },
        markAllRead: async (input: unknown) => { calls.push(["markAll", input]); return 5; },
      },
    },
  };
  const exports: Actions = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return { exports, calls };
}

const UUID = "7d2162d0-d4af-4dfa-92eb-ceea0c582531";

it("acts only for the signed-in user, never for an id the browser sends", async () => {
  const { exports, calls } = load();
  assert.deepEqual(await exports.getUnreadNotificationCountAction!(), { ok: true, data: { unread: 3 } });
  assert.deepEqual(await exports.listNotificationsAction!(10), { ok: true, data: [] });
  assert.deepEqual(await exports.markNotificationsReadAction!([UUID]), { ok: true, data: { marked: 2 } });
  assert.deepEqual(await exports.markAllNotificationsReadAction!(), { ok: true, data: { marked: 5 } });
  assert.deepEqual(calls, [
    ["count", { userId: "user-1" }],
    ["list", { userId: "user-1", limit: 10 }],
    ["markRead", { userId: "user-1", ids: [UUID] }],
    ["markAll", { userId: "user-1" }],
  ]);
});

it("rejects a limit outside 1 to 100 and any id list that is not up to 100 UUIDs, before touching the inbox", async () => {
  const { exports, calls } = load();
  for (const limit of [0, 101, -1, 2.5, "10", Number.NaN, null]) {
    const result = await exports.listNotificationsAction!(limit);
    assert.equal(result.ok, false, `limit ${String(limit)}`);
    if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
  }
  for (const ids of ["abc", [""], ["not-a-uuid"], [UUID, 5], Array.from({ length: 101 }, () => UUID), null]) {
    const result = await exports.markNotificationsReadAction!(ids);
    assert.equal(result.ok, false, JSON.stringify(ids));
    if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await exports.markNotificationsReadAction!([]), { ok: true, data: { marked: 2 } }, "an empty list is allowed and harmless");
});

it("turns a signed-out caller into a safe failure and reads nothing", async () => {
  const { exports, calls } = load(false);
  for (const attempt of [exports.getUnreadNotificationCountAction!(), exports.listNotificationsAction!(), exports.markNotificationsReadAction!([UUID]), exports.markAllNotificationsReadAction!()]) {
    const result = await attempt;
    assert.equal(result.ok, false);
  }
  assert.equal(calls.length, 0);
});
