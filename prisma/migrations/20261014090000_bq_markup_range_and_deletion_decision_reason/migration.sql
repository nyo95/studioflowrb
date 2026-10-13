-- BQ audit corrections (2026-10-14).
-- 1. Markup may be 0 to 999.9999 %; DECIMAL(6,4) stopped at 99.9999 and a 100 % markup failed inside the database.
ALTER TABLE "bq"."bq_item" ALTER COLUMN "markup_l1_pct" TYPE DECIMAL(7,4);
ALTER TABLE "bq"."bq_sub_object" ALTER COLUMN "markup_l2_pct" TYPE DECIMAL(7,4);

-- 2. A deletion request keeps the requester's reason apart from the approver's rejection reason.
ALTER TABLE "bq"."bq_project_deletion_request" ADD COLUMN "decision_reason" TEXT;
-- A rejection used to overwrite the requester's reason, so on a REJECTED row the stored reason is the approver's.
UPDATE "bq"."bq_project_deletion_request"
   SET "decision_reason" = "reason", "reason" = NULL
 WHERE "status" = 'REJECTED';
