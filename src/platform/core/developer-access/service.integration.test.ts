import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { closeTestDb, createTestDb, requireDisposableTestDatabaseUrl, truncatePlatformTables, type TestDb } from "@platform/core/db/test-support";
import { runSerializableTransaction } from "@platform/core/db/transactions";
import { isAppError } from "@platform/core/errors";
import { initializeModuleRegistry, resetModuleRegistryForTests } from "@platform/core/modules/manifest";
import { hashSessionToken } from "@platform/core/auth/token";

import { decodeBase32, totpAt } from "./crypto";
import { DEVELOPER_IDLE_MS, createDeveloperAccessService } from "./service";

let db: TestDb;

before(async () => {
  initializeModuleRegistry([
    { id: "studioflow", name: "StudioFlow", version: "1.0.0", kind: "core", requires: [] },
    { id: "ideas", name: "Ideas", version: "1.0.0", kind: "optional", parent: "studioflow", requires: ["studioflow"] },
  ]);
  db = await createTestDb(requireDisposableTestDatabaseUrl());
});

after(async () => {
  resetModuleRegistryForTests();
  if (db) await closeTestDb(db);
});

function harness(start = new Date("2026-10-11T12:00:00.000Z")) {
  let current = start;
  const service = createDeveloperAccessService({
    db: db.prisma,
    runTransaction: (work) => runSerializableTransaction(db.prisma, work),
    auditWriter: createAuditEventWriter(),
    sessionSecret: "integration-test-session-secret-value",
    now: () => current,
  });
  return {
    service,
    now: () => current,
    advance(milliseconds: number) { current = new Date(current.getTime() + milliseconds); },
  };
}

async function rejectsCode(work: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => isAppError(error) && error.code === code);
}

