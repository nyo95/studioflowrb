import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z, type ZodType } from "zod";

import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { prisma, runSerializableTransaction, type TransactionClient } from "@platform/core/db";
import { AppError, createOperationalErrorReporter, toSafeErrorPayload, type SafeErrorPayload } from "@platform/core/errors";
import { loadLiveGrants } from "@platform/core/rbac/services";
import { requirePermission, type PermissionGrants, type PermissionId } from "@platform/core/rbac";
import { getPrincipalGrants } from "@platform/core/auth";

export const INTEGRATION_PING_SCOPE = "integration:ping";
export const INTEGRATION_PING_GRANT = "platform.integration.ping" as const;
const TOKEN_PREFIX_BYTES = 6;
const SECRET_BYTES = 32;
const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,200}$/;
const SCOPE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export type IntegrationScopeGrant = { scope: string; grant: PermissionId };
export const REFERENCE_SCOPE_GRANTS: readonly IntegrationScopeGrant[] = Object.freeze([
  { scope: INTEGRATION_PING_SCOPE, grant: INTEGRATION_PING_GRANT },
]);

type Db = typeof prisma;
type Runner = <T>(work: (tx: TransactionClient) => Promise<T>) => Promise<T>;
export type IntegrationTokenPorts = { db: Db; runTransaction: Runner; auditWriter: AuditWriter; now: () => Date; generateId: () => string };
export type IntegrationTokenPublic = { id: string; label: string; tokenPrefix: string; scopes: readonly string[]; expiresAt: Date | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date };
export type CreatedIntegrationToken = { token: IntegrationTokenPublic; secret: string };

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
function statusFor(kind: SafeErrorPayload["kind"]): number { return kind === "VALIDATION" ? 400 : kind === "UNAUTHENTICATED" ? 401 : kind === "FORBIDDEN" ? 403 : kind === "NOT_FOUND" ? 404 : kind === "CONFLICT" ? 409 : 500; }
function toPublic(row: { id: string; label: string; token_prefix: string; scopes: string[]; expires_at: Date | null; last_used_at: Date | null; revoked_at: Date | null; created_at: Date }): IntegrationTokenPublic {
  return { id: row.id, label: row.label, tokenPrefix: row.token_prefix, scopes: Object.freeze([...row.scopes]), expiresAt: row.expires_at, lastUsedAt: row.last_used_at, revokedAt: row.revoked_at, createdAt: row.created_at };
}
function requireManage(grants: PermissionGrants): void { requirePermission(grants, "platform.integration.manage"); }
function cleanScopes(scopes: readonly string[], grants: PermissionGrants, scopeGrants: readonly IntegrationScopeGrant[]): string[] {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 50) throw new AppError("VALIDATION", "INTEGRATION_SCOPES_INVALID", "Choose one or more valid integration scopes.");
  const policies = new Map(scopeGrants.map((entry) => [entry.scope, entry.grant]));
  const result = [...new Set(scopes)];
  for (const scope of result) {
    const grant = policies.get(scope);
    if (!SCOPE.test(scope) || !grant) throw new AppError("VALIDATION", "INTEGRATION_SCOPE_UNKNOWN", "One or more integration scopes are not available.");
    requirePermission(grants, grant);
  }
  return result;
}

