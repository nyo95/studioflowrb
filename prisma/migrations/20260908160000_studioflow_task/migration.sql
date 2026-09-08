-- StudioFlow SF-F4 Tasks.
-- Additive only; no cross-schema foreign keys and no changes outside studioflow.

CREATE TYPE "studioflow"."sf_task_status" AS ENUM ('OPEN', 'DONE');

CREATE TABLE "studioflow"."sf_task" (
  "id"                 TEXT                              NOT NULL,
  "project_id"         TEXT                              NOT NULL,
  "phase_scope"        TEXT,
  "title"              TEXT                              NOT NULL,
  "status"             "studioflow"."sf_task_status"  NOT NULL DEFAULT 'OPEN',
  "assignee_id"        TEXT,
  "due_date"           TIMESTAMP(3),
  "attachment_file_id" TEXT,
  "sort_order"         INTEGER                           NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMP(3)                      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3)                      NOT NULL,
  CONSTRAINT "sf_task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_task_project_fk" FOREIGN KEY ("project_id")
    REFERENCES "studioflow"."sf_project"("id"),
  CONSTRAINT "sf_task_attachment_file_fk" FOREIGN KEY ("attachment_file_id")
    REFERENCES "studioflow"."sf_file"("id")
);

CREATE INDEX "sf_task_project_status_phase_sort_idx"
  ON "studioflow"."sf_task"("project_id", "status", "phase_scope", "sort_order");

CREATE INDEX "sf_task_assignee_status_created_idx"
  ON "studioflow"."sf_task"("assignee_id", "status", "created_at");

CREATE INDEX "sf_task_attachment_file_idx"
  ON "studioflow"."sf_task"("attachment_file_id");
