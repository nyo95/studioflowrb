ALTER TABLE "studioflow"."sf_schedule_entry"
    ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "highlight" TEXT;