export function createIntegrationTokenService(ports: IntegrationTokenPorts) {
  const { db, runTransaction, auditWriter: writer, now, generateId } = ports;
  return {
    async createOwn(input: { userId: string; displayName: string; grants: PermissionGrants; label: string; scopes: readonly string[]; expiresAt?: Date | null; scopeGrants?: readonly IntegrationScopeGrant[] }): Promise<CreatedIntegrationToken> {
      requireManage(input.grants);
      const label = input.label.trim();
      if (!label || label.length > 120) throw new AppError("VALIDATION", "INTEGRATION_TOKEN_LABEL_INVALID", "Give this token a label of up to 120 characters.");
      if (input.expiresAt && (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= now())) throw new AppError("VALIDATION", "INTEGRATION_TOKEN_EXPIRY_INVALID", "The token expiry must be in the future.");
      const scopes = cleanScopes(input.scopes, input.grants, input.scopeGrants ?? REFERENCE_SCOPE_GRANTS);
      const prefix = randomBytes(TOKEN_PREFIX_BYTES).toString("hex");
      const secretPart = randomBytes(SECRET_BYTES).toString("base64url");
      const secret = `sfk_${prefix}_${secretPart}`;
      const row = await runTransaction(async (tx) => {
        const created = await tx.integrationToken.create({ data: { id: generateId(), user_id: input.userId, label, token_prefix: prefix, token_hash: sha256(secret), scopes, expires_at: input.expiresAt ?? null } });
        await writer.write(prepareAuditEvent({ appId: "platform", action: "integration-token.create", entityType: "integration_token", entityId: created.id, actor: { kind: "USER", userId: input.userId, label: input.displayName }, metadata: { label, scopes, expiresAt: input.expiresAt ?? null } }, { now }), tx);
        return created;
      });
      return { token: toPublic(row), secret };
    },
    async listOwn(input: { userId: string; grants: PermissionGrants }): Promise<IntegrationTokenPublic[]> {
      requireManage(input.grants);
      return (await db.integrationToken.findMany({ where: { user_id: input.userId }, orderBy: { created_at: "desc" } })).map(toPublic);
    },
    async listAny(input: { grants: PermissionGrants; userId?: string }): Promise<IntegrationTokenPublic[]> {
      requirePermission(input.grants, "platform.integration.admin");
      return (await db.integrationToken.findMany({ where: input.userId ? { user_id: input.userId } : {}, orderBy: { created_at: "desc" } })).map(toPublic);
    },
    async revokeOwn(input: { userId: string; displayName: string; grants: PermissionGrants; tokenId: string }): Promise<void> {
      requireManage(input.grants);
      await revoke(input, { id: input.tokenId, user_id: input.userId });
    },
    async revokeAny(input: { userId: string; displayName: string; grants: PermissionGrants; tokenId: string }): Promise<void> {
      requirePermission(input.grants, "platform.integration.admin");
      await revoke(input, { id: input.tokenId });
    },
  };
  async function revoke(input: { userId: string; displayName: string; grants: PermissionGrants; tokenId: string }, where: { id: string; user_id?: string }): Promise<void> {
    await runTransaction(async (tx) => {
      const token = await tx.integrationToken.findFirst({ where });
      if (!token) throw new AppError("NOT_FOUND", "INTEGRATION_TOKEN_NOT_FOUND", "This token no longer exists.");
      if (token.revoked_at) return;
      await tx.integrationToken.update({ where: { id: token.id }, data: { revoked_at: now() } });
      await writer.write(prepareAuditEvent({ appId: "platform", action: "integration-token.revoke", entityType: "integration_token", entityId: token.id, actor: { kind: "USER", userId: input.userId, label: input.displayName }, metadata: { ownerUserId: token.user_id } }, { now }), tx);
    });
  }
}

export const integrationTokens = createIntegrationTokenService({ db: prisma, runTransaction: (work) => runSerializableTransaction(prisma, work), auditWriter: createAuditEventWriter(), now: () => new Date(), generateId: randomUUID });

type AuthenticatedIntegration = { tokenId: string; userId: string; displayName: string; grants: PermissionGrants; scopes: readonly string[] };
async function authenticate(request: Request): Promise<AuthenticatedIntegration> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (sfk_[a-f0-9]{12}_[A-Za-z0-9_-]{43})$/);
  if (!match) throw new AppError("UNAUTHENTICATED", "INTEGRATION_TOKEN_INVALID", "A valid integration token is required.");
  const token = await prisma.integrationToken.findUnique({ where: { token_hash: sha256(match[1]) }, include: { user: true } });
  const now = new Date();
  if (!token || token.revoked_at || (token.expires_at && token.expires_at <= now) || token.user.status !== "ACTIVE") throw new AppError("UNAUTHENTICATED", "INTEGRATION_TOKEN_INVALID", "A valid integration token is required.");
  const { grants } = await loadLiveGrants(prisma, token.user_id);
  await prisma.integrationToken.update({ where: { id: token.id }, data: { last_used_at: now } });
  return { tokenId: token.id, userId: token.user_id, displayName: token.user.display_name, grants, scopes: token.scopes };
}

