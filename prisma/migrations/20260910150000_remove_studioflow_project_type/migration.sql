-- Project type was not supported by the audited legacy workflow and is not a
-- rebuild-owned product concept. Remove the speculative persisted field.
ALTER TABLE "studioflow"."sf_project"
  DROP COLUMN "type";

DROP TYPE "studioflow"."sf_project_type";
