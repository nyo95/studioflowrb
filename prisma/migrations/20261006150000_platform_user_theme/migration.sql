-- Dark mode is an approved UI mode (owner, 2026-10-06). Each person's active theme is their
-- user preference (system | light | dark; null = organisation default). The General Settings
-- column becomes only that organisation default.

-- Organisation default: allow every theme preference and default to following the device.
-- No page ever stamped a theme before this change, so 'system' is what everyone already saw;
-- the stored 'light' was never applied.
ALTER TABLE "platform"."PlatformGeneralSettings" DROP CONSTRAINT "PlatformGeneralSettings_theme_check";
UPDATE "platform"."PlatformGeneralSettings" SET "theme" = 'system' WHERE "theme" = 'light';
ALTER TABLE "platform"."PlatformGeneralSettings" ALTER COLUMN "theme" SET DEFAULT 'system';
ALTER TABLE "platform"."PlatformGeneralSettings" ADD CONSTRAINT "PlatformGeneralSettings_theme_check" CHECK ("theme" IN ('system', 'light', 'dark'));

-- Personal theme: the first preference service wrote uppercase; normalise, drop anything else.
UPDATE "platform"."user_preference" SET "theme" = lower("theme") WHERE "theme" IS NOT NULL;
UPDATE "platform"."user_preference" SET "theme" = NULL WHERE "theme" IS NOT NULL AND "theme" NOT IN ('system', 'light', 'dark');
ALTER TABLE "platform"."user_preference" ADD CONSTRAINT "user_preference_theme_check" CHECK ("theme" IS NULL OR "theme" IN ('system', 'light', 'dark'));