describe("Developer access lifecycle", () => {
  it("enrols once, signs in with TOTP, refuses replay and writes safe audits", async () => {
    await truncatePlatformTables(db);
    const h = harness();
    const enrollment = await h.service.enroll();
    await rejectsCode(() => h.service.enroll(), "DEVELOPER_ALREADY_ENROLLED");

    const code = totpAt(decodeBase32(enrollment.secret), h.now().getTime()).code;
    const signedIn = await h.service.signIn({ code, recovery: false, ip: "127.0.0.1", userAgent: "test" });
    assert.ok(await h.service.resolveSession(signedIn.rawToken));
    assert.equal((await db.prisma.developerSession.findFirst())?.token_hash.includes(signedIn.rawToken), false);
    await h.service.signOut(signedIn.rawToken);
    assert.equal(await h.service.resolveSession(signedIn.rawToken), null);
    await rejectsCode(() => h.service.signIn({ code, recovery: false }), "DEVELOPER_CODE_INVALID");

    const actions = (await db.prisma.auditEvent.findMany({ orderBy: { occurred_at: "asc" } })).map((row) => row.action);
    assert.deepEqual(actions, [
      "platform.developer.enrolled",
      "platform.developer.signed_in",
      "platform.developer.signed_out",
      "platform.developer.sign_in_failed",
    ]);
  });

  it("locks after five failures, persists the lock, and recovers after its window", async () => {
    await truncatePlatformTables(db);
    const h = harness();
    const enrollment = await h.service.enroll();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await rejectsCode(() => h.service.signIn({ code: "000000", recovery: false }), "DEVELOPER_CODE_INVALID");
    }
    await rejectsCode(() => h.service.signIn({ code: "000000", recovery: false }), "DEVELOPER_LOCKED");
    const locked = await db.prisma.developerAccess.findUniqueOrThrow({ where: { id: "developer" } });
    assert.equal(locked.failed_count, 5);
    assert.equal(locked.locked_until?.getTime(), h.now().getTime() + 15 * 60 * 1000);

    h.advance(15 * 60 * 1000 + 1);
    await rejectsCode(() => h.service.signIn({ code: "000000", recovery: false }), "DEVELOPER_CODE_INVALID");
    assert.equal((await db.prisma.developerAccess.findUniqueOrThrow({ where: { id: "developer" } })).failed_count, 1);
    const code = totpAt(decodeBase32(enrollment.secret), h.now().getTime()).code;
    await h.service.signIn({ code, recovery: false });
    const recovered = await db.prisma.developerAccess.findUniqueOrThrow({ where: { id: "developer" } });
    assert.equal(recovered.failed_count, 0);
    assert.equal(recovered.locked_until, null);
    assert.equal(await db.prisma.auditEvent.count({ where: { action: "platform.developer.locked" } }), 1);
  });

  it("consumes a recovery code once and expires idle sessions", async () => {
    await truncatePlatformTables(db);
    const h = harness();
    const enrollment = await h.service.enroll();
    const code = enrollment.recoveryCodes[0];
    const session = await h.service.signIn({ code, recovery: true });
    await rejectsCode(() => h.service.signIn({ code, recovery: true }), "DEVELOPER_CODE_INVALID");
    h.advance(DEVELOPER_IDLE_MS);
    assert.equal(await h.service.resolveSession(session.rawToken), null);
    const absolute = await h.service.signIn({ code: enrollment.recoveryCodes[1], recovery: true });
    await db.prisma.developerSession.update({
      where: { token_hash: (await db.prisma.developerSession.findFirstOrThrow()).token_hash },
      data: { expires_at: new Date(h.now().getTime() + 1_000) },
    });
    h.advance(1_000);
    assert.equal(await h.service.resolveSession(absolute.rawToken), null);
    assert.equal(await db.prisma.developerSession.count(), 0);
    assert.equal(await db.prisma.auditEvent.count({ where: { action: "platform.developer.recovery_code_used" } }), 2);
  });

  it("resets all Developer credentials and sessions", async () => {
    await truncatePlatformTables(db);
    const h = harness();
    const enrollment = await h.service.enroll();
    await h.service.signIn({ code: enrollment.recoveryCodes[0], recovery: true });
    assert.deepEqual(await h.service.reset(), { changed: true });
    assert.deepEqual(await h.service.enrollmentState(), { enrolled: false });
    assert.equal(await db.prisma.developerRecoveryCode.count(), 0);
    assert.equal(await db.prisma.developerSession.count(), 0);
    assert.equal(await db.prisma.auditEvent.count({ where: { action: "platform.developer.reset" } }), 1);
  });

  it("switches only optional modules and attributes the audit to developer-web", async () => {
    await truncatePlatformTables(db);
    const h = harness();
    const enrollment = await h.service.enroll();
    const session = await h.service.signIn({ code: enrollment.recoveryCodes[0], recovery: true });
    assert.deepEqual(await h.service.setModuleState(session.rawToken, "ideas", "DISABLED"), { changed: true, state: "DISABLED" });
    await rejectsCode(() => h.service.setModuleState(session.rawToken, "studioflow", "DISABLED"), "MODULE_CORE_STATE_REFUSED");
    const event = await db.prisma.auditEvent.findFirstOrThrow({ where: { action: "platform.module.disabled" } });
    assert.equal(event.actor_kind, "SYSTEM");
    assert.equal(event.actor_label, "developer-web");
  });

  it("never accepts an ordinary app session, even for an app user with a role", async () => {
    await truncatePlatformTables(db);
    const rawAppToken = "ordinary-app-session-token";
    const user = await db.prisma.user.create({ data: { email: "owner@example.com", display_name: "Owner", password_hash: "fixture" } });
    const role = await db.prisma.role.create({ data: { code: "platform-owner", name: "Platform Owner", is_system: true } });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: role.id } });
    await db.prisma.session.create({ data: {
      token_hash: hashSessionToken(rawAppToken),
      user_id: user.id,
      last_seen_at: new Date(),
      idle_expires_at: new Date(Date.now() + 60_000),
      absolute_expires_at: new Date(Date.now() + 60_000),
    } });
    const h = harness();
    await rejectsCode(() => h.service.listModules(rawAppToken), "DEVELOPER_SESSION_REQUIRED");
    await rejectsCode(() => h.service.setModuleState(rawAppToken, "ideas", "DISABLED"), "DEVELOPER_SESSION_REQUIRED");
    assert.equal(await db.prisma.moduleState.count(), 0);
  });
});
