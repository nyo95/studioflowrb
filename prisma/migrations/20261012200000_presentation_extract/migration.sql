CREATE SCHEMA IF NOT EXISTS "presentation";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "studioflow"."sf_presentation_board" board
    LEFT JOIN "studioflow"."sf_project" project ON project."id" = board."project_id"
    WHERE project."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Presentation extraction refused: orphan project board exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "studioflow"."sf_presentation_annotation" annotation
    LEFT JOIN "studioflow"."sf_schedule_entry" entry ON entry."id" = annotation."schedule_entry_id"
    WHERE annotation."schedule_entry_id" IS NOT NULL AND entry."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Presentation extraction refused: orphan Schedule annotation exists';
  END IF;
END $$;

ALTER TABLE "studioflow"."sf_presentation_board" DROP CONSTRAINT "sf_presentation_board_project_id_fkey";
ALTER TABLE "studioflow"."sf_presentation_annotation" DROP CONSTRAINT "sf_presentation_annotation_schedule_entry_id_fkey";
ALTER TYPE "studioflow"."sf_presentation_label_side" SET SCHEMA "presentation";
ALTER TABLE "studioflow"."sf_presentation_board" SET SCHEMA "presentation";
ALTER TABLE "studioflow"."sf_presentation_slide" SET SCHEMA "presentation";
ALTER TABLE "studioflow"."sf_presentation_annotation" SET SCHEMA "presentation";

CREATE TABLE "presentation"."asset_cleanup_failure" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "first_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "asset_cleanup_failure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_cleanup_failure_storage_key_key" ON "presentation"."asset_cleanup_failure"("storage_key");
CREATE INDEX "asset_cleanup_failure_resolved_at_first_failed_at_idx" ON "presentation"."asset_cleanup_failure"("resolved_at", "first_failed_at");
