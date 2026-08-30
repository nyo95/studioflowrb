import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { AppError } from "@platform/core/errors";
import { normalizeEmail } from "@platform/utilities/normalization";

import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "../db/test-support";
import { bootstrapFirstOwner } from "./bootstrap";
import { PLATFORM_PERMISSIONS } from "@platform/core/rbac/registry";
import { performLogin } from "./login";
import { hashPassword, isValidPasswordLength, verifyPassword } from "./password";
import {
  DEFAULT_SESSION_WINDOW,
  createSession,
  listUserSessions,
  resolveSession,
  revokeAllUserSessions,
  revokeSessionByToken,
  type DbClient,
} from "./session-service";
import { deriveLoginEmailKey, hashLimiterKey, type LoginLimitKeys, type LoginLimiter } from "./limiter";

/**
 * Foundation F0 identity integration proofs (work order §10): session
 * lifecycle, throttled touch, both expiries, revocation without token
 * refresh, indistinguishable login failures, last-admin-safe bootstrap, and
 * limiter policy.
 */

let db: TestDb;

before(async () => {
  requireDisposableTestDatabaseUrl();
  db = await createTestDb(await requireDisposableTestDatabaseUrl());
});

after(async () => {
  if (db) await closeTestDb(db);
});

/** Deterministic fake limiter: allows N attempts, records keys and resets. */
function fakeLimiter(options: { failClosed?: boolean } = {}): LoginLimiter & {
  consumed: LoginLimitKeys[];
  emailResets: string[];
} {
  const consumed: LoginLimitKeys[] = [];
  const emailResets: string[] = [];
  return {
    consumed,
    emailResets,
    async consume(keys: LoginLimitKeys) {
      if (options.failClosed) {
        throw new AppError("INFRASTRUCTURE", "LOGIN_LIMITER_UNAVAILABLE", "Sign-in is temporarily unavailable.");
      }
      consumed.push(keys);
      return { allowed: true };
    },
    async resetEmailBucket(emailKey: string) {
      emailResets.push(emailKey);
    },
  };
}

