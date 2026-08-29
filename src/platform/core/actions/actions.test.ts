import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { AppError } from "@platform/core/errors";
import { isFrameworkControlFlowError } from "@platform/core/errors";
import { runSafeAction } from "./index";

describe("runSafeAction", () => {
  it("returns the command result on success", async () => {
    const result = await runSafeAction(async () => 7);
    assert.deepEqual(result, { ok: true, data: 7 });
  });

  it("passes AppError through as its safe payload", async () => {
    const result = await runSafeAction(async () => {
      throw new AppError("CONFLICT", "EMAIL_TAKEN", "That email is already in use.");
    });
    assert.deepEqual(result, {
      ok: false,
      error: { kind: "CONFLICT", code: "EMAIL_TAKEN", safeMessage: "That email is already in use." },
    });
  });

  it("maps Zod failures to VALIDATION with field issues", async () => {
    const schema = z.object({ name: z.string().min(2) });
    const result = await runSafeAction(async () => schema.parse({ name: "x" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "VALIDATION");
      assert.equal(result.error.code, "VALIDATION_FAILED");
    }
  });

  it("collapses unknown errors into generic INTERNAL without the original message", async () => {
    const reported: unknown[] = [];
    const result = await runSafeAction(
      async () => {
        throw new Error("database passwordhunter at 10.0.0.1");
      },
      { reportUnknownError: (error) => reported.push(error) },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "INTERNAL");
      assert.equal(result.error.safeMessage.includes("passwordhunter"), false);
      assert.equal(JSON.stringify(result.error).includes("passwordhunter"), false);
    }
    assert.equal(reported.length, 1);
  });

  it("rethrows framework control-flow errors instead of mapping them", async () => {
    const controlFlow = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;303;",
    });
    assert.equal(isFrameworkControlFlowError(controlFlow), true);
    await assert.rejects(
      () => runSafeAction(async () => {
        throw controlFlow;
      }),
    );
  });
});
