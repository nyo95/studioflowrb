-- Typed global Platform Appearance theme (F-C / PF-4, D-SF-02: Platform owns
-- appearance and theme). DESIGN.md locks the canonical "light" theme; the
-- CHECK constraint mirrors the typed union so no other value can be persisted.
ALTER TABLE "platform"."PlatformGeneralSettings" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'light';

ALTER TABLE "platform"."PlatformGeneralSettings" ADD CONSTRAINT "PlatformGeneralSettings_theme_check" CHECK ("theme" IN ('light'));
