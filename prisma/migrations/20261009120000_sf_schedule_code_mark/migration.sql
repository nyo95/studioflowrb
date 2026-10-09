-- A code group (project, section, prefix) remembers the highest number it has handed out, so deleting the
-- last entry never lets its number return for a different item. Backfilled from the entries that exist now.
CREATE TABLE "studioflow"."sf_schedule_code_mark" (
  "project_id" TEXT NOT NULL,
  "section" "studioflow"."sf_schedule_section" NOT NULL,
  "prefix" TEXT NOT NULL,
  "last_increment" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sf_schedule_code_mark_pkey" PRIMARY KEY ("project_id", "section", "prefix"),
  CONSTRAINT "sf_schedule_code_mark_check" CHECK ("last_increment" > 0)
);
ALTER TABLE "studioflow"."sf_schedule_code_mark" ADD CONSTRAINT "sf_schedule_code_mark_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "studioflow"."sf_schedule_code_mark" ("project_id", "section", "prefix", "last_increment")
SELECT "project_id", "section", "prefix", MAX("increment") FROM "studioflow"."sf_schedule_entry" GROUP BY "project_id", "section", "prefix";
