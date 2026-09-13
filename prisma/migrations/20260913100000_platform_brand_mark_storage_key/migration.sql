-- Platform-managed Brand marks store an opaque object reference. Existing
-- safe external/site-relative URLs remain untouched in brand_mark_url.
ALTER TABLE "platform"."PlatformGeneralSettings"
  ADD COLUMN "brand_mark_storage_key" TEXT;
