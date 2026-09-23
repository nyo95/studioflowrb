import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { AppError } from "@platform/core/errors";
import { createAuditEventWriter } from "@platform/core/audit/persistence";

import {
  closeTestDb,
  createTestDb,
  requireDisposableTestDatabaseUrl,
  truncatePlatformTables,
  type TestDb,
} from "../db/test-support";
import { initializePermissionRegistry, PLATFORM_PERMISSIONS, resetPermissionRegistryForTests } from "./registry";
import { createPlatformAccessService, loadLiveGrants, type PlatformAccessService } from "./services";
import { hashPassword } from "../auth/password";

/**
 * Foundation F0 RBAC integration proofs (work order §6/§10): live grant
 * resolution, unknown-grant integrity, last-access-administrator protection,
 * self-demotion, archived/system role rules, safe no-ops, and atomic
 * rollback of mutation + audit.
 */

const REGISTRY_INPUT = [
  {
    appId: "masterdata",
    name: "Master Data",
    rootPath: "/masterdata",
    permissions: ["masterdata.access", "masterdata.price.read"],
  },
];

let db: TestDb;
let service: PlatformAccessService;

const ACTOR = { kind: "USER" as const, userId: "", label: "Owner" };
const FULL_GRANTS = [...PLATFORM_PERMISSIONS, "masterdata.access", "masterdata.price.read"];

async function auditCount(): Promise<number> {
  return db.prisma.auditEvent.count();
}

before(async () => {
  requireDisposableTestDatabaseUrl();
  db = await createTestDb(await requireDisposableTestDatabaseUrl());
  service = createPlatformAccessService({
    db: db.prisma,
    runTransaction: (work) => db.prisma.$transaction(work),
    auditWriter: createAuditEventWriter(),
    now: () => new Date(),
    generateId: () => crypto.randomUUID(),
  });
  resetPermissionRegistryForTests();
  initializePermissionRegistry(REGISTRY_INPUT);
});

beforeEach(async () => {
  await truncatePlatformTables(db);
});

after(async () => {
  resetPermissionRegistryForTests();
  await closeTestDb(db);
});

async function seedAdmin(email: string, displayName: string, grants: readonly string[] = FULL_GRANTS) {
  const role = await db.prisma.role.create({
    data: {
      code: `admin-${email.split("@")[0]}`,
      name: "Admin",
      role_permissions: { create: grants.map((permission_id) => ({ permission_id })) },
    },
  });
  const user = await db.prisma.user.create({
    data: {
      email,
      display_name: displayName,
      password_hash: await hashPassword("correct horse battery staple"),
      user_roles: { create: { role_id: role.id } },
    },
  });
  ACTOR.userId = ACTOR.userId || user.id;
  return { user, role };
}

describe("live grant resolution", () => {
  it("returns the union of grants over live roles and drops unknown persisted ids", async () => {
    const { user, role } = await seedAdmin("grants@example.com", "Grants", [...FULL_GRANTS, "ghost.permission.read"]);
    const second = await db.prisma.role.create({
      data: { code: "extra", name: "Extra", role_permissions: { create: [{ permission_id: "masterdata.price.read" }] } },
    });
    await db.prisma.userRole.create({ data: { user_id: user.id, role_id: second.id } });

    const resolved = await loadLiveGrants(db.prisma, user.id);
    assert.deepEqual([...resolved.grants].sort(), [...new Set([...FULL_GRANTS, "masterdata.price.read"])].sort());
    assert.deepEqual(resolved.unknownGrantIds, ["ghost.permission.read"]);
    assert.equal(role.code.startsWith("admin-"), true);
  });

  it("grants nothing when the assigned role is archived", async () => {
    const { user, role } = await seedAdmin("archived@example.com", "Archived");
    await db.prisma.role.update({ where: { id: role.id }, data: { archived_at: new Date() } });
    const resolved = await loadLiveGrants(db.prisma, user.id);
    assert.deepEqual(resolved.grants, []);
    assert.deepEqual(resolved.unknownGrantIds, []);
  });
});

