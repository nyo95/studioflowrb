-- Developer-controlled access to gated integration modules (Schedule Assistant, SketchUp).
-- Replaces the two RBAC permissions, so a role (including the Platform Owner) can no longer hold them.
CREATE TABLE "platform"."IntegrationAccess" (
  "module_id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "granted_by" TEXT NOT NULL,
  CONSTRAINT "IntegrationAccess_pkey" PRIMARY KEY ("module_id", "user_id")
);
CREATE INDEX "IntegrationAccess_user_id_idx" ON "platform"."IntegrationAccess"("user_id");
ALTER TABLE "platform"."IntegrationAccess" ADD CONSTRAINT "IntegrationAccess_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The retired RBAC grants. Existing tokens stay stored but stop working until the Developer lists the user.
DELETE FROM "platform"."RolePermission" WHERE "permission_id" IN ('studioflow.schedule-assistant.use', 'studioflow.sketchup.use');
