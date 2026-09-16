-- SF-V2 Phase Engine additions (STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md).
-- Owner-authorized 2026-09-16 (V2-D2, V2-D3, V2-D8).
-- Additive migration only — no existing tables or rows are altered.
-- Apply only to studioflow-rebuild databases.

-- ── V2-D3: Phase Template + Definition ────────────────────────────────────

CREATE TABLE "studioflow"."sf_phase_template" (
  "id"         TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "is_default" BOOLEAN     NOT NULL DEFAULT false,
  "is_active"  BOOLEAN     NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_phase_template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sf_phase_template_name_key" ON "studioflow"."sf_phase_template"("name");

CREATE TABLE "studioflow"."sf_phase_definition" (
  "id"             TEXT         NOT NULL,
  "template_id"    TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "prefix"         VARCHAR(4)   NOT NULL,
  "order_index"    INTEGER      NOT NULL,
  "allow_parallel" BOOLEAN      NOT NULL DEFAULT false,
  "seat"           TEXT         NOT NULL DEFAULT 'designer',
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_phase_definition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_phase_definition_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "studioflow"."sf_phase_template"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sf_phase_definition_template_id_order_index_key"
  ON "studioflow"."sf_phase_definition"("template_id", "order_index");

-- Bridge column: null for phases created before v2 (replaced in V2-E).
ALTER TABLE "studioflow"."sf_phase"
  ADD COLUMN "definition_id" TEXT;

ALTER TABLE "studioflow"."sf_phase"
  ADD CONSTRAINT "sf_phase_definition_id_fkey"
    FOREIGN KEY ("definition_id") REFERENCES "studioflow"."sf_phase_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── V2-D2: Requirement (warning-only, never blocks) ───────────────────────

CREATE TABLE "studioflow"."sf_requirement" (
  "id"            TEXT         NOT NULL,
  "project_id"    TEXT         NOT NULL,
  "phase_id"      TEXT,
  "title"         TEXT         NOT NULL,
  "description"   TEXT,
  "is_met"        BOOLEAN      NOT NULL DEFAULT false,
  "met_at"        TIMESTAMP(3),
  "met_by_id"     TEXT,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_requirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_requirement_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sf_requirement_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sf_requirement_project_id_phase_id_idx"
  ON "studioflow"."sf_requirement"("project_id", "phase_id");

-- ── V2-D8: Deliverable (warning-only, status computed from revision) ──────

CREATE TABLE "studioflow"."sf_deliverable" (
  "id"              TEXT         NOT NULL,
  "project_id"      TEXT         NOT NULL,
  "phase_id"        TEXT         NOT NULL,
  "revision_id"     TEXT,
  "name"            TEXT         NOT NULL,
  "storage_key"     TEXT         NOT NULL,
  "file_size_bytes" INTEGER,
  "content_type"    TEXT,
  "created_by_id"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sf_deliverable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sf_deliverable_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "studioflow"."sf_project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sf_deliverable_phase_id_fkey"
    FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_phase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sf_deliverable_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "studioflow"."sf_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "sf_deliverable_project_id_phase_id_idx"
  ON "studioflow"."sf_deliverable"("project_id", "phase_id");

-- ── Seed: default phase template matching PHASE_BLUEPRINT ─────────────────
-- This seeds the template that new projects will snapshot from.
-- Mirrors PHASE_BLUEPRINT in domain/phase.ts.

INSERT INTO "studioflow"."sf_phase_template" ("id", "name", "is_default", "is_active", "updated_at")
VALUES (gen_random_uuid()::TEXT, 'Standard', true, true, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO "studioflow"."sf_phase_definition"
  ("id", "template_id", "name", "prefix", "order_index", "allow_parallel", "seat", "updated_at")
SELECT
  gen_random_uuid()::TEXT,
  t.id,
  pd.name,
  pd.prefix,
  pd.order_index,
  pd.allow_parallel,
  pd.seat,
  NOW()
FROM "studioflow"."sf_phase_template" t,
  (VALUES
    ('Moodboard',             'MB', 1, false, 'designer'),
    ('Layout Plan',           'L',  2, true,  'designer'),
    ('Design 3D',             'D',  3, true,  'designer'),
    ('Construction Drawing',  'CD', 4, true,  'drafter'),
    ('Supervision',           'SV', 5, false, 'designer')
  ) AS pd(name, prefix, order_index, allow_parallel, seat)
WHERE t.name = 'Standard'
ON CONFLICT DO NOTHING;

-- V2-D1: Change sf_activity.mode default to FEEDBACK (SfActivity is now FEEDBACK-only)
ALTER TABLE "studioflow"."sf_activity" ALTER COLUMN "mode" SET DEFAULT 'FEEDBACK';
