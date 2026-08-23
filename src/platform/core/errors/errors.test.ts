import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@/generated/prisma/client";

import {
  AppError,
  ERROR_KINDS,
  isAppError,
  isFrameworkControlFlowError,
  toSafeErrorPayload,
} from "./index";

const CANONICAL_KINDS = [
  "VALIDATION",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVARIANT",
  "INFRASTRUCTURE",
  "INTERNAL",
] as const;

function knownPrismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(
    `raw prisma internals for ${code}: Unique constraint failed on the fields: (users_email_key)`,
    { code, clientVersion: "7.9.1", meta },
  );
}

describe("AppError taxonomy", () => {
  it("locks the eight canonical categories", () => {
    assert.deepEqual([...ERROR_KINDS], [...CANONICAL_KINDS]);
  });

  it("constructs an AppError for every canonical kind", () => {
    for (const kind of CANONICAL_KINDS) {
      const error = new AppError(kind, `${kind}_CODE`, "safe text");
      assert.ok(isAppError(error));
      assert.equal(error.kind, kind);
      assert.equal(error.code, `${kind}_CODE`);
      assert.equal(error.safeMessage, "safe text");
      assert.equal(error.details, undefined);
    }
  });

  it("keeps internal causes out of the safe payload while staying available server-side", () => {
    const cause = new Error("secret-internal-cause");
    const error = new AppError("CONFLICT", "C1", "safe text", {
      cause,
      details: { issues: [{ path: ["name"], message: "taken" }] },
    });
    assert.equal(error.cause, cause);

    const payload = toSafeErrorPayload(error);
    assert.deepEqual(payload, {
      kind: "CONFLICT",
      code: "C1",
      safeMessage: "safe text",
      details: { issues: [{ path: ["name"], message: "taken" }] },
    });
    assert.ok(!JSON.stringify(payload).includes("secret-internal-cause"));
    assert.ok(!JSON.stringify(payload).includes("stack"));
  });

  it("omits the details key when no details were provided", () => {
    const payload = toSafeErrorPayload(new AppError("NOT_FOUND", "N1", "safe text"));
    assert.equal("details" in payload, false);
  });

  it("is a real Error that serializes its name", () => {
    const error = new AppError("FORBIDDEN", "F1", "safe text");
    assert.ok(error instanceof Error);
    assert.equal(error.name, "AppError");
  });
});

describe("safe transport mapping", () => {
  it("never exposes unexpected messages, stacks, or causes from unknown errors", () => {
    const secret = "raw-database-password-leak";
    const cases: unknown[] = [
      new Error(secret),
      Object.assign(new Error(secret), { stack: secret }),
      "plain-string-throw",
      { weird: "object-throw" },
      42,
      null,
      undefined,
    ];
    for (const thrown of cases) {
      const payload = toSafeErrorPayload(thrown);
      assert.deepEqual(payload, {
        kind: "INTERNAL",
        code: "INTERNAL",
        safeMessage: "Something went wrong. Please try again.",
      });
      assert.ok(!JSON.stringify(payload).includes(secret));
    }
  });

  it("passes AppErrors through as their own safe payload", () => {
    const appError = new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in.");
    assert.deepEqual(toSafeErrorPayload(appError), {
      kind: "UNAUTHENTICATED",
      code: "NO_SESSION",
      safeMessage: "Please sign in.",
    });
  });

  it("drops unsafe details and reports unknown errors through an injected hook", () => {
    const unsafe = new AppError("INTERNAL", "X", "safe", { details: { sql: "SELECT secret" } });
    assert.equal(toSafeErrorPayload(unsafe).details, undefined);
    const reported: unknown[] = [];
    toSafeErrorPayload(new Error("boom"), { reportUnknownError: (error) => reported.push(error) });
    assert.equal(reported.length, 1);
  });
});

describe("central Prisma known-error mapping", () => {
  it("maps uniqueness conflicts to CONFLICT without constraint names", () => {
    const mapped = toSafeErrorPayload(
      knownPrismaError("P2002", { target: ["users_email_key"] }),
    );
    assert.equal(mapped.kind, "CONFLICT");
    assert.equal(mapped.code, "P2002");
    assert.ok(!JSON.stringify(mapped).includes("users_email_key"));
    assert.ok(!JSON.stringify(mapped).includes("email"));
  });

  it("maps missing write targets to NOT_FOUND", () => {
    const mapped = toSafeErrorPayload(knownPrismaError("P2025"));
    assert.equal(mapped.kind, "NOT_FOUND");
    assert.equal(mapped.code, "P2025");
  });

  it("maps foreign-key violations to CONFLICT", () => {
    const mapped = toSafeErrorPayload(knownPrismaError("P2003", { field_name: "category_id" }));
    assert.equal(mapped.kind, "CONFLICT");
    assert.equal(mapped.code, "P2003");
    assert.ok(!JSON.stringify(mapped).includes("category_id"));
  });

  it("maps required-relation violations to CONFLICT", () => {
    const mapped = toSafeErrorPayload(knownPrismaError("P2014"));
    assert.equal(mapped.kind, "CONFLICT");
    assert.equal(mapped.code, "P2014");
  });

  it("maps other known Prisma codes to INFRASTRUCTURE with a generic message", () => {
    const raw = knownPrismaError("P9999", { target: ["secret_index_name"] });
    const mapped = toSafeErrorPayload(raw);
    assert.equal(mapped.kind, "INFRASTRUCTURE");
    assert.equal(mapped.code, "P9999");
    assert.ok(!JSON.stringify(mapped).includes("secret_index_name"));
    assert.ok(!JSON.stringify(mapped).includes(raw.message));
  });
});

describe("framework control-flow preservation", () => {
  it("detects documented redirect and HTTP-fallback digests only", () => {
    assert.equal(isFrameworkControlFlowError({ digest: "NEXT_REDIRECT;replace;/login;307;" }), true);
    assert.equal(isFrameworkControlFlowError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }), true);
    assert.equal(isFrameworkControlFlowError(new Error("NEXT_REDIRECT")), false);
    assert.equal(isFrameworkControlFlowError({ digest: 123 }), false);
    assert.equal(isFrameworkControlFlowError({ digest: "OTHER_DIGEST" }), false);
    assert.equal(isFrameworkControlFlowError({ digest: "NEXT_REDIRECTED;replace;/login;307;" }), false);
    assert.equal(isFrameworkControlFlowError({ digest: "NEXT_HTTP_ERROR_FALLBACK;500" }), false);
    assert.equal(isFrameworkControlFlowError(null), false);
    assert.equal(isFrameworkControlFlowError(undefined), false);
    assert.equal(isFrameworkControlFlowError("NEXT_REDIRECT"), false);
  });

  it("rethrows framework control-flow errors instead of converting them", () => {
    const controlFlow = { digest: "NEXT_REDIRECT;replace;/login;307;" };
    let rethrown: unknown;
    try {
      toSafeErrorPayload(controlFlow);
    } catch (caught) {
      rethrown = caught;
    }
    assert.equal(rethrown, controlFlow);

    const httpFallback = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
    assert.throws(() => toSafeErrorPayload(httpFallback), (caught: unknown) => caught === httpFallback);
  });
});
