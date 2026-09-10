-- Owner-authorized English copy correction.
-- Phase names are normally snapshots; this one-time update changes only the
-- exact legacy seed value and preserves owner-customized names.

UPDATE "studioflow"."sf_phase_template"
SET "name" = 'Supervision',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'supervision'
  AND "name" = 'Supervisi';

UPDATE "studioflow"."sf_project_phase"
SET "name" = 'Supervision',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'supervision'
  AND "name" = 'Supervisi';