describe("user commands", () => {
  it("creates a user with credentials and role assignments and audits once", async () => {
    const role = await db.prisma.role.create({ data: { code: "clerk", name: "Clerk" } });
    const result = await service.createUser({
      grants: ["platform.user.manage"],
      actor: { kind: "USER", userId: "creator", label: "Creator" },
      email: "New.User@Example.com ",
      displayName: "  New User  ",
      password: "correct horse battery staple",
      roleIds: [role.id],
    });
    const created = await db.prisma.user.findUnique({ where: { id: result.userId } });
    assert.equal(created?.email, "new.user@example.com");
    assert.equal(created?.display_name, "New User");
    assert.equal(created?.password_hash.startsWith("$argon2id$"), true);
    const assignments = await db.prisma.userRole.findMany({ where: { user_id: result.userId } });
    assert.equal(assignments.length, 1);
    const events = await db.prisma.auditEvent.findMany({ where: { action: "user.create" } });
    assert.equal(events.length, 1);
    assert.equal(JSON.stringify(events[0].metadata).includes("correct horse"), false);
    await assert.rejects(
      () =>
        service.createUser({
          grants: ["platform.user.manage"],
          actor: { kind: "USER", userId: "creator", label: "Creator" },
          email: "new.user@example.com",
          displayName: "Dup",
          password: "correct horse battery staple",
        }),
      (error: unknown) => error instanceof AppError && error.kind === "CONFLICT",
    );
  });

  it("refuses password-policy violations and unmanageable grants", async () => {
    await assert.rejects(
      () =>
        service.createUser({
          grants: ["platform.user.manage"],
          actor: { kind: "USER", userId: "x", label: "X" },
          email: "short@example.com",
          displayName: "Short",
          password: "short",
        }),
      (error: unknown) => error instanceof AppError && error.code === "PASSWORD_POLICY",
    );
    await assert.rejects(
      () =>
        service.createUser({
          grants: ["platform.settings.read"],
          actor: { kind: "USER", userId: "x", label: "X" },
          email: "short@example.com",
          displayName: "Short",
          password: "correct horse battery staple",
        }),
      (error: unknown) => error instanceof AppError && error.kind === "FORBIDDEN",
    );
  });

  it("treats unchanged display-name updates as safe no-ops without audit rows", async () => {
    const { user } = await seedAdmin("noop@example.com", "Noop");
    const before = await auditCount();
    const result = await service.updateUserDisplayName({
      grants: ["platform.user.manage"],
      actor: ACTOR,
      userId: user.id,
      displayName: " Noop ",
    });
    assert.equal(result.changed, false);
    assert.equal(await auditCount(), before);
    const changed = await service.updateUserDisplayName({
      grants: ["platform.user.manage"],
      actor: ACTOR,
      userId: user.id,
      displayName: "Renamed",
    });
    assert.equal(changed.changed, true);
    const event = await db.prisma.auditEvent.findFirst({ where: { action: "user.update" } });
    assert.deepEqual(event?.changes, { display_name: { from: "Noop", to: "Renamed" } });
  });

  it("setting a user password revokes every active session", async () => {
    const { user } = await seedAdmin("pwset@example.com", "PwSet");
    const sessions = await Promise.all([
      db.prisma.session.create({ data: { token_hash: "1".repeat(64), user_id: user.id, last_seen_at: new Date(), idle_expires_at: new Date(Date.now() + 1000), absolute_expires_at: new Date(Date.now() + 2000) } }),
      db.prisma.session.create({ data: { token_hash: "2".repeat(64), user_id: user.id, last_seen_at: new Date(), idle_expires_at: new Date(Date.now() + 1000), absolute_expires_at: new Date(Date.now() + 2000) } }),
    ]);
    await service.setUserPassword({
      grants: ["platform.user.manage"],
      actor: ACTOR,
      userId: user.id,
      password: "another correct horse battery",
    });
    const revoked = await db.prisma.session.findMany();
    assert.equal(revoked.length, sessions.length);
    assert.ok(revoked.every((session) => session.revoked_at !== null));
  });

  it("refuses disabling the final access administrator and rolls back fully", async () => {
    const { user } = await seedAdmin("last-admin@example.com", "Last Admin");
    const before = await auditCount();
    await assert.rejects(
      () => service.disableUser({ grants: ["platform.user.manage"], actor: ACTOR, userId: user.id }),
      (error: unknown) => error instanceof AppError && error.code === "LAST_ACCESS_ADMINISTRATOR",
    );
    const after = await db.prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(after?.status, "ACTIVE");
    assert.equal(await auditCount(), before);
  });

  it("disables a user, revokes sessions, and audits when another administrator remains", async () => {
    const first = await seedAdmin("admin-one@example.com", "Admin One");
    const second = await seedAdmin("admin-two@example.com", "Admin Two");
    await db.prisma.session.create({ data: { token_hash: "3".repeat(64), user_id: second.user.id, last_seen_at: new Date(), idle_expires_at: new Date(Date.now() + 1000), absolute_expires_at: new Date(Date.now() + 2000) } });
    const result = await service.disableUser({
      grants: ["platform.user.manage"],
      actor: ACTOR,
      userId: second.user.id,
    });
    assert.equal(result.changed, true);
    const updated = await db.prisma.user.findUnique({ where: { id: second.user.id } });
    assert.equal(updated?.status, "DISABLED");
    assert.notEqual(updated?.disabled_at, null);
    const sessions = await db.prisma.session.findMany({ where: { user_id: second.user.id } });
    assert.ok(sessions.every((session) => session.revoked_at !== null));
    assert.notEqual(await db.prisma.auditEvent.findFirst({ where: { action: "user.disable" } }), null);
    void first;
  });

  it("restoring an active user is a no-op; restore is audited for disabled users", async () => {
    const { user } = await seedAdmin("restore@example.com", "Restore");
    const before = await auditCount();
    const noOp = await service.restoreUser({ grants: ["platform.user.manage"], actor: ACTOR, userId: user.id });
    assert.equal(noOp.changed, false);
    assert.equal(await auditCount(), before);
    await db.prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED", disabled_at: new Date() } });
    const changed = await service.restoreUser({ grants: ["platform.user.manage"], actor: ACTOR, userId: user.id });
    assert.equal(changed.changed, true);
    const restored = await db.prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(restored?.status, "ACTIVE");
    assert.equal(restored?.disabled_at, null);
  });
});

