-- SF-A Requirements only. This migration is intentionally additive: it does
-- not alter platform, Master Data, BQ, or existing StudioFlow objects.

CREATE TYPE "studioflow"."sf_requirement_scope" AS ENUM ('GENERAL', 'PHASE');

CREATE TYPE "studioflow"."sf_requirement_satisfaction_state" AS ENUM ('OPEN', 'SATISFIED');

CREATE TABLE "studioflow"."sf_requirement_template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "studioflow"."sf_requirement_scope" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "phase_template_id" TEXT,
    "key_immutable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sf_requirement_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studioflow"."sf_project_requirement" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "source_template_id" TEXT,
    "template_key_snapshot" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "satisfaction_state" "studioflow"."sf_requirement_satisfaction_state" NOT NULL DEFAULT 'OPEN',
    "satisfied_at" TIMESTAMP(3),
    "satisfied_by_id" TEXT,
    "satisfaction_note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "archived_by_id" TEXT,
    "archive_reason" TEXT,
    "restored_at" TIMESTAMP(3),
    "restored_by_id" TEXT,
    "restore_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sf_project_requirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "studioflow"."sf_requirement_evidence" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by_id" TEXT,
    "unlinked_at" TIMESTAMP(3),
    "unlinked_by_id" TEXT,
    "unlink_reason" TEXT,

    CONSTRAINT "sf_requirement_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sf_requirement_template_scope_phase_template_id_deleted_at_idx"
  ON "studioflow"."sf_requirement_template"("scope", "phase_template_id", "deleted_at");

CREATE UNIQUE INDEX "sf_requirement_template_scope_phase_template_id_key_key"
  ON "studioflow"."sf_requirement_template"("scope", "phase_template_id", "key");

CREATE INDEX "sf_project_requirement_project_id_satisfaction_state_archiv_idx"
  ON "studioflow"."sf_project_requirement"("project_id", "satisfaction_state", "archived_at");

CREATE INDEX "sf_project_requirement_project_id_phase_id_idx"
  ON "studioflow"."sf_project_requirement"("project_id", "phase_id");

CREATE INDEX "sf_project_requirement_source_template_id_idx"
  ON "studioflow"."sf_project_requirement"("source_template_id");

CREATE UNIQUE INDEX "sf_requirement_evidence_requirement_id_file_id_key"
  ON "studioflow"."sf_requirement_evidence"("requirement_id", "file_id");

CREATE INDEX "sf_requirement_evidence_requirement_id_idx"
  ON "studioflow"."sf_requirement_evidence"("requirement_id");

CREATE INDEX "sf_requirement_evidence_file_id_idx"
  ON "studioflow"."sf_requirement_evidence"("file_id");

ALTER TABLE "studioflow"."sf_requirement_template"
  ADD CONSTRAINT "sf_requirement_template_phase_template_id_fkey"
  FOREIGN KEY ("phase_template_id") REFERENCES "studioflow"."sf_phase_template"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_project_requirement"
  ADD CONSTRAINT "sf_project_requirement_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_project_requirement"
  ADD CONSTRAINT "sf_project_requirement_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_project_phase"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_project_requirement"
  ADD CONSTRAINT "sf_project_requirement_source_template_id_fkey"
  FOREIGN KEY ("source_template_id") REFERENCES "studioflow"."sf_requirement_template"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_requirement_evidence"
  ADD CONSTRAINT "sf_requirement_evidence_requirement_id_fkey"
  FOREIGN KEY ("requirement_id") REFERENCES "studioflow"."sf_project_requirement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_requirement_evidence"
  ADD CONSTRAINT "sf_requirement_evidence_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "studioflow"."sf_file"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
