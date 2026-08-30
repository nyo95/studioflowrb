-- R1.04 Foundation correction: CORE.md locks weekStartsOn to Sunday or Monday.
-- Additive migration only; the previously published F0 migration is unchanged.
-- Existing values outside the locked set are refused explicitly rather than
-- being silently rewritten, because choosing a replacement is owner policy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "platform"."PlatformGeneralSettings"
    WHERE "week_starts_on" NOT IN (0, 1)
  ) THEN
    RAISE EXCEPTION 'PlatformGeneralSettings contains week_starts_on outside the locked 0/1 set';
  END IF;
END $$;

ALTER TABLE "platform"."PlatformGeneralSettings"
  ADD CONSTRAINT "PlatformGeneralSettings_week_starts_on_check"
  CHECK ("week_starts_on" IN (0, 1));
