-- SF-V2-E: full enum-to-definition migration (STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md §4.3, §10).
-- Drops sf_phase.key and the sf_phase_key enum; sf_phase.definition_id becomes required;
-- checklist templates target a phase definition instead of an enum value.
--
-- Legacy identity. The five pre-V2 phases are represented by five definitions with FIXED ids
-- (mirrored by LEGACY_PHASE_DEFINITION_IDS in src/apps/studioflow/domain/phase.ts). Runtime uses
-- these ids for exactly two things: the legacy Supervision completion command and the known
-- phase accent colours. Names and prefixes stay free to edit.
--   Mode A: the default template already holds exactly the five legacy definitions
--           (order 1..5 = MB, L, D, CD, SV) -> those rows are re-keyed to the fixed ids
--           (sf_phase.definition_id follows through ON UPDATE CASCADE).
--   Mode B: otherwise a separate inactive template "Legacy phases (migrated)" holds the five
--           fixed definitions and the default template is left untouched.
-- Existing phases keep their id, order, status, revisions and every snapshot value.

DO $$
DECLARE
  v_tpl     TEXT;
  v_shaped  BOOLEAN := FALSE;
  v_mb      CONSTANT TEXT := '00000000-0000-4000-8000-000000000101';
  v_layout  CONSTANT TEXT := '00000000-0000-4000-8000-000000000102';
  v_3d      CONSTANT TEXT := '00000000-0000-4000-8000-000000000103';
  v_cd      CONSTANT TEXT := '00000000-0000-4000-8000-000000000104';
  v_sv      CONSTANT TEXT := '00000000-0000-4000-8000-000000000105';
  v_legacy  CONSTANT TEXT := '00000000-0000-4000-8000-000000000100';
BEGIN
  SELECT id INTO v_tpl
  FROM "studioflow"."sf_phase_template"
  WHERE "is_default"
  ORDER BY "is_active" DESC, "created_at" ASC
  LIMIT 1;

  IF v_tpl IS NOT NULL THEN
    SELECT COUNT(*) = 5 AND BOOL_AND(("order_index", "prefix") IN ((1, 'MB'), (2, 'L'), (3, 'D'), (4, 'CD'), (5, 'SV')))
      INTO v_shaped
    FROM "studioflow"."sf_phase_definition"
    WHERE "template_id" = v_tpl;
  END IF;

  IF v_shaped THEN
    UPDATE "studioflow"."sf_phase_definition"
    SET "id" = CASE "order_index" WHEN 1 THEN v_mb WHEN 2 THEN v_layout WHEN 3 THEN v_3d WHEN 4 THEN v_cd ELSE v_sv END
    WHERE "template_id" = v_tpl;
  ELSE
    INSERT INTO "studioflow"."sf_phase_template" ("id", "name", "is_default", "is_active", "updated_at")
    VALUES (v_legacy, 'Legacy phases (migrated)', FALSE, FALSE, NOW());

    INSERT INTO "studioflow"."sf_phase_definition"
      ("id", "template_id", "name", "prefix", "order_index", "allow_parallel", "seat", "updated_at")
    VALUES
      (v_mb,     v_legacy, 'Moodboard',            'MB', 1, FALSE, 'designer', NOW()),
      (v_layout, v_legacy, 'Layout Plan',          'L',  2, TRUE,  'designer', NOW()),
      (v_3d,     v_legacy, '3D Design',            '3D', 3, TRUE,  'designer', NOW()),
      (v_cd,     v_legacy, 'Construction Drawing', 'CD', 4, TRUE,  'drafter',  NOW()),
      (v_sv,     v_legacy, 'Supervision',          'SV', 5, FALSE, 'designer', NOW());
  END IF;

  -- Phases that predate the definition bridge point at the fixed legacy definitions.
  UPDATE "studioflow"."sf_phase"
  SET "definition_id" = CASE "key"::TEXT
    WHEN 'MOODBOARD' THEN v_mb
    WHEN 'LAYOUT' THEN v_layout
    WHEN 'DESIGN_3D' THEN v_3d
    WHEN 'CD' THEN v_cd
    ELSE v_sv
  END
  WHERE "definition_id" IS NULL;

  -- Mode B only: keep the legacy Supervision behaviour for phases that were already keyed SUPERVISION.
  IF NOT v_shaped THEN
    UPDATE "studioflow"."sf_phase" SET "definition_id" = v_sv
    WHERE "key"::TEXT = 'SUPERVISION' AND "definition_id" <> v_sv;
  END IF;

  -- Checklist templates: enum value -> definition.
  ALTER TABLE "studioflow"."sf_checklist_template" ADD COLUMN "definition_id" TEXT;
  UPDATE "studioflow"."sf_checklist_template"
  SET "definition_id" = CASE "phase_key"::TEXT
    WHEN 'MOODBOARD' THEN v_mb
    WHEN 'LAYOUT' THEN v_layout
    WHEN 'DESIGN_3D' THEN v_3d
    WHEN 'CD' THEN v_cd
    ELSE v_sv
  END
  WHERE "phase_key" IS NOT NULL;
END $$;

-- Snapshots must be complete before the bridge goes away (older rows were backfilled by 20260917100000).
UPDATE "studioflow"."sf_phase" p
SET "name_snapshot" = d."name"
FROM "studioflow"."sf_phase_definition" d
WHERE p."definition_id" = d."id" AND p."name_snapshot" = '';

UPDATE "studioflow"."sf_phase" p
SET "prefix_snapshot" = d."prefix"
FROM "studioflow"."sf_phase_definition" d
WHERE p."definition_id" = d."id" AND p."prefix_snapshot" = '';

UPDATE "studioflow"."sf_phase" p
SET "seat_snapshot" = d."seat"
FROM "studioflow"."sf_phase_definition" d
WHERE p."definition_id" = d."id" AND p."seat_snapshot" = '';

-- sf_phase: definition is required and cannot be deleted while a project uses it.
ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "definition_id" SET NOT NULL;
ALTER TABLE "studioflow"."sf_phase" DROP CONSTRAINT "sf_phase_definition_id_fkey";
ALTER TABLE "studioflow"."sf_phase"
  ADD CONSTRAINT "sf_phase_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "studioflow"."sf_phase_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "name_snapshot" DROP DEFAULT;
ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "prefix_snapshot" DROP DEFAULT;
ALTER TABLE "studioflow"."sf_phase" ALTER COLUMN "seat_snapshot" DROP DEFAULT;
ALTER TABLE "studioflow"."sf_phase"
  ADD CONSTRAINT "sf_phase_snapshot_complete_check"
  CHECK ("name_snapshot" <> '' AND "prefix_snapshot" <> '' AND "seat_snapshot" IN ('designer', 'drafter'));

DROP INDEX "studioflow"."sf_phase_project_id_key_key";
ALTER TABLE "studioflow"."sf_phase" DROP COLUMN "key";

-- sf_checklist_template: definition target replaces the enum column (its index goes with the column).
ALTER TABLE "studioflow"."sf_checklist_template" DROP COLUMN "phase_key";
ALTER TABLE "studioflow"."sf_checklist_template"
  ADD CONSTRAINT "sf_checklist_template_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "studioflow"."sf_phase_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "sf_checklist_template_definition_id_is_active_sort_order_idx"
  ON "studioflow"."sf_checklist_template"("definition_id", "is_active", "sort_order");

DROP TYPE "studioflow"."sf_phase_key";
