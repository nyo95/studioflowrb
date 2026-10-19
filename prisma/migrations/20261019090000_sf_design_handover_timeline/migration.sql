-- Canonical Design Handover anchor. Existing projects remain on their current Fit Out Start schedule until this is set.
ALTER TABLE "studioflow"."sf_project" ADD COLUMN IF NOT EXISTS "design_handover_date" DATE;

-- Design Final and CD start on the same working day by default.
ALTER TABLE "studioflow"."sf_settings" ALTER COLUMN "cd_mall_days" SET DEFAULT 0;
ALTER TABLE "studioflow"."sf_settings" DROP CONSTRAINT IF EXISTS "sf_settings_cd_mall_days_check";
UPDATE "studioflow"."sf_settings" SET "cd_mall_days" = 0 WHERE "cd_mall_days" = 5;
ALTER TABLE "studioflow"."sf_settings" ADD CONSTRAINT "sf_settings_cd_mall_days_check" CHECK ("cd_mall_days" >= 0 AND "cd_mall_days" <= 260);