async function seedUser(overrides: Partial<{ email: string; status: "ACTIVE" | "DISABLED"; password: string }> = {}) {
  const email = overrides.email ?? "session-user@example.com";
  const passwordHash = await hashPassword(overrides.password ?? "correct horse battery staple");
  return db.prisma.user.create({
    data: {
      email,
      display_name: "Session User",
      password_hash: passwordHash,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

describe("session lifecycle", () => {
  it("resolves a fresh session with live roles and never persists the raw token", async () => {
    await truncatePlatformTables(db);
    const user = await seedUser();
    const role = await db.prisma.role.create({ data: { code: "staff", name: "Staff" } });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });

    const created = await createSession(db.prisma, { userId: user.id, now: new Date(0) });
    assert.equal(created.absoluteExpiresAt.getTime(), 7 * 24 * 60 * 60 * 1000);

    const rows = await db.prisma.session.findMany();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].token_hash.includes(created.rawToken), false);
    assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);

    const resolved = await resolveSession(db.prisma, created.rawToken, { now: new Date(1000) });
    assert.equal("session" in resolved && resolved.session !== null, true);
    if ("session" in resolved && resolved.session) {
      assert.deepEqual(resolved.session.roleIds, [role.id]);
      assert.equal(resolved.session.user.email, user.email);
      assert.equal(resolved.session.user.status, "ACTIVE");
    }
  });

  it("rejects unknown, revoked, expired, disabled, and role-less sessions", async () => {
    await truncatePlatformTables(db);
    const now = new Date();
    const user = await seedUser();
    const role = await db.prisma.role.create({ data: { code: "staff2", name: "Staff2" } });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    const active = await createSession(db.prisma, { userId: user.id, now });
    const roleLess = await seedUser({ email: "roleless@example.com" });
    const roleLessSession = await createSession(db.prisma, { userId: roleLess.id, now });
    const disabled = await seedUser({ email: "disabled@example.com", status: "DISABLED" });
    const disabledSession = await createSession(db.prisma, { userId: disabled.id, now });
    const expired = await createSession(db.prisma, {
      userId: user.id,
      now: new Date(now.getTime() - 10_000),
      window: { ...DEFAULT_SESSION_WINDOW, idleMs: 1000, absoluteMs: 5000 },
    });

    assert.deepEqual(await resolveSession(db.prisma, "no-such-token"), { session: null, rejected: "NOT_FOUND" });

    await revokeSessionByToken(db.prisma, active.rawToken);
    assert.deepEqual(await resolveSession(db.prisma, active.rawToken), { session: null, rejected: "REVOKED" });

    assert.deepEqual(await resolveSession(db.prisma, roleLessSession.rawToken), { session: null, rejected: "ROLE_LESS" });
    assert.deepEqual(await resolveSession(db.prisma, disabledSession.rawToken), { session: null, rejected: "USER_DISABLED" });
    assert.deepEqual(await resolveSession(db.prisma, expired.rawToken), { session: null, rejected: "EXPIRED" });

    // The disabled user's rejection must not refresh their session state.
    const stillRevocable = await listUserSessions(db.prisma, disabled.id);
    assert.equal(stillRevocable.every((session) => session.revokedAt === null), true);
  });

  it("throttles the last-seen touch and extends idle expiry within the absolute bound", async () => {
    await truncatePlatformTables(db);
    const user = await seedUser();
    const role = await db.prisma.role.create({ data: { code: "staff3", name: "Staff3" } });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    const start = new Date(0);
    const created = await createSession(db.prisma, { userId: user.id, now: start });

    const soon = new Date(start.getTime() + 1000);
    const first = await resolveSession(db.prisma, created.rawToken, { now: soon });
    assert.equal("session" in first && first.session !== null, true);
    let row = await db.prisma.session.findFirst();
    assert.equal(row?.last_seen_at.getTime(), start.getTime(), "no touch write before the interval");

    const afterInterval = new Date(start.getTime() + DEFAULT_SESSION_WINDOW.touchIntervalMs + 1000);
    const second = await resolveSession(db.prisma, created.rawToken, { now: afterInterval });
    assert.equal("session" in second && second.session !== null, true);
    row = await db.prisma.session.findFirst();
    assert.equal(row?.last_seen_at.getTime(), afterInterval.getTime());
    const expectedIdle = Math.min(created.absoluteExpiresAt.getTime(), afterInterval.getTime() + DEFAULT_SESSION_WINDOW.idleMs);
    assert.equal(row?.idle_expires_at.getTime(), expectedIdle);

    // Absolute expiry is non-sliding.
    assert.equal(row?.absolute_expires_at.getTime(), created.absoluteExpiresAt.getTime());
  });

  it("revokes all sessions of a user in one command", async () => {
    await truncatePlatformTables(db);
    const user = await seedUser();
    const a = await createSession(db.prisma, { userId: user.id });
    const b = await createSession(db.prisma, { userId: user.id });
    const revoked = await revokeAllUserSessions(db.prisma, user.id);
    assert.equal(revoked, 2);
    assert.deepEqual(await resolveSession(db.prisma, a.rawToken), { session: null, rejected: "REVOKED" });
    assert.deepEqual(await resolveSession(db.prisma, b.rawToken), { session: null, rejected: "REVOKED" });
  });
});

describe("login composition", () => {
  it("consumes hashed keys before verification and resets only the email bucket on success", async () => {
    await truncatePlatformTables(db);
    const user = await seedUser();
    const limiter = fakeLimiter();
    const outcome = await performLogin(
      { db: db.prisma as DbClient, limiter },
      { email: " Session-User@Example.COM ", password: "correct horse battery staple", networkKeySource: {} },
    );
    assert.equal(outcome.user.id, user.id);
    assert.equal(limiter.consumed.length, 1);
    const normalized = normalizeEmail(" Session-User@Example.COM ");
    const expectedEmailKey = deriveLoginEmailKey(normalized);
    assert.equal(limiter.consumed[0].emailKey, expectedEmailKey);
    assert.equal(limiter.consumed[0].emailKey, hashLimiterKey(normalized));
    assert.deepEqual(limiter.emailResets, [expectedEmailKey]);
  });

  it("makes unknown email, wrong password, malformed input, and disabled user indistinguishable", async () => {
    await truncatePlatformTables(db);
    await seedUser();
    await seedUser({ email: "off@example.com", status: "DISABLED" });
    const limiter = fakeLimiter();
    const inputs = [
      { email: "nobody@example.com", password: "correct horse battery staple", networkKeySource: {} },
      { email: "session-user@example.com", password: "wrong horse battery staple", networkKeySource: {} },
      { email: "off@example.com", password: "correct horse battery staple", networkKeySource: {} },
      { email: "", password: "correct horse battery staple", networkKeySource: {} },
      { email: "session-user@example.com", password: "short", networkKeySource: {} },
    ];
    const payloads: string[] = [];
    for (const input of inputs) {
      try {
        await performLogin({ db: db.prisma as DbClient, limiter }, input);
        assert.fail(`expected login failure for ${JSON.stringify(input)}`);
      } catch (error) {
        assert.ok(error instanceof AppError);
        assert.equal(error.kind, "UNAUTHENTICATED");
        assert.equal(error.code, "LOGIN_FAILED");
        payloads.push(JSON.stringify({ kind: error.kind, code: error.code, safeMessage: error.safeMessage }));
      }
    }
    assert.equal(new Set(payloads).size, 1, payloads.join(" | "));
  });

  it("fails closed when the limiter infrastructure is unavailable", async () => {
    await truncatePlatformTables(db);
    await seedUser();
    const limiter = fakeLimiter({ failClosed: true });
    await assert.rejects(
      () =>
        performLogin(
          { db: db.prisma as DbClient, limiter },
          { email: "session-user@example.com", password: "correct horse battery staple", networkKeySource: {} },
        ),
      (error: unknown) => error instanceof AppError && error.kind === "INFRASTRUCTURE" && error.code === "LOGIN_LIMITER_UNAVAILABLE",
    );
  });

  it("rejects out-of-policy passwords without hashing a user row", async () => {
    assert.equal(isValidPasswordLength("short"), false);
    const limiter = fakeLimiter();
    await assert.rejects(
      () => performLogin({ db: db.prisma as DbClient, limiter }, { email: "x@example.com", password: "short", networkKeySource: {} }),
      (error: unknown) => error instanceof AppError && error.code === "LOGIN_FAILED",
    );
  });
});

