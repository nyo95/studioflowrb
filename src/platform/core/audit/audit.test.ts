import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as auditModule from "./index";
import type {
  AuditTransactionContext,
  AuditWriter,
  SerializedAuditEvent,
} from "./index";

const {
  AUDIT_APP_IDS,
  diffAuditChanges,
  isDecimalLike,
  isForbiddenAuditKey,
  prepareAuditEvent,
  validateAuditEventInput,
} = auditModule;

/** Minimal Decimal.js-shaped value: exact string form, mantissa/exponent/sign fields. */
class FakeDecimal {
  d = [1234, 5678];
  e = 3;
  s = -1;
  constructor(readonly raw: string) {}
  toString(): string {
    return this.raw;
  }
  toFixed(): string {
    return this.raw;
  }
}

const FIXED_NOW = new Date("2026-08-23T04:05:06.789Z");

function baseInput() {
  return {
    appId: "masterdata" as const,
    action: "UPDATE_EXAMPLE",
    entityType: "Example",
    entityId: "example-1",
    actor: { kind: "USER" as const, userId: "user-1", label: "Designer One" },
  };
}

function recordingWriter() {
  const written: Array<{ event: unknown; tx: unknown }> = [];
  const writer: AuditWriter = {
    async write(event: SerializedAuditEvent, tx: AuditTransactionContext): Promise<void> {
      if (tx === undefined || tx === null) {
        throw new Error("AuditWriter requires the caller's transaction context.");
      }
      written.push({ event, tx });
    },
  };
  return {
    written,
    writer,
    tx: { __transactionMarker: true } as unknown as AuditTransactionContext,
  };
}

describe("audit envelope validation", () => {
  it("accepts only the locked app identifiers", () => {
    assert.deepEqual([...AUDIT_APP_IDS], ["studioflow", "masterdata", "bq", "platform"]);
    for (const appId of AUDIT_APP_IDS) {
      assert.doesNotThrow(() => validateAuditEventInput({ ...baseInput(), appId }));
    }
  });

  it("accepts USER actors with a userId and SYSTEM actors with or without one", () => {
    assert.doesNotThrow(() => validateAuditEventInput(baseInput()));
    assert.doesNotThrow(() =>
      validateAuditEventInput({
        ...baseInput(),
        actor: { kind: "SYSTEM", label: "Nightly job" },
      }),
    );
    assert.doesNotThrow(() =>
      validateAuditEventInput({
        ...baseInput(),
        actor: { kind: "SYSTEM", userId: "svc-1", label: "Service" },
      }),
    );
  });

  it("rejects malformed envelopes instead of guessing", () => {
    const invalid: Array<Parameters<typeof validateAuditEventInput>[0]> = [
      { ...baseInput(), appId: "notanapp" as never },
      { ...baseInput(), action: "" },
      { ...baseInput(), entityType: "" },
      { ...baseInput(), entityId: "" },
      { ...baseInput(), actor: { kind: "ROBOT" as never, label: "x" } },
      { ...baseInput(), actor: { kind: "USER" as const, label: "no user id" } },
      { ...baseInput(), actor: { kind: "USER" as const, userId: "", label: "empty id" } },
      { ...baseInput(), actor: { kind: "SYSTEM" as const, label: "" } },
      { ...baseInput(), requestId: "" },
      { ...baseInput(), occurredAt: "2026-08-23T00:00:00Z" as unknown as Date },
      { ...baseInput(), occurredAt: new Date("invalid") },
      { ...baseInput(), changes: { malformed: null as never } },
    ];
    for (const input of invalid) {
      assert.throws(() => validateAuditEventInput(input), Error);
    }
  });

  it("contains no app action vocabulary on the module surface", () => {
    const exports = Object.keys(auditModule);
    assert.ok(!exports.some((name) => /action(s)?_/i.test(name) || name.includes("AUDIT_ACTIONS")));
    assert.equal(typeof (auditModule as Record<string, unknown>).AUDIT_ACTIONS, "undefined");
  });
});

