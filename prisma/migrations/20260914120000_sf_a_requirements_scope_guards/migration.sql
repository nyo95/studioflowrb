-- SF-A correction: a phase requirement keeps its phase scope for its full
-- lifetime. Removing a project phase is therefore restricted while any
-- requirement row (including archived rows) still references it.

ALTER TABLE "studioflow"."sf_project_requirement"
  DROP CONSTRAINT "sf_project_requirement_phase_id_fkey";

ALTER TABLE "studioflow"."sf_project_requirement"
  ADD CONSTRAINT "sf_project_requirement_phase_id_fkey"
  FOREIGN KEY ("phase_id") REFERENCES "studioflow"."sf_project_phase"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
