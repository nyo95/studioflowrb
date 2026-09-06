CREATE TYPE "bq"."BqProjectDeletionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "bq"."bq_project_deletion_request" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "project_title" TEXT NOT NULL,
  "status" "bq"."BqProjectDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "requester_user_id" TEXT NOT NULL,
  "requester_label" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approver_user_id" TEXT,
  "approver_label" TEXT,
  "decided_at" TIMESTAMP(3),
  "reason" TEXT,
  CONSTRAINT "bq_project_deletion_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bq_project_deletion_request_project_id_status_idx"
  ON "bq"."bq_project_deletion_request" ("project_id", "status");
CREATE INDEX "bq_project_deletion_request_status_requested_at_idx"
  ON "bq"."bq_project_deletion_request" ("status", "requested_at");
CREATE UNIQUE INDEX "bq_project_deletion_request_one_pending_per_project"
  ON "bq"."bq_project_deletion_request" ("project_id")
  WHERE "status" = 'PENDING';

-- Register the app-owned approval capability and grant it only to the existing
-- system owner role. No role-name bypass is introduced in application code.
INSERT INTO "platform"."RolePermission" ("id", "role_id", "permission_id", "granted_at")
SELECT
  md5('system-platform-owner:bq.project.delete.approve')::uuid,
  role."id",
  'bq.project.delete.approve',
  CURRENT_TIMESTAMP
FROM "platform"."Role" AS role
WHERE role."code" = 'platform-owner' AND role."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- This pre-R6 identifier was never registered and has no active contract.
DELETE FROM "platform"."RolePermission"
WHERE "permission_id" = 'bq.library.approve';

-- R6.1 makes Brand a required part of SKU identity. Refuse to guess a Brand
-- for pre-existing rows; a non-empty database must be curated before applying
-- this constraint.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "master_data"."Sku" WHERE "brand_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot require SKU Brand while unbranded SKU rows still exist';
  END IF;
END $$;

ALTER TABLE "master_data"."Sku"
  ALTER COLUMN "brand_id" SET NOT NULL;