describe("role commands and grants", () => {
  it("creates roles with registry-validated grants and refuses unknown permissions", async () => {
    const result = await service.createRole({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      code: " pricing-viewer ",
      name: "Pricing Viewer",
      permissionIds: ["masterdata.price.read"],
    });
    const role = await db.prisma.role.findUnique({ where: { id: result.roleId } });
    assert.equal(role?.code, "pricing-viewer");
    await assert.rejects(
      () =>
        service.createRole({
          grants: ["platform.role.manage"],
          actor: ACTOR,
          code: "broken",
          name: "Broken",
          permissionIds: ["ghost.permission.write"],
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_PERMISSION",
    );
  });

  it("lists assignable roles with their granted permission IDs (Users' role picker groups by these, not by role name)", async () => {
    await service.createRole({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      code: "grouping-check",
      name: "Grouping Check",
      permissionIds: ["masterdata.access", "masterdata.price.read"],
    });
    const noGrantsRole = await service.createRole({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      code: "grouping-check-empty",
      name: "Grouping Check Empty",
      permissionIds: [],
    });
    const assignable = await service.listAssignableRoles({ grants: ["platform.user.read"] });
    const found = assignable.find((role) => role.code === "grouping-check");
    assert.deepEqual(found?.permissionIds.slice().sort(), ["masterdata.access", "masterdata.price.read"]);
    const empty = assignable.find((role) => role.id === noGrantsRole.roleId);
    assert.deepEqual(empty?.permissionIds, []);
  });

  it("refuses archiving system roles and roles with active assignments", async () => {
    const { role } = await seedAdmin("archive-admin@example.com", "Archive Admin");
    await assert.rejects(
      () => service.archiveRole({ grants: ["platform.role.manage"], actor: ACTOR, roleId: role.id }),
      (error: unknown) => error instanceof AppError && error.code === "ROLE_IN_USE",
    );
    const system = await db.prisma.role.create({ data: { code: "system-role", name: "System", is_system: true } });
    await assert.rejects(
      () => service.archiveRole({ grants: ["platform.role.manage"], actor: ACTOR, roleId: system.id }),
      (error: unknown) => error instanceof AppError && error.code === "ROLE_SYSTEM_ARCHIVE_REFUSED",
    );
  });

  it("archives unassigned roles; an archived role grants nothing and cannot be newly assigned", async () => {
    const role = await db.prisma.role.create({
      data: { code: "dormant", name: "Dormant", role_permissions: { create: [{ permission_id: "masterdata.price.read" }] } },
    });
    const changed = await service.archiveRole({ grants: ["platform.role.manage"], actor: ACTOR, roleId: role.id });
    assert.equal(changed.changed, true);
    const archived = await db.prisma.role.findUnique({ where: { id: role.id } });
    assert.notEqual(archived?.archived_at, null);
    const again = await service.archiveRole({ grants: ["platform.role.manage"], actor: ACTOR, roleId: role.id });
    assert.equal(again.changed, false);
    const viewer = await db.prisma.user.create({
      data: { email: "viewer@example.com", display_name: "Viewer", password_hash: "x" },
    });
    await assert.rejects(
      () => service.assignUserRole({ grants: ["platform.role.manage"], actor: ACTOR, userId: viewer.id, roleId: role.id }),
      (error: unknown) => error instanceof AppError && error.code === "ROLE_ARCHIVED",
    );
  });

  it("replaces grants atomically, refuses unknown ids, and no-ops on identical sets", async () => {
    const role = await db.prisma.role.create({
      data: { code: "grantable", name: "Grantable", role_permissions: { create: [{ permission_id: "masterdata.price.read" }] } },
    });
    const before = await auditCount();
    const noOp = await service.replaceRoleGrants({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      roleId: role.id,
      permissionIds: ["masterdata.price.read"],
    });
    assert.equal(noOp.changed, false);
    assert.equal(await auditCount(), before);

    const changed = await service.replaceRoleGrants({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      roleId: role.id,
      permissionIds: ["masterdata.price.read", "platform.audit.read", "masterdata.access"],
    });
    assert.equal(changed.changed, true);
    const grants = await db.prisma.rolePermission.findMany({ where: { role_id: role.id }, orderBy: { permission_id: "asc" } });
    assert.deepEqual(grants.map((grant) => grant.permission_id), ["masterdata.access", "masterdata.price.read", "platform.audit.read"]);
    assert.notEqual(await db.prisma.auditEvent.findFirst({ where: { action: "role.grants_replace" } }), null);

    await assert.rejects(
      () =>
        service.replaceRoleGrants({
          grants: ["platform.role.manage"],
          actor: ACTOR,
          roleId: role.id,
          permissionIds: ["ghost.permission.write"],
        }),
      (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_PERMISSION",
    );
    const afterFailure = await db.prisma.rolePermission.findMany({ where: { role_id: role.id } });
    assert.equal(afterFailure.length, 3);
  });

  it("refuses grant replacement that would strip the last access administrator", async () => {
    const { user, role } = await seedAdmin("solo-admin@example.com", "Solo Admin");
    await assert.rejects(
      () =>
        service.replaceRoleGrants({
          grants: ["platform.role.manage"],
          actor: ACTOR,
          roleId: role.id,
          permissionIds: ["platform.settings.read"],
        }),
      (error: unknown) => error instanceof AppError && error.code === "LAST_ACCESS_ADMINISTRATOR",
    );
    const grants = await db.prisma.rolePermission.findMany({ where: { role_id: role.id } });
    assert.equal(grants.length, FULL_GRANTS.length);
    const stillActive = await db.prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(stillActive?.status, "ACTIVE");
  });

  it("allows self-demotion only when another active access administrator remains", async () => {
    const first = await seedAdmin("self-demo-a@example.com", "Self Demo A");
    const second = await seedAdmin("self-demo-b@example.com", "Self Demo B");
    await service.removeUserRole({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      userId: first.user.id,
      roleId: first.role.id,
    });
    const remaining = await loadLiveGrants(db.prisma, first.user.id);
    assert.deepEqual(remaining.grants, []);
    // Only second remains as administrator; removing their role must fail.
    await assert.rejects(
      () =>
        service.removeUserRole({
          grants: ["platform.role.manage"],
          actor: ACTOR,
          userId: second.user.id,
          roleId: second.role.id,
        }),
      (error: unknown) => error instanceof AppError && error.code === "LAST_ACCESS_ADMINISTRATOR",
    );
    void second;
  });

  it("treats duplicate assignment and unassigned removal as safe no-ops", async () => {
    const { user, role } = await seedAdmin("noop-assign@example.com", "Noop Assign");
    const before = await auditCount();
    const noOpAssign = await service.assignUserRole({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      userId: user.id,
      roleId: role.id,
    });
    assert.equal(noOpAssign.changed, false);
    const noOpRemove = await service.removeUserRole({
      grants: ["platform.role.manage"],
      actor: ACTOR,
      userId: user.id,
      roleId: "00000000-0000-4000-8000-000000000000",
    });
    assert.equal(noOpRemove.changed, false);
    assert.equal(await auditCount(), before);
  });
});

describe("transactional audit", () => {
  it("rolls back the business mutation and its audit event together on failure", async () => {
    const role = await db.prisma.role.create({ data: { code: "rollback", name: "Rollback" } });
    const before = await auditCount();
    await assert.rejects(
      () =>
        db.prisma.$transaction(async (tx) => {
          const created = await tx.role.create({
            data: { code: "doomed", name: "Doomed", role_permissions: { create: [{ permission_id: "platform.audit.read" }] } },
          });
          await createAuditEventWriter().write(
            {
              appId: "platform",
              action: "role.create",
              entityType: "role",
              entityId: created.id,
              actor: { kind: "SYSTEM", label: "test" },
              occurredAt: new Date().toISOString(),
            },
            tx,
          );
          // Duplicate code forces the transaction to abort AFTER the audit write.
          await tx.role.create({ data: { code: "rollback", name: "Conflict" } });
        }),
    );
    assert.equal(await auditCount(), before);
    assert.equal(await db.prisma.role.findUnique({ where: { code: "doomed" } }), null);
    void role;
  });
});
