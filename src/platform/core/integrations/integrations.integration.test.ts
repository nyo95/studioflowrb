import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { closePrismaConnection, type TransactionClient } from "@platform/core/db";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { AppError } from "@platform/core/errors";
import { initializePermissionRegistry, resetPermissionRegistryForTests } from "@platform/core/rbac/registry";
import type { PermissionGrants } from "@platform/core/rbac";

import { createIntegrationRouteHandler, createIntegrationTokenService, INTEGRATION_PING_GRANT, INTEGRATION_PING_SCOPE } from "./index";
import { GET, POST } from "@/app/api/integrations/v1/ping/route";

let db: TestDb;
const MANAGE = ["platform.integration.manage", INTEGRATION_PING_GRANT] as PermissionGrants;
const ADMIN = ["platform.integration.admin"] as PermissionGrants;

before(async () => {
  db = await createTestDb(requireDisposableTestDatabaseUrl());
  resetPermissionRegistryForTests();
  initializePermissionRegistry([]);
});
beforeEach(async () => { await truncatePlatformTables(db); });
after(async () => { await closePrismaConnection(); await closeTestDb(db); });

async function owner(grants: readonly string[] = MANAGE) {
  const user = await db.prisma.user.create({ data: { email: `${randomUUID()}@test.local`, display_name: "Integration Owner", password_hash: "x" } });
  const role = await db.prisma.role.create({ data: { code: `integration-${randomUUID()}`, name: "Integration role" } });
  await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
  await Promise.all(grants.map((permission_id) => db.prisma.rolePermission.create({ data: { role_id: role.id, permission_id } })));
  return { user, role };
}

function tokens() {
  return createIntegrationTokenService({
    db: db.prisma,
    runTransaction: (work) => db.prisma.$transaction(work),
    auditWriter: createAuditEventWriter(),
    now: () => new Date(),
    generateId: randomUUID,
  });
}

async function tokenFor(person: { id: string; display_name: string }, scopes: readonly string[] = [INTEGRATION_PING_SCOPE]) {
  return tokens().createOwn({ userId: person.id, displayName: person.display_name, grants: MANAGE, label: "Native client", scopes });
}