describe("audit serialization", () => {
  it("defaults occurredAt to the write time and serializes it as UTC ISO-8601", () => {
    const event = prepareAuditEvent(baseInput(), { now: () => FIXED_NOW });
    assert.equal(event.occurredAt, "2026-08-23T04:05:06.789Z");
  });

  it("honors an explicit occurredAt timestamp", () => {
    const event = prepareAuditEvent(
      { ...baseInput(), occurredAt: new Date("2026-01-01T00:00:00.000Z") },
      { now: () => FIXED_NOW },
    );
    assert.equal(event.occurredAt, "2026-01-01T00:00:00.000Z");
  });

  it("preserves request ids verbatim", () => {
    const event = prepareAuditEvent({ ...baseInput(), requestId: "req-abc-123" }, { now: () => FIXED_NOW });
    assert.equal(event.requestId, "req-abc-123");
  });

  it("serializes Dates to UTC ISO strings recursively", () => {
    const event = prepareAuditEvent(
      {
        ...baseInput(),
        changes: {
          window: { from: new Date("2026-02-01T10:00:00Z"), to: new Date("2026-03-01T10:00:30.500Z") },
        },
        metadata: { nested: { when: [new Date("2026-05-05T05:05:05Z")] } },
      },
      { now: () => FIXED_NOW },
    );
    assert.equal((event.changes?.window.from as string), "2026-02-01T10:00:00.000Z");
    assert.equal((event.changes?.window.to as string), "2026-03-01T10:00:30.500Z");
    const nested = event.metadata?.nested as { when: string[] };
    assert.deepEqual(nested.when, ["2026-05-05T05:05:05.000Z"]);
  });

  it("serializes Decimal-like values through their exact string form without numeric conversion", () => {
    const raw = "-00012345678901234567890.1299999999999999999900";
    const exact = "-12345678901234567890.12999999999999999999";
    assert.equal(isDecimalLike(new FakeDecimal(raw)), true);
    assert.equal(isDecimalLike({ justAnObject: true }), false);

    const event = prepareAuditEvent(
      {
        ...baseInput(),
        metadata: {
          amount: new FakeDecimal(raw),
          plainNumber: 42,
          text: "1.5 stays a string",
        },
      },
      { now: () => FIXED_NOW },
    );
    const metadata = event.metadata as Record<string, unknown>;
    assert.equal(metadata.amount, exact);
    assert.equal(metadata.plainNumber, 42);
    assert.equal(metadata.text, "1.5 stays a string");
  });

  it("fails loudly on values that are not JSON-safe instead of coercing them", () => {
    assert.throws(() => prepareAuditEvent({ ...baseInput(), metadata: { weird: new Map() } }, { now: () => FIXED_NOW }));
    assert.throws(() => prepareAuditEvent({ ...baseInput(), metadata: { big: 1n } }, { now: () => FIXED_NOW }));
    assert.throws(() => prepareAuditEvent({ ...baseInput(), metadata: { bad: Number.NaN } }, { now: () => FIXED_NOW }));
    assert.throws(() => prepareAuditEvent({ ...baseInput(), metadata: { bad: Number.POSITIVE_INFINITY } }, { now: () => FIXED_NOW }));
    assert.throws(() => prepareAuditEvent({ ...baseInput(), metadata: { bad: new Date("invalid") } }, { now: () => FIXED_NOW }));

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => prepareAuditEvent({ ...baseInput(), metadata: circular }, { now: () => FIXED_NOW }));
  });
});

