-- A project's workflow is immutable with respect to later phase-template edits.
-- JSON null preserves the previous meaning for definitions without named steps while keeping the snapshot column required.
ALTER TABLE "studioflow"."sf_phase"
  ADD COLUMN "iteration_kinds_snapshot" JSONB;

UPDATE "studioflow"."sf_phase" AS phase
SET "iteration_kinds_snapshot" = COALESCE(definition."default_iteration_kinds", 'null'::jsonb)
FROM "studioflow"."sf_phase_definition" AS definition
WHERE definition."id" = phase."definition_id";

ALTER TABLE "studioflow"."sf_phase"
  ALTER COLUMN "iteration_kinds_snapshot" SET NOT NULL;
