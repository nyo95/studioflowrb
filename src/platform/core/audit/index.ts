import type { TransactionClient } from "@platform/core/db";
import { toDecimalString } from "@platform/utilities/decimal";

/**
 * Domain-neutral audit envelope and transactional writer port (CORE.md §5).
 *
 * Core owns the append-only envelope, safe serialization, explicit-key
 * diffing, and the writer port ONLY. Apps own action names, decide which
 * operations are auditable, and must write the event inside the SAME database
 * transaction as their mutation — a rollback must roll back its audit event.
 *
 * Deliberately absent here (app-owned or deferred): any action vocabulary,
 * persistence schema or adapter, read/query models, retention policy,
 * undo/revert behavior, and operational/security logging of failed attempts.
 */

export const AUDIT_APP_IDS = ["studioflow", "masterdata", "bq", "platform"] as const;

export type AuditAppId = (typeof AUDIT_APP_IDS)[number];

export type AuditActorKind = "USER" | "SYSTEM";

export type AuditActor = {
  kind: AuditActorKind;
  userId?: string;
  label: string;
};

export type AuditChange = { from: unknown; to: unknown };

export type AuditChanges = Record<string, AuditChange>;

export type AuditEventInput = {
  appId: AuditAppId;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  occurredAt?: Date;
  requestId?: string;
  changes?: AuditChanges;
  metadata?: Record<string, unknown>;
};

/** Fully JSON-safe event handed to infrastructure inside the mutation's transaction. */
export type SerializedAuditEvent = {
  appId: AuditAppId;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  occurredAt: string;
  requestId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
};

/** Transaction context opened and owned by the calling application's use case. */
export type AuditTransactionContext = TransactionClient;

/**
 * Port implemented later by an approved persistence adapter. Implementations
 * MUST write within the provided transaction context and MUST NOT open a
 * transaction of their own.
 */
export interface AuditWriter {
  write(event: SerializedAuditEvent, tx: AuditTransactionContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Secret-style field names are rejected outright — Core never guesses
 * redactions. Matching is case-insensitive substring based so variants like
 * `userPassword`, `accessToken`, or `api_key` fail loudly.
 */
const FORBIDDEN_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "credential",
  "authorization",
  "authkey",
  "api_key",
  "apikey",
  "set-cookie",
] as const;

export function isForbiddenAuditKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return FORBIDDEN_KEY_PATTERNS.some(
    (pattern) => normalized.includes(pattern.replace(/[^a-z0-9]/g, "")),
  );
}