function request(method: "GET" | "POST", secret?: string, body?: unknown, key?: string) {
  return new Request("http://localhost/api/integrations/v1/ping", {
    method,
    headers: { ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function payload(response: Response) { return response.json() as Promise<{ ok: boolean; error?: { kind: string; code: string }; data?: unknown }>; }

describe("integration tokens", () => {
  it("returns a secret once, never persists or audits it, and keeps own/admin management boundaries", async () => {
    const first = await owner();
    const second = await owner();
    const created = await tokenFor(first.user);
    assert.match(created.secret, /^sfk_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    assert.equal((await db.prisma.integrationToken.findUniqueOrThrow({ where: { id: created.token.id } })).token_hash.includes(created.secret), false);
    assert.equal(JSON.stringify(await db.prisma.auditEvent.findMany()).includes(created.secret), false);
    assert.equal((await tokens().listOwn({ userId: first.user.id, grants: MANAGE })).length, 1);
    assert.equal((await tokens().listOwn({ userId: second.user.id, grants: MANAGE })).length, 0);
    await assert.rejects(() => tokens().listAny({ grants: MANAGE }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    assert.equal((await tokens().listAny({ grants: ADMIN })).length, 1);
    await assert.rejects(() => tokens().createOwn({ userId: second.user.id, displayName: second.user.display_name, grants: ADMIN, label: "No", scopes: [INTEGRATION_PING_SCOPE] }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    await assert.rejects(() => tokens().createOwn({ userId: first.user.id, displayName: first.user.display_name, grants: ["platform.integration.manage"] as PermissionGrants, label: "No scope grant", scopes: [INTEGRATION_PING_SCOPE] }), (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN");
    await tokens().revokeOwn({ userId: first.user.id, displayName: first.user.display_name, grants: MANAGE, tokenId: created.token.id });
    assert.ok((await db.prisma.integrationToken.findUniqueOrThrow({ where: { id: created.token.id } })).revoked_at);
    await assert.rejects(() => tokens().revokeOwn({ userId: second.user.id, displayName: second.user.display_name, grants: MANAGE, tokenId: created.token.id }), (error: unknown) => error instanceof AppError && error.kind === "NOT_FOUND");
  });
});

describe("integration route kit", () => {
  it("rejects every invalid token state safely and enforces live grant and scope checks", async () => {
    const { user, role } = await owner();
    const valid = await tokenFor(user);
    const invalidRequests = [request("GET"), request("GET", "Bearer nope"), request("GET", "sfk_aaaaaaaaaaaa_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")];
    for (const input of invalidRequests) {
      const response = await GET(input);
      assert.equal(response.status, 401);
      assert.deepEqual(await payload(response), { ok: false, error: { kind: "UNAUTHENTICATED", code: "INTEGRATION_TOKEN_INVALID", safeMessage: "A valid integration token is required." } });
    }
    await db.prisma.integrationToken.update({ where: { id: valid.token.id }, data: { expires_at: new Date(Date.now() - 1) } });
    assert.equal((await GET(request("GET", valid.secret))).status, 401);
    await db.prisma.integrationToken.update({ where: { id: valid.token.id }, data: { expires_at: null, revoked_at: new Date() } });
    assert.equal((await GET(request("GET", valid.secret))).status, 401);
    await db.prisma.integrationToken.update({ where: { id: valid.token.id }, data: { revoked_at: null } });
    await db.prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED", disabled_at: new Date() } });
    assert.equal((await GET(request("GET", valid.secret))).status, 401);
    await db.prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE", disabled_at: null } });
    await db.prisma.rolePermission.deleteMany({ where: { role_id: role.id, permission_id: INTEGRATION_PING_GRANT } });
    assert.equal((await GET(request("GET", valid.secret))).status, 403);
    await db.prisma.rolePermission.create({ data: { role_id: role.id, permission_id: INTEGRATION_PING_GRANT } });
    await db.prisma.integrationToken.update({ where: { id: valid.token.id }, data: { scopes: [] } });
    const noScope = valid;
    assert.equal((await GET(request("GET", noScope.secret))).status, 403);
  });

  it("serves GET and stores, replays, conflicts, expires and abandons write keys safely", async () => {
    const { user } = await owner();
    const created = await tokenFor(user);
    const get = await GET(request("GET", created.secret));
    assert.equal(get.status, 200);
    assert.equal((await payload(get)).ok, true);
    assert.equal((await POST(request("POST", created.secret, { value: "x" }))).status, 400);
    const first = await POST(request("POST", created.secret, { value: "x" }, "once"));
    assert.equal(first.status, 200);
    const replay = await POST(request("POST", created.secret, { value: "x" }, "once"));
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
    assert.equal((await POST(request("POST", created.secret, { value: "other" }, "once"))).status, 409);
    await db.prisma.integrationRequest.create({ data: { token_id: created.token.id, key: "busy", method_path: "POST /api/integrations/v1/ping", request_hash: "busy", status: "IN_PROGRESS" } });
    assert.equal((await POST(request("POST", created.secret, { value: "x" }, "busy"))).status, 409);
    await db.prisma.integrationRequest.create({ data: { token_id: created.token.id, key: "old", method_path: "POST /api/integrations/v1/ping", request_hash: "old", status: "COMPLETED", created_at: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    assert.equal((await POST(request("POST", created.secret, { value: "x" }, "old"))).status, 200);
  });

  it("rolls back server failures with extension writes, retains client errors, takes over an expired lease, and limits bodies", async () => {
    const { user } = await owner();
    const created = await tokenFor(user);
    let calls = 0;
    const clock = new Date("2026-10-09T00:00:00.000Z");
    const handler = createIntegrationRouteHandler({
      scope: INTEGRATION_PING_SCOPE,
      grant: INTEGRATION_PING_GRANT,
      write: true,
      body: z.object({ value: z.string() }),
      bodyLimitBytes: 32,
      now: () => clock,
      handle: async ({ principal, transaction }) => {
        calls += 1;
        await transaction!.userPreference.upsert({ where: { user_id: principal.userId }, create: { user_id: principal.userId, language: "id" }, update: { language: "id" } });
        if (calls === 1) throw new Error("temporary");
        if (calls === 3) throw new AppError("VALIDATION", "EXPECTED", "Expected client error.");
        return { calls };
      },
    });
    const transient = await handler(request("POST", created.secret, { value: "x" }, "retry"));
    assert.equal(transient.status, 500);
    assert.equal(await db.prisma.integrationRequest.count({ where: { key: "retry" } }), 0);
    assert.equal(await db.prisma.userPreference.count({ where: { user_id: user.id } }), 0);
    assert.equal((await handler(request("POST", created.secret, { value: "x" }, "retry"))).status, 200);
    assert.equal(await db.prisma.userPreference.count({ where: { user_id: user.id } }), 1);
    assert.equal((await handler(request("POST", created.secret, { value: "x" }, "client"))).status, 400);
    assert.equal((await handler(request("POST", created.secret, { value: "x" }, "client"))).headers.get("Idempotency-Replayed"), "true");
    await db.prisma.integrationRequest.create({ data: { token_id: created.token.id, key: "stale", method_path: "POST /api/integrations/v1/ping", request_hash: createHash("sha256").update("POST /api/integrations/v1/ping\n{\"value\":\"x\"}").digest("hex"), status: "IN_PROGRESS", created_at: new Date(clock.getTime() - 3 * 60 * 1000) } });
    assert.equal((await handler(request("POST", created.secret, { value: "x" }, "stale"))).status, 200);
    const oversized = await handler(new Request("http://localhost/api/integrations/v1/ping", { method: "POST", headers: { authorization: `Bearer ${created.secret}`, "idempotency-key": "large", "content-type": "application/json" }, body: JSON.stringify({ value: "this body is bigger than thirty-two bytes" }) }));
    assert.equal(oversized.status, 400);
  });
});
