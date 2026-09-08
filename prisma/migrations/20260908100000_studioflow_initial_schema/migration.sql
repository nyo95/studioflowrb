-- StudioFlow initial schema (SF-WO-2)
-- Additive: creates the studioflow schema and its four tables.
-- No foreign keys into platform, master_data, or bq schemas.
-- Cross-schema user references are plain TEXT columns.

CREATE SCHEMA IF NOT EXISTS "studioflow";

-- ── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "studioflow"."sf_project_type" AS ENUM (
  'RESIDENTIAL',
  'COMMERCIAL',
  'HOSPITALITY',
  'OTHER'
);

CREATE TYPE "studioflow"."sf_project_status" AS ENUM (
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED'
);

CREATE TYPE "studioflow"."sf_phase_state" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'WAITING_CLIENT',
  'DONE'
);

CREATE TYPE "studioflow"."sf_phase_closure_kind" AS ENUM (
  'NORMAL',
  'EXCEPTION'
);

-- ── Phase template ────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_phase_template" (
  "id"                          TEXT        NOT NULL,
  "key"                         TEXT        NOT NULL,
  "name"                        TEXT        NOT NULL,
  "sort_order"                  INTEGER     NOT NULL,
  "has_rounds"                  BOOLEAN     NOT NULL DEFAULT true,
  "round_prefix"                TEXT,
  "folder_key"                  TEXT,
  "requires_internal_approval"  BOOLEAN     NOT NULL DEFAULT false,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_phase_template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sf_phase_template_key_key" ON "studioflow"."sf_phase_template"("key");

-- Seed: the studio's five standard phases in contract order.
-- updated_at is set to now() via trigger-like default; use CURRENT_TIMESTAMP.
INSERT INTO "studioflow"."sf_phase_template"
  ("id", "key", "name", "sort_order", "has_rounds", "round_prefix", "folder_key", "requires_internal_approval", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'moodboard',   'Moodboard',  1, true,  'MB',     'moodboard',  false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'layout',      'Layout',     2, true,  'Layout', 'layout',     false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'design_3d',   '3D',         3, true,  'D',      '3d',         false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cd',          'CD',         4, true,  'CD',     'cd',         false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'supervision', 'Supervisi',  5, false, NULL,     'supervision',false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ── Client ────────────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_client" (
  "id"            TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "contact_name"  TEXT,
  "contact_phone" TEXT,
  "contact_email" TEXT,
  "address"       TEXT,
  "notes"         TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  "deleted_at"    TIMESTAMP(3),
  CONSTRAINT "sf_client_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sf_client_deleted_at_idx" ON "studioflow"."sf_client"("deleted_at");

-- ── Project ───────────────────────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_project" (
  "id"           TEXT                            NOT NULL,
  "code"         TEXT                            NOT NULL,
  "name"         TEXT                            NOT NULL,
  "client_id"    TEXT                            NOT NULL,
  "lead_user_id" TEXT,
  "location"     TEXT,
  "address"      TEXT,
  "area"         DECIMAL(10,2),
  "type"         "studioflow"."sf_project_type"   NOT NULL,
  "status"       "studioflow"."sf_project_status" NOT NULL DEFAULT 'ACTIVE',
  "priority"     INTEGER                         NOT NULL DEFAULT 0,
  "opened_at"    TIMESTAMP(3)                    NOT NULL,
  "created_at"   TIMESTAMP(3)                    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3)                    NOT NULL,
  "deleted_at"   TIMESTAMP(3),
  CONSTRAINT "sf_project_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "sf_project_client_fk" FOREIGN KEY ("client_id")
    REFERENCES "studioflow"."sf_client"("id")
);

CREATE UNIQUE INDEX "sf_project_code_key"       ON "studioflow"."sf_project"("code");
CREATE        INDEX "sf_project_client_id_idx"  ON "studioflow"."sf_project"("client_id");
CREATE        INDEX "sf_project_status_idx"     ON "studioflow"."sf_project"("status");
CREATE        INDEX "sf_project_deleted_at_idx" ON "studioflow"."sf_project"("deleted_at");

-- ── Project phase (snapshot) ──────────────────────────────────────────────

CREATE TABLE "studioflow"."sf_project_phase" (
  "id"                          TEXT                               NOT NULL,
  "project_id"                  TEXT                               NOT NULL,
  "template_id"                 TEXT                               NOT NULL,
  "key"                         TEXT                               NOT NULL,
  "name"                        TEXT                               NOT NULL,
  "sort_order"                  INTEGER                            NOT NULL,
  "has_rounds"                  BOOLEAN                            NOT NULL,
  "round_prefix"                TEXT,
  "folder_key"                  TEXT,
  "requires_internal_approval"  BOOLEAN                            NOT NULL DEFAULT false,
  "state"       "studioflow"."sf_phase_state"        NOT NULL DEFAULT 'NOT_STARTED',
  "closed_at"                   TIMESTAMP(3),
  "closed_by_id"                TEXT,
  "closure_reason"              TEXT,
  "closure_kind" "studioflow"."sf_phase_closure_kind",
  "created_at"                  TIMESTAMP(3)                       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3)                       NOT NULL,
  CONSTRAINT "sf_project_phase_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "sf_project_phase_project_fk"  FOREIGN KEY ("project_id")
    REFERENCES "studioflow"."sf_project"("id"),
  CONSTRAINT "sf_project_phase_template_fk" FOREIGN KEY ("template_id")
    REFERENCES "studioflow"."sf_phase_template"("id"),
  CONSTRAINT "sf_project_phase_unique_key"  UNIQUE ("project_id", "key")
);

CREATE INDEX "sf_project_phase_project_sort_idx" ON "studioflow"."sf_project_phase"("project_id", "sort_order");
