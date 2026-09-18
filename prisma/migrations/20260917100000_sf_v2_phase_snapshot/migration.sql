-- AlterTable: Add snapshot fields to sf_phase
ALTER TABLE "studioflow"."sf_phase"
ADD COLUMN "name_snapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN "prefix_snapshot" VARCHAR(4) NOT NULL DEFAULT '',
ADD COLUMN "seat_snapshot" TEXT NOT NULL DEFAULT 'designer';

-- Backfill snapshot fields from PHASE_BLUEPRINT for existing phases
-- Cast enum to text for CASE comparison
UPDATE "studioflow"."sf_phase" SET
  "name_snapshot" = CASE "key"::text
    WHEN 'MOODBOARD' THEN 'Moodboard'
    WHEN 'LAYOUT' THEN 'Layout Plan'
    WHEN 'DESIGN_3D' THEN '3D Design'
    WHEN 'CD' THEN 'Construction Drawing'
    WHEN 'SUPERVISION' THEN 'Supervision'
    ELSE "key"::text
  END,
  "prefix_snapshot" = CASE "key"::text
    WHEN 'MOODBOARD' THEN 'MB'
    WHEN 'LAYOUT' THEN 'L'
    WHEN 'DESIGN_3D' THEN '3D'
    WHEN 'CD' THEN 'CD'
    WHEN 'SUPERVISION' THEN 'SV'
    ELSE ''
  END,
  "seat_snapshot" = CASE "key"::text
    WHEN 'CD' THEN 'drafter'
    ELSE 'designer'
  END
WHERE "name_snapshot" = '' AND "prefix_snapshot" = '';
