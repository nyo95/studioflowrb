CREATE SCHEMA IF NOT EXISTS "ideas";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "studioflow"."sf_idea_usage" usage
    LEFT JOIN "studioflow"."sf_idea_card" card ON card."id" = usage."card_id"
    WHERE card."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Ideas extraction refused: orphan card usage exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "studioflow"."sf_idea_usage"
    GROUP BY "card_id", "option_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ideas extraction refused: duplicate card usage exists';
  END IF;
END $$;

ALTER TABLE "studioflow"."sf_idea_usage" DROP CONSTRAINT "sf_idea_usage_option_id_fkey";
ALTER TABLE "studioflow"."sf_idea_card" SET SCHEMA "ideas";
ALTER TABLE "studioflow"."sf_idea_usage" SET SCHEMA "ideas";
CREATE UNIQUE INDEX "sf_idea_usage_card_id_option_id_key" ON "ideas"."sf_idea_usage"("card_id", "option_id");

CREATE TABLE "ideas"."asset_cleanup_failure" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "first_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "asset_cleanup_failure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_cleanup_failure_storage_key_key" ON "ideas"."asset_cleanup_failure"("storage_key");
CREATE INDEX "asset_cleanup_failure_resolved_at_first_failed_at_idx" ON "ideas"."asset_cleanup_failure"("resolved_at", "first_failed_at");