function rejectForbiddenKeysDeep(value: unknown, path: string, seen = new WeakSet<object>()): void {
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error(`Circular audit value at ${path}.`);
    seen.add(value);
    value.forEach((entry, index) => rejectForbiddenKeysDeep(entry, `${path}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) throw new Error(`Circular audit value at ${path}.`);
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (isForbiddenAuditKey(key)) {
        throw new Error(`Forbidden audit key "${key}" at ${path}: secret-style fields cannot be audited.`);
      }
      rejectForbiddenKeysDeep(entry, `${path}.${key}`, seen);
    }
    seen.delete(value);
  }
}

export function validateAuditEventInput(input: AuditEventInput): void {
  if (!AUDIT_APP_IDS.includes(input.appId)) {
    throw new Error(`Invalid audit appId: ${JSON.stringify((input as { appId?: unknown }).appId)}.`);
  }
  if (!isNonEmptyString(input.action)) throw new Error("Audit action must be a non-empty string.");
  if (!isNonEmptyString(input.entityType)) throw new Error("Audit entityType must be a non-empty string.");
  if (!isNonEmptyString(input.entityId)) throw new Error("Audit entityId must be a non-empty string.");

  const actor = input.actor;
  if (!actor || (actor.kind !== "USER" && actor.kind !== "SYSTEM")) {
    throw new Error('Audit actor.kind must be "USER" or "SYSTEM".');
  }
  if (!isNonEmptyString(actor.label)) throw new Error("Audit actor.label must be a non-empty string.");
  if (actor.kind === "USER" && !isNonEmptyString(actor.userId)) {
    throw new Error("Audit actor.userId is required for USER actors.");
  }
  if (actor.userId !== undefined && !isNonEmptyString(actor.userId)) {
    throw new Error("Audit actor.userId must be a non-empty string when present.");
  }

  if (
    input.occurredAt !== undefined &&
    (!(input.occurredAt instanceof Date) || !Number.isFinite(input.occurredAt.getTime()))
  ) {
    throw new Error("Audit occurredAt must be a valid Date when present.");
  }
  if (input.requestId !== undefined && !isNonEmptyString(input.requestId)) {
    throw new Error("Audit requestId must be a non-empty string when present.");
  }

  if (input.changes !== undefined) {
    if (typeof input.changes !== "object" || input.changes === null || Array.isArray(input.changes)) {
      throw new Error("Audit changes must be a record of { from, to } pairs.");
    }
    for (const [key, change] of Object.entries(input.changes)) {
      if (
        typeof change !== "object" ||
        change === null ||
        Array.isArray(change) ||
        !("from" in change) ||
        !("to" in change)
      ) {
        throw new Error(`Audit change "${key}" must contain both from and to values.`);
      }
    }
    rejectForbiddenKeysDeep(input.changes, "changes");
  }
  if (input.metadata !== undefined) {
    if (typeof input.metadata !== "object" || input.metadata === null || Array.isArray(input.metadata)) {
      throw new Error("Audit metadata must be a record.");
    }
    rejectForbiddenKeysDeep(input.metadata, "metadata");
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Duck-types Decimal-like instances (e.g. Decimal.js / Prisma.Decimal, whose
 * internal representation carries d/e/s mantissa-exponent-sign fields).
 */
export function isDecimalLike(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  if (typeof (value as { toString?: unknown }).toString !== "function") return false;
  const candidate = value as {
    constructor?: { name?: unknown };
    d?: unknown;
    e?: unknown;
    s?: unknown;
  };
  const byName = candidate.constructor?.name === "Decimal" || candidate.constructor?.name === "PrismaDecimal";
  const byStructure = candidate.d !== undefined && candidate.e !== undefined && candidate.s !== undefined;
  return byName || byStructure;
}

/**
 * Recursively converts a value to its JSON-safe form: Dates to UTC ISO-8601
 * strings, Decimal-like values through their own exact `toString` (never
 * through a JavaScript number), arrays/plain objects recursively, `undefined`
 * to `null`. Anything else non-JSON-safe fails loudly instead of being
 * silently coerced.
 */
export function serializeAuditValue(value: unknown): unknown {
  return serializeAuditValueDeep(value, new WeakSet<object>());
}

function serializeAuditValueDeep(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite numbers are not JSON-safe for audit events.");
    }
    return value;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid Dates cannot be audited.");
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    throw new Error("BigInt values are not JSON-safe for audit events; convert to a canonical string first.");
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw new Error(`Values of type ${typeof value} cannot be serialized into audit events.`);
  }
  if (isDecimalLike(value)) {
    const decimal = value as { toFixed?: () => string; toString: () => string };
    const exact = typeof decimal.toFixed === "function" ? decimal.toFixed() : decimal.toString();
    return toDecimalString(exact);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("Circular values cannot be serialized into audit events.");
    seen.add(value);
    const serialized = value.map((entry) => serializeAuditValueDeep(entry, seen));
    seen.delete(value);
    return serialized;
  }
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    if (seen.has(value)) throw new Error("Circular values cannot be serialized into audit events.");
    seen.add(value);
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(value)) {
      out[key] = serializeAuditValueDeep(entry, seen);
    }
    seen.delete(value);
    return out;
  }
  throw new Error("Unsupported audit value: only primitives, Dates, Decimal-like values, arrays, and plain objects are serializable.");
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

/**
 * Explicit-key diffing across the union of both records. Unchanged keys are
 * omitted entirely; added/removed keys carry `undefined` on their absent side
 * (serialized to `null`). An empty result means a no-op update, which callers
 * must skip — one real operation yields one primary event, no-ops yield none.
 */
export function diffAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AuditChanges {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditChanges = {};
  for (const key of keys) {
    if (isForbiddenAuditKey(key)) {
      throw new Error(`Forbidden audit key "${key}": secret-style fields cannot be audited.`);
    }
    const beforeValue = before[key];
    const afterValue = after[key];
    const beforeSerialized = serializeAuditValue(beforeValue);
    const afterSerialized = serializeAuditValue(afterValue);
    if (!jsonSafeEqual(beforeSerialized, afterSerialized)) {
      changes[key] = { from: beforeValue, to: afterValue };
    }
  }
  return changes;
}

function jsonSafeEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => jsonSafeEqual(entry, right[index]));
  }
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) => Object.hasOwn(rightRecord, key) && jsonSafeEqual(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Preparation pipeline
// ---------------------------------------------------------------------------

/**
 * Validates the input, snapshots the actor, defaults `occurredAt` to the write
 * time (UTC), and produces the JSON-safe event for the persistence adapter.
 * Callers must pass this to an `AuditWriter` inside their open transaction.
 */
export function prepareAuditEvent(
  input: AuditEventInput,
  options: { now?: () => Date } = {},
): SerializedAuditEvent {
  validateAuditEventInput(input);

  const occurredAt = (input.occurredAt ?? options.now?.() ?? new Date()).toISOString();

  const event: SerializedAuditEvent = {
    appId: input.appId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actor: { ...input.actor },
    occurredAt,
  };
  if (input.requestId !== undefined) event.requestId = input.requestId;
  if (input.changes !== undefined) {
    event.changes = Object.fromEntries(
      Object.entries(input.changes).map(([key, change]) => [
        key,
        { from: serializeAuditValue(change.from), to: serializeAuditValue(change.to) },
      ]),
    );
  }
  if (input.metadata !== undefined) {
    event.metadata = serializeAuditValue(input.metadata) as Record<string, unknown>;
  }
  return event;
}
