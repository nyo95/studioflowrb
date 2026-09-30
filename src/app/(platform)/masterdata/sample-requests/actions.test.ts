import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";
import { z } from "zod";
import { runSafeAction } from "@platform/core/actions";
import { validationError } from "@platform/core/validation";

type Result = { ok: true; data: unknown } | { ok: false; error: { kind: string; safeMessage?: string } };
type Actions = {
  takeSampleRequestAction?: (sourceRequestId: string) => Promise<Result>;
  recordSampleQuoteAction?: (intakeId: string, input: unknown) => Promise<Result>;
  markSampleRequestPricedAction?: (intakeId: string, input: unknown) => Promise<Result>;
  declineSampleRequestAction?: (intakeId: string, reason: unknown) => Promise<Result>;
};

/** Runs the real action module with only its runtime edges replaced. */
function load(signedIn = true) {
  const source = readFileSync("src/app/(platform)/masterdata/sample-requests/actions.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: Array<[string, unknown]> = [];
  const grants = ["masterdata.sample-request.manage"];
  const dependencies: Record<string, unknown> = {
    zod: { z },
    "next/cache": { revalidatePath: () => {} },
    "@platform/core/actions": { runSafeAction },
    "@platform/core/validation": { validationError },
    "@platform/core/auth": {
      requirePrincipalGrants: async () => {
        if (!signedIn) throw Object.assign(new Error("not signed in"), { kind: "UNAUTHENTICATED" });
        return { principal: { userId: "user-1", displayName: "Alice" }, grants };
      },
    },
    "@/apps/masterdata/public": { MASTERDATA_ROUTES: { sampleRequests: "/masterdata/sample-requests" } },
    "@/app/sample-request-runtime": {
      sampleRequestCoordinator: {
        take: async (input: unknown) => { calls.push(["take", input]); return { id: "intake-1" }; },
        recordQuote: async (input: unknown) => { calls.push(["recordQuote", input]); return { id: "intake-1" }; },
        markPriced: async (input: unknown) => { calls.push(["markPriced", input]); return { id: "intake-1" }; },
        decline: async (input: unknown) => { calls.push(["decline", input]); return { id: "intake-1" }; },
      },
    },
  };
  const exports: Actions = {};
  new Function("require", "exports", compiled)((id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`);
    return dependencies[id];
  }, exports);
  return { exports, calls, grants };
}

const actor = { kind: "USER", userId: "user-1", label: "Alice" };

it("acts as the signed-in staff member, never an id the browser sends", async () => {
  const { exports, calls, grants } = load();
  assert.deepEqual(await exports.takeSampleRequestAction!("req-1"), { ok: true, data: { id: "intake-1" } });
  assert.deepEqual(calls, [["take", { grants, actor, sourceRequestId: "req-1" }]]);
});

it("normalizes blank quote fields to null and forwards the selected supplier", async () => {
  const { exports, calls, grants } = load();
  const vendorId = "d6c241dc-b6aa-4d31-ab7f-d8db45b98fc6";
  await exports.recordSampleQuoteAction!("intake-1", { vendorId, quotedAmount: "150000", quotedCurrency: "idr", staffNote: "  ok  " });
  assert.deepEqual(calls, [["recordQuote", { grants, actor, intakeId: "intake-1", vendorId, skuId: null, quotedAmount: "150000", quotedCurrency: "idr", staffNote: "ok" }]]);
});

it("rejects a quote payload that fails schema validation, before touching the coordinator", async () => {
  const { exports, calls } = load();
  const result = await exports.recordSampleQuoteAction!("intake-1", { quotedAmount: 12345 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "VALIDATION");
  assert.equal(calls.length, 0);
});

it("requires a non-blank reason to decline, and forwards it trimmed", async () => {
  const { exports, calls } = load();
  const blank = await exports.declineSampleRequestAction!("intake-1", "   ");
  assert.equal(blank.ok, false);
  await exports.markSampleRequestPricedAction!("intake-1", {});
  await exports.declineSampleRequestAction!("intake-1", "  no stock  ");
  assert.deepEqual(calls[1], ["decline", { grants: ["masterdata.sample-request.manage"], actor, intakeId: "intake-1", reason: "no stock" }]);
});

it("turns a signed-out caller into a safe failure and never reaches the coordinator", async () => {
  const { exports, calls } = load(false);
  for (const attempt of [
    exports.takeSampleRequestAction!("req-1"),
    exports.recordSampleQuoteAction!("intake-1", {}),
    exports.markSampleRequestPricedAction!("intake-1", {}),
    exports.declineSampleRequestAction!("intake-1", "reason"),
  ]) {
    const result = await attempt;
    assert.equal(result.ok, false);
  }
  assert.equal(calls.length, 0);
});
