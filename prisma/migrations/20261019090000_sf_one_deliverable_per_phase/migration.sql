-- Retain the newest uploaded file per phase; historical rows become unreferenced.
-- Queue only keys that no retained StudioFlow owner references, because cleanup retries
-- delete directly from object storage after this metadata transaction has committed.
WITH ranked AS (
  SELECT "id", "storage_key", ROW_NUMBER() OVER (
    PARTITION BY "phase_id" ORDER BY "created_at" DESC, "id" DESC
  ) AS "rank"
  FROM "studioflow"."sf_deliverable"
), removed AS (
  SELECT "id", "storage_key" FROM ranked WHERE "rank" > 1
), orphaned AS (
  SELECT DISTINCT removed."storage_key"
  FROM removed
  WHERE NOT EXISTS (
    SELECT 1 FROM "studioflow"."sf_deliverable" retained
    WHERE retained."storage_key" = removed."storage_key" AND retained."id" NOT IN (SELECT "id" FROM removed)
  )
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_mom_image" WHERE "storage_key" = removed."storage_key")
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_workspace_card" WHERE "storage_key" = removed."storage_key")
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_schedule_option" WHERE "image_key" = removed."storage_key")
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_schedule_template_item" WHERE "image_key" = removed."storage_key")
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_client" WHERE "logo_storage_key" = removed."storage_key")
  AND NOT EXISTS (SELECT 1 FROM "studioflow"."sf_settings" WHERE "logo_key" = removed."storage_key")
)
INSERT INTO "studioflow"."sf_asset_cleanup_failure" ("id", "storage_key", "attempts")
SELECT gen_random_uuid()::text, "storage_key", 0 FROM orphaned
ON CONFLICT ("storage_key") DO UPDATE SET "resolved_at" = NULL;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "phase_id" ORDER BY "created_at" DESC, "id" DESC
  ) AS "rank"
  FROM "studioflow"."sf_deliverable"
)
DELETE FROM "studioflow"."sf_deliverable"
WHERE "id" IN (SELECT "id" FROM ranked WHERE "rank" > 1);

DROP INDEX IF EXISTS "studioflow"."sf_deliverable_one_final_per_slot_idx";
DROP INDEX IF EXISTS "studioflow"."sf_deliverable_phase_id_slot_key_version_number_key";
DROP TABLE "studioflow"."sf_deliverable_slot";

ALTER TABLE "studioflow"."sf_deliverable"
  DROP COLUMN "slot_key",
  DROP COLUMN "version_number",
  DROP COLUMN "is_final",
  DROP COLUMN "finalized_at",
  DROP COLUMN "finalized_by_id",
  DROP COLUMN "expires_at",
  DROP COLUMN "expiry_warned_at";

CREATE UNIQUE INDEX "sf_deliverable_phase_id_key"
  ON "studioflow"."sf_deliverable"("phase_id");
