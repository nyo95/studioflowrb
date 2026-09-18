-- WO-SCHED-R2-02: Add pattern column to schedule tables.
-- The pattern field was added to the Prisma schema but the migration
-- for the database was missing. This migration adds the column to both
-- sf_schedule_option and sf_schedule_template_item.

ALTER TABLE "studioflow"."sf_schedule_option"
ADD COLUMN "pattern" TEXT;

ALTER TABLE "studioflow"."sf_schedule_template_item"
ADD COLUMN "pattern" TEXT;
