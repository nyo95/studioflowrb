-- Platform integration foundation: hash-only personal access tokens and the
-- retry ledger.  This is additive; native clients never receive a persisted secret.
CREATE TABLE "platform"."IntegrationToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "token_prefix" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "expires_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationToken_token_hash_key" ON "platform"."IntegrationToken"("token_hash");
CREATE INDEX "IntegrationToken_user_id_revoked_at_idx" ON "platform"."IntegrationToken"("user_id", "revoked_at");
CREATE INDEX "IntegrationToken_expires_at_idx" ON "platform"."IntegrationToken"("expires_at");
ALTER TABLE "platform"."IntegrationToken" ADD CONSTRAINT "IntegrationToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "platform"."IntegrationRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "method_path" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "response_status" INTEGER,
  "response_body" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationRequest_token_id_key_key" ON "platform"."IntegrationRequest"("token_id", "key");
CREATE INDEX "IntegrationRequest_created_at_idx" ON "platform"."IntegrationRequest"("created_at");
ALTER TABLE "platform"."IntegrationRequest" ADD CONSTRAINT "IntegrationRequest_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "platform"."IntegrationToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New platform permissions go only to the existing system owner role; other
-- roles remain unchanged until deliberately assigned in access management.
INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT md5('system-platform-owner:' || p.id)::uuid, role."id", p.id, CURRENT_TIMESTAMP
FROM "platform"."Role" AS role
CROSS JOIN (VALUES ('platform.integration.manage'), ('platform.integration.admin'), ('platform.integration.ping')) AS p(id)
WHERE role."code" = 'platform-owner' AND role."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
