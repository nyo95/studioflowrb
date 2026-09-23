import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prepareAuditEvent, type AuditActor, type AuditWriter } from "@platform/core/audit";
import { AppError, mapPrismaKnownError } from "@platform/core/errors";

import { requirePermission, type PermissionGrants, type PermissionId } from "./index";
import { getPermissionRegistry } from "./registry";
import { parseDisplayName, parseIdentityEmail, parsePassword } from "../auth/identity-validation";

/**
 * Persisted RBAC storage and access administration (CORE.md §3/§4, Foundation
 * F0 §6). Core owns Role/UserRole/RolePermission storage, live grant
 * resolution, and the last-access-administrator invariant. Apps own their own
 * permission IDs only.
 *
 * - effective permission is the union of explicit RolePermission rows over
 *   live (non-archived) assigned Roles;
 * - unknown persisted permission IDs grant nothing and are reported as
 *   integrity failures to authorized administrators;
 * - no admin bypass, no fallback role, no wildcard permission;
 * - every command validates permission at entry, opens ONE transaction,
 *   writes its audit event in the same transaction, and treats no-ops as
 *   safe (no write, no audit event).
 */

/** The combined capability that must always retain at least one active holder. */
export const ACCESS_ADMINISTRATOR_PERMISSIONS = [
  "platform.user.manage",
  "platform.role.manage",
] as const satisfies readonly PermissionId[];

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type TransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export type PlatformAccessPorts = {
  db: PrismaClient;
  runTransaction: TransactionRunner;
  auditWriter: AuditWriter;
  now: () => Date;
  generateId: () => string;
};

export type ResolvedLiveGrants = {
  grants: PermissionGrants;
  /** Persisted grant IDs absent from the code registry — integrity failures. */
  unknownGrantIds: readonly string[];
};

/** Union of live grants for a user, filtered through the code-owned registry. */
export async function loadLiveGrants(db: DbClient, userId: string): Promise<ResolvedLiveGrants> {
  const registry = getPermissionRegistry();
  const assignments = await db.userRole.findMany({
    where: { user_id: userId, role: { archived_at: null } },
    select: { role: { select: { role_permissions: { select: { permission_id: true } } } } },
  });
  const seen = new Set<string>();
  for (const assignment of assignments) {
    for (const grant of assignment.role.role_permissions) seen.add(grant.permission_id);
  }
  const grants: string[] = [];
  const unknownGrantIds: string[] = [];
  for (const id of seen) {
    if (registry.has(id)) grants.push(id);
    else unknownGrantIds.push(id);
  }
  return { grants: Object.freeze(grants), unknownGrantIds: Object.freeze(unknownGrantIds) };
}

/** Integrity report for authorized administrators: persisted grants no longer in the registry. */
export async function listGrantIntegrityIssues(db: DbClient): Promise<
  { roleId: string; roleCode: string; permissionId: string }[]
> {
  const registry = getPermissionRegistry();
  const rows = await db.rolePermission.findMany({
    select: { permission_id: true, role: { select: { id: true, code: true } } },
    orderBy: [{ role: { code: "asc" } }, { permission_id: "asc" }],
  });
  return rows
    .filter((row) => !registry.has(row.permission_id))
    .map((row) => ({ roleId: row.role.id, roleCode: row.role.code, permissionId: row.permission_id }));
}

