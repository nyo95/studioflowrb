-- Owner decision 2026-10-13: a phase has at most two steps (e.g. CD Mall then CD Final). A third iteration kind would
-- be silently skipped by the two-step rule, so it is refused at the source.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "studioflow"."sf_phase_definition"
    WHERE "default_iteration_kinds" IS NOT NULL
      AND (jsonb_typeof("default_iteration_kinds") <> 'array' OR jsonb_array_length("default_iteration_kinds") > 2)
  ) THEN
    RAISE EXCEPTION 'A phase definition has more than two iteration kinds; reduce it to two before this migration';
  END IF;
END $$;

ALTER TABLE "studioflow"."sf_phase_definition"
  ADD CONSTRAINT "sf_phase_definition_iteration_kinds_max_two"
  CHECK ("default_iteration_kinds" IS NULL OR (jsonb_typeof("default_iteration_kinds") = 'array' AND jsonb_array_length("default_iteration_kinds") <= 2));
