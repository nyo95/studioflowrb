CREATE TABLE "studioflow"."sf_external_schedule_placement" (
    "operation_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entry_id" TEXT,
    "option_id" TEXT,
    "code" TEXT,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sf_external_schedule_placement_pkey" PRIMARY KEY ("operation_id")
);

CREATE INDEX "sf_external_schedule_placement_project_id_created_at_idx"
    ON "studioflow"."sf_external_schedule_placement"("project_id", "created_at");
CREATE INDEX "sf_external_schedule_placement_option_id_idx"
    ON "studioflow"."sf_external_schedule_placement"("option_id");

ALTER TABLE "studioflow"."sf_external_schedule_placement"
    ADD CONSTRAINT "sf_external_schedule_placement_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_external_schedule_placement"
    ADD CONSTRAINT "sf_external_schedule_placement_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "studioflow"."sf_schedule_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studioflow"."sf_external_schedule_placement"
    ADD CONSTRAINT "sf_external_schedule_placement_option_id_fkey"
    FOREIGN KEY ("option_id") REFERENCES "studioflow"."sf_schedule_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