export function createPlatformAccessService(ports: PlatformAccessPorts) {
  const { db, runTransaction, auditWriter, now, generateId } = ports;

  async function writeAudit(tx: Prisma.TransactionClient, event: Parameters<typeof prepareAuditEvent>[0]): Promise<void> {
    await auditWriter.write(prepareAuditEvent(event, { now }), tx);
  }

  /** Active users holding BOTH access-administrator permissions via live roles. */
  async function listAccessAdministratorIds(tx: DbClient): Promise<string[]> {
    const assignments = await tx.userRole.findMany({
      where: {
        user: { status: "ACTIVE" },
        role: { archived_at: null, role_permissions: { some: { permission_id: { in: [...ACCESS_ADMINISTRATOR_PERMISSIONS] } } } },
      },
      select: {
        user_id: true,
        role: { select: { role_permissions: { select: { permission_id: true } } } },
      },
    });
    const byUser = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      let set = byUser.get(assignment.user_id);
      if (!set) byUser.set(assignment.user_id, (set = new Set()));
      for (const grant of assignment.role.role_permissions) set.add(grant.permission_id);
    }
    return [...byUser.entries()]
      .filter(([, permissionIds]) =>
        ACCESS_ADMINISTRATOR_PERMISSIONS.every((permission) => permissionIds.has(permission)))
      .map(([userId]) => userId);
  }

  /** Whether one user would still hold BOTH permissions over the given live role grant union. */
  function unionHasBoth(permissionIds: Iterable<string>): boolean {
    const set = new Set(permissionIds);
    return ACCESS_ADMINISTRATOR_PERMISSIONS.every((permission) => set.has(permission));
  }

  async function isAccessAdministrator(tx: DbClient, userId: string): Promise<boolean> {
    return (await listAccessAdministratorIds(tx)).includes(userId);
  }

  async function requireChangeKeepsAccessAdministrator(
    tx: DbClient,
    options: { affectedUserIds: string[]; simulate: (tx: DbClient, userId: string) => Promise<boolean> },
  ): Promise<void> {
    const administrators = await listAccessAdministratorIds(tx);
    if (administrators.length === 0) return;
    for (const userId of options.affectedUserIds) {
      if (!administrators.includes(userId)) continue;
      if (administrators.length > 1) continue;
      const keepsCapability = await options.simulate(tx, userId);
      if (!keepsCapability) {
        throw new AppError(
          "CONFLICT",
          "LAST_ACCESS_ADMINISTRATOR",
          "This change is refused: at least one active user must keep user and role management access.",
        );
      }
    }
  }

  async function userHasBothAdminPermissionsExcludingRole(
    tx: DbClient,
    userId: string,
    excludedRoleId: string,
  ): Promise<boolean> {
    const assignments = await tx.userRole.findMany({
      where: { user_id: userId, role: { archived_at: null, id: { not: excludedRoleId } } },
      select: { role: { select: { role_permissions: { select: { permission_id: true } } } } },
    });
    const permissionIds = assignments.flatMap((assignment) =>
      assignment.role.role_permissions.map((grant) => grant.permission_id));
    return unionHasBoth(permissionIds);
  }

  async function userHasBothAdminPermissionsWithRoleGrants(
    tx: DbClient,
    userId: string,
    roleId: string,
    rolePermissionIds: readonly string[],
  ): Promise<boolean> {
    const assignments = await tx.userRole.findMany({
      where: { user_id: userId, role: { archived_at: null, id: { not: roleId } } },
      select: { role: { select: { role_permissions: { select: { permission_id: true } } } } },
    });
    const permissionIds = assignments.flatMap((assignment) =>
      assignment.role.role_permissions.map((grant) => grant.permission_id));
    const registry = getPermissionRegistry();
    for (const permissionId of rolePermissionIds) {
      if (registry.has(permissionId)) permissionIds.push(permissionId);
    }
    return unionHasBoth(permissionIds);
  }

  function assertKnownPermissionIds(permissionIds: readonly string[]): void {
    const registry = getPermissionRegistry();
    for (const permissionId of permissionIds) {
      if (!registry.has(permissionId)) {
        throw new AppError(
          "VALIDATION",
          "UNKNOWN_PERMISSION",
          "One or more selected permissions are not registered.",
        );
      }
    }
  }

  /** Maps known Prisma failures to the shared taxonomy inside commands. */
  function mapKnownWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) throw mapPrismaKnownError(error);
    throw error as Error;
  }

  const USER_PERMISSION = "platform.user.manage" as const;
  const ROLE_PERMISSION = "platform.role.manage" as const;

  function userActorContext(actor: AuditActor): void {
    if (actor.kind === "USER" && !actor.userId) {
      throw new AppError("INVARIANT", "AUDIT_ACTOR_REQUIRED", "An authenticated actor is required.");
    }
  }

  return {
    // ── Directory reads ──────────────────────────────────────────────────
    /**
     * Lists users for the access directory. Requires `platform.user.read`.
     * `search` filters by email/display-name substring; allowed sort keys are
     * fixed and deterministic (`email` | `created_at`).
     */
    async listUsers(input: {
      grants: PermissionGrants;
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: "email" | "created_at";
      sortDirection?: "asc" | "desc";
    }) {
      requirePermission(input.grants, "platform.user.read");
      const page = Math.max(1, Math.trunc(input.page ?? 1));
      const pageSize = Math.min(Math.max(1, Math.trunc(input.pageSize ?? 20)), 100);
      const search = input.search?.trim();
      const where: Prisma.UserWhereInput = search
        ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { display_name: { contains: search, mode: "insensitive" } }] }
        : {};
      const sortBy = input.sortBy ?? "created_at";
      const sortDirection = input.sortDirection === "asc" ? "asc" : "desc";
      const [total, rows] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            display_name: true,
            status: true,
            created_at: true,
            disabled_at: true,
            user_roles: {
              select: { role: { select: { id: true, code: true, name: true, archived_at: true } } },
              orderBy: { assigned_at: "asc" },
            },
          },
          orderBy: { [sortBy]: sortDirection },
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
      ]);
      return {
        total,
        page,
        pageSize,
        users: rows.map((row) => ({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          status: row.status,
          createdAt: row.created_at,
          disabledAt: row.disabled_at,
          roles: row.user_roles.map((assignment) => ({
            id: assignment.role.id,
            code: assignment.role.code,
            name: assignment.role.name,
            archived: assignment.role.archived_at !== null,
          })),
        })),
      };
    },

    async listRoles(input: { grants: PermissionGrants; includeArchived?: boolean }) {
      requirePermission(input.grants, "platform.role.read");
      const rows = await db.role.findMany({
        where: input.includeArchived ? {} : { archived_at: null },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          is_system: true,
          archived_at: true,
          created_at: true,
          user_roles: { select: { user_id: true, user: { select: { status: true } } } },
          role_permissions: { select: { permission_id: true }, orderBy: { permission_id: "asc" } },
        },
        orderBy: { code: "asc" },
      });
      return {
        roles: rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          isSystem: row.is_system,
          archivedAt: row.archived_at,
          createdAt: row.created_at,
          activeAssignmentCount: row.user_roles.filter((a) => a.user.status === "ACTIVE").length,
          permissionIds: row.role_permissions.map((grant) => grant.permission_id),
        })),
      };
    },

    /** Gets one user with roles for the editor. Requires `platform.user.read`. */
    async getUser(input: { grants: PermissionGrants; userId: string }) {
      requirePermission(input.grants, "platform.user.read");
      const row = await db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          display_name: true,
          status: true,
          created_at: true,
          disabled_at: true,
          user_roles: {
            select: { role: { select: { id: true, code: true, name: true, archived_at: true } } },
            orderBy: { assigned_at: "asc" },
          },
        },
      });
      if (!row) throw new AppError("NOT_FOUND", "USER_NOT_FOUND", "This user no longer exists.");
      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        status: row.status,
        createdAt: row.created_at,
        disabledAt: row.disabled_at,
        roles: row.user_roles.map((assignment) => ({
          id: assignment.role.id,
          code: assignment.role.code,
          name: assignment.role.name,
          archived: assignment.role.archived_at !== null,
        })),
      };
    },

    /** Gets one role with grants for the editor. Requires `platform.role.read`. */
    async getRole(input: { grants: PermissionGrants; roleId: string }) {
      requirePermission(input.grants, "platform.role.read");
      const row = await db.role.findUnique({
        where: { id: input.roleId },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          is_system: true,
          archived_at: true,
          role_permissions: { select: { permission_id: true } },
        },
      });
      if (!row) throw new AppError("NOT_FOUND", "ROLE_NOT_FOUND", "This role no longer exists.");
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        isSystem: row.is_system,
        archivedAt: row.archived_at,
        permissionIds: row.role_permissions.map((grant) => grant.permission_id),
      };
    },

    /**
     * List of assignable (live, non-system-any) roles for the user editor.
     * Includes each role's granted permission IDs so the caller can group
     * roles by the app(s) they actually grant access to (a Role is not
     * inherently scoped to one app — e.g. "Platform Owner" spans several —
     * so this is derived from real grants, not guessed from the role name).
     */
    async listAssignableRoles(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, "platform.user.read");
      const rows = await db.role.findMany({
        where: { archived_at: null },
        select: { id: true, code: true, name: true, role_permissions: { select: { permission_id: true } } },
        orderBy: { code: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        permissionIds: row.role_permissions.map((grant) => grant.permission_id),
      }));
    },

    // ── User commands ────────────────────────────────────────────────────
    /** Creates a user with credentials and optional live role assignments. */
    async createUser(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      email: string;
      displayName: string;
      password: string;
      roleIds?: readonly string[];
    }) {
      requirePermission(input.grants, USER_PERMISSION);
      userActorContext(input.actor);
      const { hashPassword } = await import("../auth/password");
      const email = parseIdentityEmail(input.email);
      const displayName = parseDisplayName(input.displayName);
      const password = parsePassword(input.password);
      const roleIds = [...new Set(input.roleIds ?? [])];

      return runTransaction(async (tx) => {
        if (roleIds.length > 0) {
          const roles = await tx.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, archived_at: true } });
          if (roles.length !== roleIds.length || roles.some((role) => role.archived_at !== null)) {
            throw new AppError("VALIDATION", "ROLE_NOT_ASSIGNABLE", "One or more selected roles cannot be assigned.");
          }
        }
        const passwordHash = await hashPassword(password);
        let user;
        try {
          user = await tx.user.create({
            data: {
              id: generateId(),
              email,
              display_name: displayName,
              password_hash: passwordHash,
              status: "ACTIVE",
              user_roles: roleIds.length > 0 ? { create: roleIds.map((role_id) => ({ id: generateId(), role_id })) } : undefined,
            },
            select: { id: true, email: true },
          });
        } catch (error) {
          mapKnownWriteError(error);
        }
        await writeAudit(tx, {
          appId: "platform",
          action: "user.create",
          entityType: "user",
          entityId: user.id,
          actor: input.actor,
          metadata: { email, roleIds },
        });
        return { userId: user.id };
      });
    },

    /** Updates a user display name. Unchanged values are a safe no-op. */
    async updateUserDisplayName(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      userId: string;
      displayName: string;
    }) {
      requirePermission(input.grants, USER_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { id: true, display_name: true },
        });
        if (!user) throw new AppError("NOT_FOUND", "USER_NOT_FOUND", "This user no longer exists.");
        const displayName = parseDisplayName(input.displayName);
        if (user.display_name === displayName) return { changed: false };
        await tx.user.update({ where: { id: user.id }, data: { display_name: displayName } });
        await writeAudit(tx, {
          appId: "platform",
          action: "user.update",
          entityType: "user",
          entityId: user.id,
          actor: input.actor,
          changes: { display_name: { from: user.display_name, to: displayName } },
        });
        return { changed: true };
      });
    },

    /** Admin-set user password: writes a new hash and revokes every session. */
    async setUserPassword(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      userId: string;
      password: string;
    }) {
      requirePermission(input.grants, USER_PERMISSION);
      userActorContext(input.actor);
      const { hashPassword } = await import("../auth/password");
      const password = parsePassword(input.password);
      return runTransaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, status: true } });
        if (!user) throw new AppError("NOT_FOUND", "USER_NOT_FOUND", "This user no longer exists.");
        const passwordHash = await hashPassword(password);
        await tx.user.update({ where: { id: user.id }, data: { password_hash: passwordHash } });
        await tx.session.updateMany({
          where: { user_id: user.id, revoked_at: null },
          data: { revoked_at: now() },
        });
        await writeAudit(tx, {
          appId: "platform",
          action: "user.password_set",
          entityType: "user",
          entityId: user.id,
          actor: input.actor,
          metadata: { sessionsRevoked: "all" },
        });
        return { changed: true };
      });
    },

    /** Disables a user and revokes every active session atomically. */
    async disableUser(input: { grants: PermissionGrants; actor: AuditActor; userId: string }) {
      requirePermission(input.grants, USER_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, status: true } });
        if (!user) throw new AppError("NOT_FOUND", "USER_NOT_FOUND", "This user no longer exists.");
        if (user.status === "DISABLED") return { changed: false };
        await requireChangeKeepsAccessAdministrator(tx, {
          affectedUserIds: [user.id],
          simulate: async () => false,
        });
        await tx.user.update({
          where: { id: user.id },
          data: { status: "DISABLED", disabled_at: now() },
        });
        await tx.session.updateMany({
          where: { user_id: user.id, revoked_at: null },
          data: { revoked_at: now() },
        });
        await writeAudit(tx, {
          appId: "platform",
          action: "user.disable",
          entityType: "user",
          entityId: user.id,
          actor: input.actor,
          changes: { status: { from: "ACTIVE", to: "DISABLED" } },
        });
        return { changed: true };
      });
    },

    /** Restores a disabled user. Restoring an active user is a safe no-op. */
    async restoreUser(input: { grants: PermissionGrants; actor: AuditActor; userId: string }) {
      requirePermission(input.grants, USER_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, status: true } });
        if (!user) throw new AppError("NOT_FOUND", "USER_NOT_FOUND", "This user no longer exists.");
        if (user.status === "ACTIVE") return { changed: false };
        await tx.user.update({
          where: { id: user.id },
          data: { status: "ACTIVE", disabled_at: null },
        });
        await writeAudit(tx, {
          appId: "platform",
          action: "user.restore",
          entityType: "user",
          entityId: user.id,
          actor: input.actor,
          changes: { status: { from: "DISABLED", to: "ACTIVE" } },
        });
        return { changed: true };
      });
    },

    // ── Role assignment commands ─────────────────────────────────────────
    /** Assigns a live role to a user. Re-assignment is a safe no-op. */
    async assignUserRole(input: { grants: PermissionGrants; actor: AuditActor; userId: string; roleId: string }) {
      requirePermission(input.grants, ROLE_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const role = await tx.role.findUnique({ where: { id: input.roleId }, select: { id: true, archived_at: true } });
        if (!role) throw new AppError("NOT_FOUND", "ROLE_NOT_FOUND", "This role no longer exists.");
        if (role.archived_at !== null) {
          throw new AppError("CONFLICT", "ROLE_ARCHIVED", "An archived role cannot be newly assigned.");
        }
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } });
        if (!user) throw new AppError("NOT_FOUND", "USER_NOT_FOUND", "This user no longer exists.");
        const existing = await tx.userRole.findUnique({
          where: { user_id_role_id: { user_id: user.id, role_id: role.id } },
          select: { id: true },
        });
        if (existing) return { changed: false };
        await tx.userRole.create({ data: { id: generateId(), user_id: user.id, role_id: role.id } });
        await writeAudit(tx, {
          appId: "platform",
          action: "user_role.assign",
          entityType: "user",
          entityId: user.id,
          actor: input.actor,
          metadata: { roleId: role.id },
        });
        return { changed: true };
      });
    },

    /** Removes a role assignment with last-administrator protection. */
    async removeUserRole(input: { grants: PermissionGrants; actor: AuditActor; userId: string; roleId: string }) {
      requirePermission(input.grants, ROLE_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const assignment = await tx.userRole.findUnique({
          where: { user_id_role_id: { user_id: input.userId, role_id: input.roleId } },
          select: { id: true, user_id: true, role_id: true },
        });
        if (!assignment) return { changed: false };
        await requireChangeKeepsAccessAdministrator(tx, {
          affectedUserIds: [assignment.user_id],
          simulate: (innerTx) =>
            userHasBothAdminPermissionsExcludingRole(innerTx, assignment.user_id, assignment.role_id),
        });
        await tx.userRole.delete({ where: { id: assignment.id } });
        await writeAudit(tx, {
          appId: "platform",
          action: "user_role.remove",
          entityType: "user",
          entityId: assignment.user_id,
          actor: input.actor,
          metadata: { roleId: assignment.role_id },
        });
        return { changed: true };
      });
    },

    // ── Role commands ────────────────────────────────────────────────────
    /** Creates a role; every requested permission must be registry-known. */
    async createRole(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      code: string;
      name: string;
      description?: string | null;
      permissionIds?: readonly string[];
    }) {
      requirePermission(input.grants, ROLE_PERMISSION);
      userActorContext(input.actor);
      const code = input.code.trim().toLowerCase();
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(code)) {
        throw new AppError("VALIDATION", "ROLE_CODE_INVALID", "Role codes must be short lowercase identifiers.");
      }
      const permissionIds = [...new Set(input.permissionIds ?? [])];
      assertKnownPermissionIds(permissionIds);
      return runTransaction(async (tx) => {
        let role;
        try {
          role = await tx.role.create({
            data: {
              id: generateId(),
              code,
              name: input.name.trim(),
              description: input.description?.trim() || null,
              is_system: false,
              role_permissions: permissionIds.length > 0
                ? { create: permissionIds.map((permission_id) => ({ id: generateId(), permission_id })) }
                : undefined,
            },
            select: { id: true, code: true },
          });
        } catch (error) {
          mapKnownWriteError(error);
        }
        await writeAudit(tx, {
          appId: "platform",
          action: "role.create",
          entityType: "role",
          entityId: role.id,
          actor: input.actor,
          metadata: { code: role.code, permissionIds },
        });
        return { roleId: role.id };
      });
    },

    /** Updates role name/description. Unchanged values are a safe no-op. */
    async updateRole(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      roleId: string;
      name: string;
      description?: string | null;
    }) {
      requirePermission(input.grants, ROLE_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const role = await tx.role.findUnique({
          where: { id: input.roleId },
          select: { id: true, name: true, description: true },
        });
        if (!role) throw new AppError("NOT_FOUND", "ROLE_NOT_FOUND", "This role no longer exists.");
        const name = input.name.trim();
        const description = input.description?.trim() || null;
        if (role.name === name && role.description === description) return { changed: false };
        await tx.role.update({ where: { id: role.id }, data: { name, description } });
        await writeAudit(tx, {
          appId: "platform",
          action: "role.update",
          entityType: "role",
          entityId: role.id,
          actor: input.actor,
          changes: {
            ...(role.name === name ? {} : { name: { from: role.name, to: name } }),
            ...(role.description === description ? {} : { description: { from: role.description, to: description } }),
          },
        });
        return { changed: true };
      });
    },

    /**
     * Archives a role. System roles cannot be archived; roles with active
     * user assignments cannot be archived; already-archived roles no-op.
     */
    async archiveRole(input: { grants: PermissionGrants; actor: AuditActor; roleId: string }) {
      requirePermission(input.grants, ROLE_PERMISSION);
      userActorContext(input.actor);
      return runTransaction(async (tx) => {
        const role = await tx.role.findUnique({
          where: { id: input.roleId },
          select: {
            id: true,
            is_system: true,
            archived_at: true,
            user_roles: { select: { id: true, user: { select: { status: true } } } },
          },
        });
        if (!role) throw new AppError("NOT_FOUND", "ROLE_NOT_FOUND", "This role no longer exists.");
        if (role.archived_at !== null) return { changed: false };
        if (role.is_system) {
          throw new AppError("CONFLICT", "ROLE_SYSTEM_ARCHIVE_REFUSED", "A system role cannot be archived.");
        }
        if (role.user_roles.some((assignment) => assignment.user.status === "ACTIVE")) {
          throw new AppError(
            "CONFLICT",
            "ROLE_IN_USE",
            "This role still has active user assignments and cannot be archived.",
          );
        }
        await tx.role.update({ where: { id: role.id }, data: { archived_at: now() } });
        await writeAudit(tx, {
          appId: "platform",
          action: "role.archive",
          entityType: "role",
          entityId: role.id,
          actor: input.actor,
          changes: { archived: { from: false, to: true } },
        });
        return { changed: true };
      });
    },

    /**
     * Atomically replaces a role's grants. Every ID is validated against the
     * code registry first; the last-access-administrator invariant is
     * enforced; an identical set is a safe no-op.
     */
    async replaceRoleGrants(input: {
      grants: PermissionGrants;
      actor: AuditActor;
      roleId: string;
      permissionIds: readonly string[];
    }) {
      requirePermission(input.grants, ROLE_PERMISSION);
      userActorContext(input.actor);
      const permissionIds = [...new Set(input.permissionIds)].sort();
      assertKnownPermissionIds(permissionIds);
      return runTransaction(async (tx) => {
        const role = await tx.role.findUnique({
          where: { id: input.roleId },
          select: {
            id: true,
            archived_at: true,
            role_permissions: { select: { permission_id: true } },
            user_roles: { select: { user_id: true, user: { select: { status: true } } } },
          },
        });
        if (!role) throw new AppError("NOT_FOUND", "ROLE_NOT_FOUND", "This role no longer exists.");
        if (role.archived_at !== null) {
          throw new AppError("CONFLICT", "ROLE_ARCHIVED", "An archived role cannot be changed.");
        }
        const current = role.role_permissions.map((grant) => grant.permission_id).sort();
        if (JSON.stringify(current) === JSON.stringify(permissionIds)) return { changed: false };

        const activeAssignees = role.user_roles
          .filter((assignment) => assignment.user.status === "ACTIVE")
          .map((assignment) => assignment.user_id);
        await requireChangeKeepsAccessAdministrator(tx, {
          affectedUserIds: activeAssignees,
          simulate: (innerTx, userId) =>
            userHasBothAdminPermissionsWithRoleGrants(innerTx, userId, role.id, permissionIds),
        });

        await tx.rolePermission.deleteMany({ where: { role_id: role.id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permission_id) => ({
              id: generateId(),
              role_id: role.id,
              permission_id,
            })),
          });
        }
        await writeAudit(tx, {
          appId: "platform",
          action: "role.grants_replace",
          entityType: "role",
          entityId: role.id,
          actor: input.actor,
          changes: { permission_ids: { from: current, to: permissionIds } },
        });
        return { changed: true };
      });
    },
  };
}

export type PlatformAccessService = ReturnType<typeof createPlatformAccessService>;
