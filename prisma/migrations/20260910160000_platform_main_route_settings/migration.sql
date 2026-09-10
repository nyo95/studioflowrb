-- Configurable main-route settings (roadmap, Platform Foundation).
-- Both columns are advisory owner preferences read by the launcher; they are
-- not foreign keys because the app registry is code-owned, not persisted,
-- and Core must not depend on which apps exist.
ALTER TABLE "platform"."PlatformGeneralSettings"
  ADD COLUMN "main_app_id" TEXT,
  ADD COLUMN "landing_app_id" TEXT;