describe("explicit-key diffing", () => {
  it("reports changed, added, and removed keys across the key union", () => {
    const diff = diffAuditChanges(
      { name: "Old", price: "100", gone: "x" },
      { name: "New", price: "100", added: true },
    );
    assert.deepEqual(Object.keys(diff).sort(), ["added", "gone", "name"]);
    assert.deepEqual(diff.name, { from: "Old", to: "New" });
    assert.equal(diff.price, undefined);
    assert.deepEqual(diff.gone, { from: "x", to: undefined });
    assert.deepEqual(diff.added, { from: undefined, to: true });
  });

  it("omits unchanged values so no-op updates produce an empty diff", () => {
    const before = { status: "ACTIVE", meta: { a: 1, at: new Date("2026-01-01T00:00:00Z") } };
    const after = { status: "ACTIVE", meta: { a: 1, at: new Date("2026-01-01T00:00:00Z") } };
    const diff = diffAuditChanges(before, after);
    assert.deepEqual(diff, {});
  });

  it("detects nested structural changes while ignoring equal structures", () => {
    const changed = diffAuditChanges({ row: { a: 1 } }, { row: { a: 2 } });
    assert.ok(changed.row);
    const same = diffAuditChanges(
      { row: { a: 1, b: [1, 2] } },
      { row: { b: [1, 2], a: 1 } },
    );
    assert.deepEqual(same, {});
  });

  it("rejects secret-style keys encountered while diffing", () => {
    assert.throws(() => diffAuditChanges({ password: "a" }, { password: "b" }));
  });
});

describe("forbidden secret-style keys", () => {
  const forbidden = [
    "password",
    "Password",
    "userPasswordHash",
    "accessToken",
    "refresh_token",
    "api_key",
    "apiKey",
    "mySecretValue",
    "credentialsBlob",
    "Authorization",
    "setCookie",
  ];

  it("is detected by the key predicate", () => {
    for (const key of forbidden) {
      assert.equal(isForbiddenAuditKey(key), true, `expected forbidden: ${key}`);
    }
    // Matching is deliberately conservative: substrings fail even in
    // otherwise-harmless names, while ordinary fields pass.
    assert.equal(isForbiddenAuditKey("tokenCount"), true);
    assert.equal(isForbiddenAuditKey("description"), false);
    assert.equal(isForbiddenAuditKey("authoredBy"), false);
  });

  it("fails audit preparation instead of silently redacting", () => {
    assert.throws(() =>
      prepareAuditEvent(
        { ...baseInput(), changes: { password: { from: "a", to: "b" } } },
        { now: () => FIXED_NOW },
      ),
    );
    assert.throws(() =>
      prepareAuditEvent(
        { ...baseInput(), metadata: { nested: { accessToken: "x" } } },
        { now: () => FIXED_NOW },
      ),
    );
  });
});

describe("transactional writer port", () => {
  it("requires the caller-provided transaction context at runtime", async () => {
    const { writer, tx } = recordingWriter();
    await assert.rejects(
      () => writer.write(prepareAuditEvent(baseInput(), { now: () => FIXED_NOW }), undefined as never),
      /requires the caller's transaction context/,
    );
    await assert.doesNotReject(() =>
      writer.write(prepareAuditEvent(baseInput(), { now: () => FIXED_NOW }), tx),
    );
  });

  it("records exactly one event per real operation inside the caller's transaction", async () => {
    const { writer, written, tx } = recordingWriter();

    const before = { status: "DRAFT" };
    const after = { status: "ACTIVE" };
    const changes = diffAuditChanges(before, after);

    // No-op updates are skipped by contract: empty diff ⇒ no event.
    const noOpDiff = diffAuditChanges(after, { ...after });
    assert.deepEqual(noOpDiff, {});

    await writer.write(
      prepareAuditEvent({ ...baseInput(), action: "UPDATE_STATUS", changes }, { now: () => FIXED_NOW }),
      tx,
    );

    assert.equal(written.length, 1);
    const event = written[0].event as { changes?: Record<string, { from: string; to: string }> };
    assert.deepEqual(event.changes?.status, { from: "DRAFT", to: "ACTIVE" });
    assert.equal(written[0].tx, tx);
  });

  it("keeps entity references polymorphic strings without foreign keys", () => {
    const event = prepareAuditEvent(
      { ...baseInput(), entityType: "TotallyUnrelatedEntity", entityId: "any-id-shape" },
      { now: () => FIXED_NOW },
    );
    assert.equal(event.entityType, "TotallyUnrelatedEntity");
    assert.equal(event.entityId, "any-id-shape");
  });
});
