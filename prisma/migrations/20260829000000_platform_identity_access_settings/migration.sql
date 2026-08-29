-- Foundation F0 (CORE.md §3/§4/§11): persisted platform identity, access,
-- sessions, General Settings, and the login rate-limiter storage table.
--
-- Additive only: no existing master_data/platform row or column is read,
-- rewritten, or converted. There is no implicit conversion of the removed
-- development operator environment identity (MASTERDATA_OPERATOR_*): those
-- variables never represented persisted users, so nothing is imported into
-- platform.User. Recovery of a lost owner account is the one-time bootstrap
-- command (scripts/bootstrap.ts), which refuses to run while any active user
-- exists; there is no seeded or fallback password.
--
-- If this migration must be recovered on an existing environment:
--   1. Run `npx prisma migrate deploy` (this file is idempotent only in the
--      sense that migration bookkeeping applies it once).
--   2. Create the first owner with scripts/bootstrap.ts using non-logged
--      password input.
--   3. Assign Roles/grants through /settings/access with platform permissions.
--
-- The rate-limiter table mirrors the exact shape created by
-- rate-limiter-flexible's RateLimiterPostgres adapter (key varchar(255)
-- PRIMARY KEY, points integer NOT NULL DEFAULT 0, expire bigint) but is
-- created HERE by reviewed migration, never by implicit runtime DDL.

CREATE TYPE "platform"."UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "platform"."User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "platform"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "disabled_at" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "platform"."User"("email");
CREATE INDEX "User_status_idx" ON "platform"."User"("status");

CREATE TABLE "platform"."Role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_code_key" ON "platform"."Role"("code");
CREATE INDEX "Role_archived_at_idx" ON "platform"."Role"("archived_at");

CREATE TABLE "platform"."UserRole" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserRole_user_id_role_id_key" ON "platform"."UserRole"("user_id", "role_id");
CREATE INDEX "UserRole_role_id_idx" ON "platform"."UserRole"("role_id");

CREATE TABLE "platform"."RolePermission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_role_id_permission_id_key" ON "platform"."RolePermission"("role_id", "permission_id");
CREATE INDEX "RolePermission_permission_id_idx" ON "platform"."RolePermission"("permission_id");

CREATE TABLE "platform"."Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "idle_expires_at" TIMESTAMP(3) NOT NULL,
    "absolute_expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "client_address" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_token_hash_key" ON "platform"."Session"("token_hash");
CREATE INDEX "Session_user_id_revoked_at_idx" ON "platform"."Session"("user_id", "revoked_at");
CREATE INDEX "Session_idle_expires_at_idx" ON "platform"."Session"("idle_expires_at");
CREATE INDEX "Session_absolute_expires_at_idx" ON "platform"."Session"("absolute_expires_at");

CREATE TABLE "platform"."PlatformGeneralSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform_general_settings',
    "organization_name" TEXT NOT NULL,
    "app_title" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "week_starts_on" INTEGER NOT NULL,
    "brand_mark_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformGeneralSettings_pkey" PRIMARY KEY ("id")
);

-- Singleton identity is enforced in SQL: only the constant settings row can
-- ever exist; any other ID violates the check and fails the insert.
ALTER TABLE "platform"."PlatformGeneralSettings" ADD CONSTRAINT "PlatformGeneralSettings_singleton_check" CHECK ("id" = 'platform_general_settings');

CREATE TABLE "platform"."LoginRateLimit" (
    "key" VARCHAR(255) PRIMARY KEY,
    "points" INTEGER NOT NULL DEFAULT 0,
    "expire" BIGINT
);

ALTER TABLE "platform"."UserRole" ADD CONSTRAINT "UserRole_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."UserRole" ADD CONSTRAINT "UserRole_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical access facts must never be silently destroyed: deleting a User
-- or Role with assignments/grants is refused by the database itself.
ALTER TABLE "platform"."RolePermission" ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform"."Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."Session" ADD CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
