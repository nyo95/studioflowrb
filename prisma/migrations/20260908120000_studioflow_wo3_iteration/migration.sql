-- SF-WO-3: Iteration, RECORDED files, phase state projection
-- Migration path: prisma/migrations/20260908120000_studioflow_wo3_iteration/migration.sql
-- Schema: studioflow only. Purely additive. No ALTER/DROP on any existing table.

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "studioflow"."sf_iteration_state" AS ENUM (
  'DRAFT',
  'SENT',
  'APPROVED',
  'SUPERSEDED',
  'VOIDED'
);

CREATE TYPE "studioflow"."sf_iteration_point_source" AS ENUM (
  'CLIENT_REVISION',
  'INTERNAL'
);

CREATE TYPE "studioflow"."sf_file_treatment" AS ENUM (
  'RECORDED',
  'STORED',
  'LINKED'
);

-- ── Studio settings (singleton) ───────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_studio_settings" (
  "id"              TEXT         NOT NULL DEFAULT 'studio',
  "naming_template" TEXT         NOT NULL DEFAULT '{date} {project} {location} {round}',
  "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_by_id"   TEXT,

  CONSTRAINT "sf_studio_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "studioflow"."sf_studio_settings" ("id", "naming_template", "updated_at")
VALUES ('studio', '{date} {project} {location} {round}', NOW());

-- ── Iteration (§5) ───────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_iteration" (
  "id"               TEXT                              NOT NULL,
  "phase_id"         TEXT                              NOT NULL,
  "number"           INTEGER                           NOT NULL,
  "state"            "studioflow"."sf_iteration_state" NOT NULL DEFAULT 'DRAFT',
  "assignee_id"      TEXT,
  "sent_at"          TIMESTAMPTZ,
  "responded_at"     TIMESTAMPTZ,
  "working_revision" INTEGER                           NOT NULL DEFAULT 0,
  "voided_at"        TIMESTAMPTZ,
  "voided_by_id"     TEXT,
  "void_reason"      TEXT,
  "created_at"       TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),

  CONSTRAINT "sf_iteration_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "sf_iteration_phase_number_key"  UNIQUE ("phase_id", "number"),
  CONSTRAINT "sf_iteration_phase_id_fkey"     FOREIGN KEY ("phase_id")
    REFERENCES "studioflow"."sf_project_phase" ("id")
);

CREATE INDEX "sf_iteration_phase_id_state_idx" ON "studioflow"."sf_iteration" ("phase_id", "state");

-- ── Iteration point (§7.2) ───────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_iteration_point" (
  "id"                 TEXT                                     NOT NULL,
  "iteration_id"       TEXT                                     NOT NULL,
  "text"               TEXT                                     NOT NULL,
  "done"               BOOLEAN                                  NOT NULL DEFAULT FALSE,
  "source"             "studioflow"."sf_iteration_point_source" NOT NULL,
  "source_response_id" TEXT,
  "source_point_id"    TEXT,
  "withdrawn_at"       TIMESTAMPTZ,
  "withdrawn_by_id"    TEXT,
  "withdrawal_reason"  TEXT,
  "sort_order"         INTEGER                                  NOT NULL DEFAULT 0,

  CONSTRAINT "sf_iteration_point_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "sf_iteration_point_iteration_fkey" FOREIGN KEY ("iteration_id")
    REFERENCES "studioflow"."sf_iteration" ("id")
);

CREATE INDEX "sf_iteration_point_iteration_source_idx"
  ON "studioflow"."sf_iteration_point" ("iteration_id", "source");

-- ── Internal approval (§6.7) ─────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_internal_approval" (
  "id"             TEXT        NOT NULL,
  "iteration_id"   TEXT        NOT NULL,
  "approved_by_id" TEXT        NOT NULL,
  "approved_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "note"           TEXT,

  CONSTRAINT "sf_internal_approval_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "sf_internal_approval_iteration_key"  UNIQUE ("iteration_id"),
  CONSTRAINT "sf_internal_approval_iteration_fkey" FOREIGN KEY ("iteration_id")
    REFERENCES "studioflow"."sf_iteration" ("id")
);

-- ── File record (§8) ─────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_file" (
  "id"                   TEXT                             NOT NULL,
  "project_id"           TEXT                             NOT NULL,
  "folder_key"           TEXT,
  "treatment"            "studioflow"."sf_file_treatment" NOT NULL,
  "filename"             TEXT                             NOT NULL,
  "original_filename"    TEXT                             NOT NULL,
  "bytes"                BIGINT                           NOT NULL,
  "file_modified_at"     TIMESTAMPTZ,
  "dropped_by_id"        TEXT                             NOT NULL,
  "dropped_at"           TIMESTAMPTZ                      NOT NULL DEFAULT NOW(),
  "sent_in_iteration_id" TEXT,
  "storage_key"          TEXT,
  "checksum"             TEXT,
  "external_url"         TEXT,
  "superseded_at"        TIMESTAMPTZ,
  "bytes_released_at"    TIMESTAMPTZ,

  CONSTRAINT "sf_file_pkey"                   PRIMARY KEY ("id"),
  CONSTRAINT "sf_file_project_fkey"           FOREIGN KEY ("project_id")
    REFERENCES "studioflow"."sf_project" ("id"),
  CONSTRAINT "sf_file_sent_in_iteration_fkey" FOREIGN KEY ("sent_in_iteration_id")
    REFERENCES "studioflow"."sf_iteration" ("id")
);

CREATE INDEX "sf_file_project_folder_idx"        ON "studioflow"."sf_file" ("project_id", "folder_key");
CREATE INDEX "sf_file_sent_in_iteration_idx"      ON "studioflow"."sf_file" ("sent_in_iteration_id");
CREATE INDEX "sf_file_project_superseded_at_idx"  ON "studioflow"."sf_file" ("project_id", "superseded_at");
