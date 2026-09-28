ALTER TABLE "studioflow"."sf_settings" ADD COLUMN "archive_retention_days" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "studioflow"."sf_project" ADD COLUMN "assets_purged_at" TIMESTAMP(3);