export type IntegrationRouteOptions<T> = {
  scope: string;
  grant: PermissionId;
  body?: ZodType<T>;
  /** Maximum request body size before JSON parsing. Defaults to 1 MiB. */
  bodyLimitBytes?: number;
  write?: boolean;
  /** Write handlers must use `transaction` for their extension writes so the result and ledger commit together. */
  handle: (context: { principal: AuthenticatedIntegration; body: T; requestId: string; transaction?: TransactionClient }) => Promise<unknown> | unknown;
  /** Test-only clock injection; production routes use the current time. */
  now?: () => Date;
};
export function createIntegrationRouteHandler<T = undefined>(options: IntegrationRouteOptions<T>): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = randomUUID();
    try {
      const principal = await authenticate(request);
      if (!principal.scopes.includes(options.scope)) throw new AppError("FORBIDDEN", "INTEGRATION_SCOPE_DENIED", "This token does not have the required scope.");
      requirePermission(principal.grants, options.grant);
      const rawBody = options.body ? await readBodyWithinLimit(request, options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES) : "";
      let body: T;
      try { body = options.body ? options.body.parse(rawBody ? JSON.parse(rawBody) : undefined) : undefined as T; } catch { throw new AppError("VALIDATION", "INTEGRATION_BODY_INVALID", "The request body is invalid."); }
      if (!options.write) return respond(200, { ok: true, data: await options.handle({ principal, body, requestId }) }, requestId);
      const key = request.headers.get("idempotency-key");
      if (!key || !IDEMPOTENCY_KEY.test(key)) throw new AppError("VALIDATION", "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required for this request.");
      const requestHash = sha256(`${request.method} ${new URL(request.url).pathname}\n${rawBody}`);
      const now = options.now ?? (() => new Date());
      const result = await runSerializableTransaction(prisma, async (tx) => {
        const currentTime = now();
        await tx.integrationRequest.deleteMany({ where: { created_at: { lt: new Date(currentTime.getTime() - IDEMPOTENCY_RETENTION_MS) } } });
        const existing = await tx.integrationRequest.findUnique({ where: { token_id_key: { token_id: principal.tokenId, key } } });
        if (existing?.request_hash !== undefined && existing.request_hash !== requestHash) throw new AppError("CONFLICT", "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
        if (existing?.status === "COMPLETED") return { replay: existing };
        if (existing && existing.created_at > new Date(currentTime.getTime() - IDEMPOTENCY_LEASE_MS)) throw new AppError("CONFLICT", "IDEMPOTENCY_IN_PROGRESS", "This request is still being processed. Retry later.");
        let row;
        if (existing) {
          row = await tx.integrationRequest.update({ where: { id: existing.id }, data: { status: "IN_PROGRESS", response_status: null, response_body: undefined } });
        } else {
          try {
            row = await tx.integrationRequest.create({ data: { token_id: principal.tokenId, key, method_path: `${request.method} ${new URL(request.url).pathname}`, request_hash: requestHash, status: "IN_PROGRESS" } });
          } catch (error) {
            if (isUniqueConstraintError(error)) throw new AppError("CONFLICT", "IDEMPOTENCY_IN_PROGRESS", "This request is still being processed. Retry later.");
            throw error;
          }
        }
        let responseStatus = 200;
        let envelope: unknown;
        await tx.$executeRawUnsafe("SAVEPOINT integration_handler");
        try {
          envelope = { ok: true, data: await options.handle({ principal, body, requestId, transaction: tx }) };
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT integration_handler");
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT integration_handler");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT integration_handler");
          const payload = toSafeErrorPayload(error, { reportUnknownError: createOperationalErrorReporter("integration_write", requestId) });
          responseStatus = statusFor(payload.kind);
          if (responseStatus >= 500) throw error;
          envelope = { ok: false, error: payload };
        }
        await tx.integrationRequest.update({ where: { id: row.id }, data: { status: "COMPLETED", response_status: responseStatus, response_body: JSON.parse(JSON.stringify(envelope)) } });
        await createAuditEventWriter().write(prepareAuditEvent({ appId: "platform", action: "integration.write", entityType: "integration_request", entityId: row.id, actor: { kind: "USER", userId: principal.userId, label: principal.displayName }, requestId, metadata: { method: request.method, path: new URL(request.url).pathname } }), tx);
        return { responseStatus, envelope };
      });
      if (result.replay) return respond(result.replay.response_status ?? 500, result.replay.response_body, requestId, true);
      return respond(result.responseStatus, result.envelope, requestId);
    } catch (error) {
      const payload = toSafeErrorPayload(error, { reportUnknownError: createOperationalErrorReporter("integration_route", requestId) });
      return respond(statusFor(payload.kind), { ok: false, error: payload }, requestId);
    }
  };
}
async function readBodyWithinLimit(request: Request, limitBytes: number): Promise<string> {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 0) throw new AppError("VALIDATION", "INTEGRATION_BODY_LIMIT_INVALID", "The request body limit is invalid.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > limitBytes) throw new AppError("VALIDATION", "INTEGRATION_BODY_TOO_LARGE", "The request body is too large.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limitBytes) throw new AppError("VALIDATION", "INTEGRATION_BODY_TOO_LARGE", "The request body is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}
function respond(status: number, body: unknown, requestId: string, replayed = false): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...(replayed ? { "Idempotency-Replayed": "true" } : {}) } });
}

/** Session-only helper for the Lead's future account page. */
export async function requireIntegrationManager() {
  const result = await getPrincipalGrants();
  if (!result) throw new AppError("UNAUTHENTICATED", "NO_SESSION", "Please sign in to continue.");
  requireManage(result.grants);
  return result;
}