describe("bootstrap command", () => {
  it("creates the platform-owner role with explicit registry grants, owner, assignment, and audit", async () => {
    await truncatePlatformTables(db);
    const result = await bootstrapFirstOwner(
      {
        runTransaction: (work) => db.prisma.$transaction(work),
        auditWriter: { write: async (event, tx) => {
          await (tx as unknown as typeof db.prisma).auditEvent.create({
            data: {
              app_id: event.appId,
              action: event.action,
              entity_type: event.entityType,
              entity_id: event.entityId,
              actor_kind: event.actor.kind,
              actor_user_id: event.actor.userId ?? null,
              actor_label: event.actor.label,
              occurred_at: new Date(event.occurredAt),
              changes: event.changes as never,
              metadata: event.metadata as never,
            },
          });
        } },
        now: () => new Date(),
        generateId: () => crypto.randomUUID(),
      },
      { email: "owner@example.com", displayName: "Platform Owner", password: "correct horse battery staple", permissionIds: PLATFORM_PERMISSIONS },
    );
    const user = await db.prisma.user.findUnique({ where: { id: result.userId }, include: { user_roles: true } });
    assert.equal(user?.status, "ACTIVE");
    assert.equal(user?.password_hash.includes("correct horse"), false);
    const role = await db.prisma.role.findUnique({ where: { code: "platform-owner" }, include: { role_permissions: true } });
    assert.equal(role?.is_system, true);
    assert.equal(role?.role_permissions.length, 7);
    const audit = await db.prisma.auditEvent.findFirst({ where: { action: "bootstrap.first_owner" } });
    assert.equal(audit?.actor_kind, "SYSTEM");

    // Refuses when any active user already exists.
    await assert.rejects(
      () =>
        bootstrapFirstOwner(
          {
            runTransaction: (work) => db.prisma.$transaction(work),
            auditWriter: { write: async () => undefined },
            now: () => new Date(),
            generateId: () => crypto.randomUUID(),
          },
          { email: "second@example.com", displayName: "Second", password: "another valid password here", permissionIds: PLATFORM_PERMISSIONS },
        ),
      (error: unknown) => error instanceof AppError && error.kind === "CONFLICT" && error.code === "BOOTSTRAP_REFUSED",
    );

    // Reused role grants are never overwritten.
    await db.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user!.id }, data: { status: "DISABLED" } });
      await tx.session.updateMany({ where: { user_id: user!.id }, data: { revoked_at: new Date() } });
    });
    const grantsBefore = (await db.prisma.rolePermission.findMany({ where: { role_id: role!.id } })).length;
    const again = await bootstrapFirstOwner(
      {
        runTransaction: (work) => db.prisma.$transaction(work),
        auditWriter: { write: async () => undefined },
        now: () => new Date(),
        generateId: () => crypto.randomUUID(),
      },
      { email: "owner2@example.com", displayName: "Owner Two", password: "another valid password here", permissionIds: PLATFORM_PERMISSIONS },
    );
    const grantsAfter = (await db.prisma.rolePermission.findMany({ where: { role_id: role!.id } })).length;
    assert.equal(grantsBefore, grantsAfter);
    assert.notEqual(again.userId, result.userId);
  });
});
