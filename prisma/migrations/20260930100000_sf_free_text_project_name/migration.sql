-- Project names are free text (owner, 2026-09-30): drop the year-number convention,
-- its auto-numbering switch and counter, and the never-used project type.
ALTER TABLE "studioflow"."sf_project" DROP COLUMN "project_code", DROP COLUMN "project_type";
DROP TABLE "studioflow"."sf_project_sequence";
ALTER TABLE "studioflow"."sf_settings" DROP COLUMN "auto_naming_enabled";
