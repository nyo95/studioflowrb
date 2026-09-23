-- Gantt/timeline start date for a project; overridable, falls back to created_at's date when unset (owner, 2026-09-23). Additive.

ALTER TABLE "studioflow"."sf_project" ADD COLUMN "timeline_start_date" DATE;
